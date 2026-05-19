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

const FIRE_INTERVAL_SEC = 2.2;
const SPAWN_GAP_SEC = 1.0;
const ENTRY_SPEED_PX_PER_SEC = 220;
const ENEMY_BALL_SPEED = 300;
const INITIAL_HP = 3;
const TOTAL_SHIPS_TO_SINK = 3;

// Stop position offset from the dead-zone boundary, inward toward the
// player. The ship's actual width is queried at runtime (image-driven),
// so the maths works for any ship sprite size.
const STOP_INSIDE_PLAYFIELD_PX = 6;

// Target placement on the ship's deck, expressed as fractions of the
// ship sprite's width / height. With a 221×181 ship sprite that puts
// the target around (0.55*221, 0.30*181) = (122, 54) — roughly the
// upper-middle of the hull where a striped weak point would sit.
const TARGET_OFFSET_FRAC_X = 0.55;
const TARGET_OFFSET_FRAC_Y = 0.30;

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
  v.get("state").setNumber(0); // 0 = entering (in dead zone), 1 = fighting
  v.get("targetX").setNumber(targetX);
  v.get("fireTimer").setNumber(0);

  const t = spawn(scene, ObjectName.Target,
    startX + ew * TARGET_OFFSET_FRAC_X,
    y + e.getHeight() * TARGET_OFFSET_FRAC_Y,
  );
  if (t) t.getVariables().get("shipId").setNumber(id);

  console.log(`[enemy] spawn ${side} id=${id} ${ew}×${e.getHeight()} → target x=${targetX}`);
  return e;
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
        console.log(`[enemy] arrived at ${target} (now firing)`);
      } else {
        e.setX(nx);
      }
    } else {
      // Fighting: in the playfield, fire on the timer.
      const ft = v.get("fireTimer").getAsNumber() + dt;
      if (ft >= FIRE_INTERVAL_SEC) {
        v.get("fireTimer").setNumber(0);
        const ex = e.getCenterX();
        const ey = e.getCenterY();
        proj.fire(scene, ObjectName.EnemyBall, ex, ey, cannonX - ex, cannonY - ey, ENEMY_BALL_SPEED);
      } else {
        v.get("fireTimer").setNumber(ft);
      }
    }

    // Glue the weak-point target to the ship's deck every frame.
    const id = v.get("shipId").getAsNumber();
    const t = findTargetForShip(scene, id);
    if (t) {
      t.setX(e.getX() + e.getWidth() * TARGET_OFFSET_FRAC_X);
      t.setY(e.getY() + e.getHeight() * TARGET_OFFSET_FRAC_Y);
    }
  }
}
