// Enemy wave system — Level 1, Sea 1-A style.
// Ships enter from the left or right edge, sail through their dead-zone
// strip (no-fire allowed there) and stop just past the playfield boundary,
// at the same vertical band as the player ship. Each ship has a Target
// sprite (the red/white bullseye) anchored to its deck; only target hits
// deal damage. After a ship is sunk, the next one spawns from the
// opposite side after a short gap. After TOTAL_SHIPS_TO_SINK kills the
// level is complete.
//
// Ship ↔ target linking: each spawn gets a unique `shipId` (from a
// scene-variable counter). Both the Enemy and its Target store the id
// in their object variables.
//
// All persistent state lives on scene / object variables because the
// bundled IIFE re-runs every frame and module scope resets.

import {all, spawn, ObjectName} from "./entities.js";
import * as proj from "./projectiles.js";
import {deadZoneInset} from "./background.js";

// Enemy fire rate slowed by 30% vs the prior 3.0 s (= 3.9 s between
// shots) to give the player room to breathe on the first ship.
const FIRE_INTERVAL_SEC = 3.9;
// Per-ship magazine: 3 shots, then a 3.25 s reload. No HUD indicator
// for the player — they have to count the muzzle flashes themselves.
const ENEMY_MAGAZINE = 3;
const ENEMY_RELOAD_SEC = 3.25;
const SPAWN_GAP_SEC = 1.0;
const ENTRY_SPEED_PX_PER_SEC = 220;
// First Carrack HP — 2 HP / 1 weak-point hit takes it down per the
// updated design. Bumps for sturdier ship variants will live elsewhere.
const INITIAL_HP = 2;
const TOTAL_SHIPS_TO_SINK = 3;

// Hit-flash visuals. Sprite tint defaults to "255;255;255" (no tint);
// we briefly tint the ship and restore once the timer elapses.
const FLASH_DURATION_SEC = 0.15;
const FLASH_COLOR_DIRECT = "255;255;255";  // direct hit — pinkish-white tint reads as a "white" flash
const FLASH_COLOR_OFFTARGET = "200;200;80"; // off-target — dull yellow tint
const FLASH_COLOR_NONE = "255;255;255";
const FLASH_OPACITY_DIRECT = 160;          // semi-transparent for direct hit (combines with tint)
const FLASH_OPACITY_DEFAULT = 255;

// Health bar sits 12 px above the ship. Native bar is 60 wide; we scale
// only the foreground X based on the HP fraction.
const HEALTHBAR_OFFSET_Y = -16;
const HEALTHBAR_NATIVE_W = 60;

// Stop position offset from the dead-zone boundary, inward toward the
// player. The ship's actual width is queried at runtime (image-driven),
// so the maths works for any ship sprite size.
const STOP_INSIDE_PLAYFIELD_PX = 6;

// Target placement — on the HULL (lower half of the ship), where the
// crew and powder magazine would be. Aim lands here so direct hits
// damage what hurts the ship, not the sails.
const TARGET_OFFSET_FRAC_X = 0.50;
const TARGET_OFFSET_FRAC_Y = 0.70;

const SUNK_COUNT_VAR = "__shipsSunk";
const NEXT_SIDE_VAR = "__nextSide"; // 0 = left, 1 = right
const SPAWN_TIMER_VAR = "__spawnTimer";
const INIT_FLAG_VAR = "__enemyInit";
const SHIP_ID_COUNTER = "__shipIdCounter";

type Side = "left" | "right";

function nextShipId(scene: GdjsRuntimeScene): number {
  const counter = scene.getVariables().get(SHIP_ID_COUNTER);
  const id = counter.getAsNumber() + 1;
  counter.setNumber(id);
  return id;
}

function findTargetForShip(scene: GdjsRuntimeScene, shipId: number): GdjsRuntimeObject | null {
  for (const t of all(scene, ObjectName.Target)) {
    if (t.getVariables().get("shipId").getAsNumber() === shipId) return t;
  }
  return null;
}

export function findShipForTarget(scene: GdjsRuntimeScene, target: GdjsRuntimeObject): GdjsRuntimeObject | null {
  const id = target.getVariables().get("shipId").getAsNumber();
  for (const e of all(scene, ObjectName.Enemy)) {
    if (e.getVariables().get("shipId").getAsNumber() === id) return e;
  }
  return null;
}

// Vertical band where enemy ships sail — just below the sky strip.
const ENEMY_Y = 140;

function spawnShip(scene: GdjsRuntimeScene, side: Side): GdjsRuntimeObject | null {
  const w = scene.getGame().getGameResolutionWidth();
  const dz = deadZoneInset();
  const y = ENEMY_Y;
  // Spawn off-screen at a fixed x; size-aware reposition once we read
  // the sprite's width.
  const e = spawn(scene, ObjectName.Enemy, side === "left" ? -400 : w + 400, y);
  if (!e) return null;
  const ew = e.getWidth();
  const startX = side === "left" ? -ew - 8 : w + 8;
  const playfieldLeft = dz + STOP_INSIDE_PLAYFIELD_PX;
  const playfieldRight = w - dz - STOP_INSIDE_PLAYFIELD_PX - ew;
  // With one ship at a time and a wide sprite, stop in the centre of
  // the playfield so left- and right-spawning ships both end up near
  // the screen middle. (Slight side offset for visual variety.)
  const centeredX = (playfieldLeft + playfieldRight) / 2;
  const targetX = side === "left" ? centeredX - 8 : centeredX + 8;
  e.setX(startX);
  e.setY(y);
  const id = nextShipId(scene);
  const v = e.getVariables();
  v.get("shipId").setNumber(id);
  v.get("hp").setNumber(INITIAL_HP);
  v.get("maxHp").setNumber(INITIAL_HP);
  v.get("state").setNumber(0); // 0 = entering (in dead zone), 1 = fighting
  v.get("targetX").setNumber(targetX);
  v.get("fireTimer").setNumber(0);
  v.get("flashTimer").setNumber(0);
  v.get("ammo").setNumber(ENEMY_MAGAZINE);
  v.get("reloadTimer").setNumber(0);

  const t = spawn(scene, ObjectName.Target,
    startX + ew * TARGET_OFFSET_FRAC_X,
    y + e.getHeight() * TARGET_OFFSET_FRAC_Y,
  );
  if (t) t.getVariables().get("shipId").setNumber(id);

  console.log(`[enemy] spawn ${side} id=${id} ${ew}×${e.getHeight()} → target x=${targetX}`);
  return e;
}

function findHealthBarsForShip(scene: GdjsRuntimeScene, shipId: number): {
  bg: GdjsRuntimeObject | null;
  fg: GdjsRuntimeObject | null
} {
  let bg: GdjsRuntimeObject | null = null;
  let fg: GdjsRuntimeObject | null = null;
  for (const b of all(scene, ObjectName.HealthBarBg)) {
    if (b.getVariables().get("shipId").getAsNumber() === shipId) {
      bg = b;
      break;
    }
  }
  for (const f of all(scene, ObjectName.HealthBar)) {
    if (f.getVariables().get("shipId").getAsNumber() === shipId) {
      fg = f;
      break;
    }
  }
  return {bg, fg};
}

function spawnHealthBar(scene: GdjsRuntimeScene, shipId: number, x: number, y: number): void {
  const bg = spawn(scene, ObjectName.HealthBarBg, x, y);
  if (bg) {
    bg.getVariables().get("shipId").setNumber(shipId);
    bg.setZOrder(4);
  }
  const fg = spawn(scene, ObjectName.HealthBar, x, y);
  if (fg) {
    fg.getVariables().get("shipId").setNumber(shipId);
    fg.setZOrder(5);
  }
}

function despawnHealthBar(scene: GdjsRuntimeScene, shipId: number): void {
  const {bg, fg} = findHealthBarsForShip(scene, shipId);
  if (bg) bg.deleteFromScene(scene);
  if (fg) fg.deleteFromScene(scene);
}

function syncHealthBar(scene: GdjsRuntimeScene, enemy: GdjsRuntimeObject): void {
  const v = enemy.getVariables();
  const shipId = v.get("shipId").getAsNumber();
  const {bg, fg} = findHealthBarsForShip(scene, shipId);
  if (!bg && !fg) return;
  const hp = v.get("hp").getAsNumber();
  const maxHp = v.get("maxHp").getAsNumber();
  const frac = maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 0;
  const w = enemy.getWidth();
  const cx = enemy.getX() + w / 2;
  const y = enemy.getY() + HEALTHBAR_OFFSET_Y;
  if (bg) {
    bg.setX(cx - HEALTHBAR_NATIVE_W / 2);
    bg.setY(y);
  }
  if (fg) {
    fg.setX(cx - HEALTHBAR_NATIVE_W / 2);
    fg.setY(y);
    fg.setWidth(HEALTHBAR_NATIVE_W * frac);
  }
}

/** Trigger a brief hit-flash on the ship. Color choice indicates whether
 *  the player hit the weak spot (white) or the body (yellow). */
export function flash(enemy: GdjsRuntimeObject, direct: boolean): void {
  const v = enemy.getVariables();
  v.get("flashTimer").setNumber(FLASH_DURATION_SEC);
  enemy.setColor(direct ? FLASH_COLOR_DIRECT : FLASH_COLOR_OFFTARGET);
  if (direct) enemy.setOpacity(FLASH_OPACITY_DIRECT);
}

/** Damage the parent ship. Returns true when this hit destroyed it. */
export function damage(scene: GdjsRuntimeScene, enemy: GdjsRuntimeObject, amount: number): boolean {
  const hpVar = enemy.getVariables().get("hp");
  const next = hpVar.getAsNumber() - amount;
  hpVar.setNumber(next);
  if (next <= 0) {
    const id = enemy.getVariables().get("shipId").getAsNumber();
    const t = findTargetForShip(scene, id);
    if (t) t.deleteFromScene(scene);
    despawnHealthBar(scene, id);
    enemy.deleteFromScene(scene);
    const sunk = scene.getVariables().get(SUNK_COUNT_VAR);
    sunk.setNumber(sunk.getAsNumber() + 1);
    scene.getVariables().get(SPAWN_TIMER_VAR).setNumber(0);
    console.log(`[enemy] sunk id=${id} (${sunk.getAsNumber()}/${TOTAL_SHIPS_TO_SINK})`);
    return true;
  }
  console.log(`[enemy] hit hp=${next}`);
  return false;
}

export function shipsSunk(scene: GdjsRuntimeScene): number {
  return scene.getVariables().get(SUNK_COUNT_VAR).getAsNumber();
}

export function totalShips(): number {
  return TOTAL_SHIPS_TO_SINK;
}

export function isLevelComplete(scene: GdjsRuntimeScene): boolean {
  return shipsSunk(scene) >= TOTAL_SHIPS_TO_SINK;
}

export function tick(scene: GdjsRuntimeScene, dt: number, cannonX: number, cannonY: number): void {
  const vars = scene.getVariables();

  if (vars.get(INIT_FLAG_VAR).getAsNumber() === 0) {
    vars.get(INIT_FLAG_VAR).setNumber(1);
    spawnShip(scene, "left");
    vars.get(NEXT_SIDE_VAR).setNumber(1);
    return;
  }

  const enemies = all(scene, ObjectName.Enemy);

  if (enemies.length === 0) {
    if (isLevelComplete(scene)) return;
    const t = vars.get(SPAWN_TIMER_VAR).getAsNumber() + dt;
    if (t >= SPAWN_GAP_SEC) {
      vars.get(SPAWN_TIMER_VAR).setNumber(0);
      const sideBit = vars.get(NEXT_SIDE_VAR).getAsNumber();
      spawnShip(scene, sideBit === 0 ? "left" : "right");
      vars.get(NEXT_SIDE_VAR).setNumber(1 - sideBit);
    } else {
      vars.get(SPAWN_TIMER_VAR).setNumber(t);
    }
    return;
  }

  for (const e of enemies) {
    const v = e.getVariables();
    const stateVal = v.get("state").getAsNumber();
    if (stateVal === 0) {
      // Entering: drift through the dead zone toward the stop position.
      const target = v.get("targetX").getAsNumber();
      const x = e.getX();
      const dir = target > x ? 1 : -1;
      const nx = x + dir * ENTRY_SPEED_PX_PER_SEC * dt;
      if ((dir === 1 && nx >= target) || (dir === -1 && nx <= target)) {
        e.setX(target);
        v.get("state").setNumber(1);
        v.get("fireTimer").setNumber(0);
        // Health bar appears the moment the ship enters firing distance.
        const shipId = v.get("shipId").getAsNumber();
        spawnHealthBar(scene, shipId, e.getX(), e.getY() + HEALTHBAR_OFFSET_Y);
        console.log(`[enemy] arrived at ${target} (now firing)`);
      } else {
        e.setX(nx);
      }
    } else {
      // Fighting: in the playfield, fire on the timer — but only when
      // the ship has ammo. After firing 3 shots the ship reloads
      // silently for ENEMY_RELOAD_SEC seconds; no visual indicator, so
      // the player has to count the muzzles to know when it's safe.
      const reload = v.get("reloadTimer").getAsNumber();
      if (reload > 0) {
        const next = Math.max(0, reload - dt);
        v.get("reloadTimer").setNumber(next);
        if (next === 0) v.get("ammo").setNumber(ENEMY_MAGAZINE);
        v.get("fireTimer").setNumber(0); // reset cycle so the first
        // post-reload shot doesn't fire
        // immediately.
      } else {
        const ft = v.get("fireTimer").getAsNumber() + dt;
        if (ft >= FIRE_INTERVAL_SEC) {
          v.get("fireTimer").setNumber(0);
          // Fire from the ship's port-side cannon position. xArcAmp
          // pushes the ball outward before curving back toward the
          // player, matching the GDD "Ball Trajectory" sketch.
          const ew = e.getWidth();
          const eh = e.getHeight();
          const sideX = e.getX() + ew * 0.72;
          const sideY = e.getY() + eh * 0.38;
          proj.fire(scene, ObjectName.EnemyBall, sideX, sideY, cannonX, cannonY, {xArcAmp: 100});
          const ammoLeft = v.get("ammo").getAsNumber() - 1;
          v.get("ammo").setNumber(ammoLeft);
          if (ammoLeft <= 0) {
            v.get("reloadTimer").setNumber(ENEMY_RELOAD_SEC);
          }
        } else {
          v.get("fireTimer").setNumber(ft);
        }
      }
    }

    // Glue the weak-point target to the ship's deck every frame.
    const id = v.get("shipId").getAsNumber();
    const t = findTargetForShip(scene, id);
    if (t) {
      t.setX(e.getX() + e.getWidth() * TARGET_OFFSET_FRAC_X);
      t.setY(e.getY() + e.getHeight() * TARGET_OFFSET_FRAC_Y);
    }

    // Decay the hit-flash tint and restore default appearance when done.
    const flashTimerVar = v.get("flashTimer");
    const flashLeft = flashTimerVar.getAsNumber();
    if (flashLeft > 0) {
      const next = Math.max(0, flashLeft - dt);
      flashTimerVar.setNumber(next);
      if (next <= 0) {
        e.setColor(FLASH_COLOR_NONE);
        e.setOpacity(FLASH_OPACITY_DEFAULT);
      }
    }

    // Keep the health bar glued to the ship while it's in fighting state.
    if (stateVal === 1) syncHealthBar(scene, e);
  }
}
