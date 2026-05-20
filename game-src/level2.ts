// Level 2 — vertical scroller. The player's ship is hauled up the
// Duke's fortress on a climbing platform: the cannon + railing stay
// fixed at the bottom (same framing as Level 1) while a stone wall and
// a procession of enemies scroll DOWN the screen to fake the climb.
//
// This is a high-fidelity MOCK: enemies are colour-tinted placeholder
// boxes with a text label saying what they are (real art to follow).
// It implements the spine of the GDD level:
//   - slow vertical scroll, halting at "big" encounters until cleared
//   - a Power Meter on the left (the Duke's disguised health) that
//     drains as encounters are destroyed; emptying it wins the level
//   - enemies that fire at the cannon (reusing the projectile pool)
//   - the Catch-Can mechanic: a centred enemy shot caught at the muzzle
//     arms a free double-damage (red) return shot, with a flashing
//     on-screen prompt
//
// Deferred (documented for later): the exact phase-by-phase
// choreography, iron-gate / cooldown states, wind resistance, and the
// cannon-corridor set piece from game-design-level-2.md.

import {all, firstOrNull, spawn, ObjectName} from "./entities.js";
import * as proj from "./projectiles.js";
import * as state from "./state.js";
import * as shake from "./shake.js";
import * as cannonMod from "./cannon.js";
import {TARGET_BAND_Y} from "./cannon.js";
import * as audio from "./audio.js";
import * as vfx from "./vfx.js";
import * as popup from "./popup.js";

const SCROLL_SPEED_PX = 48;     // climb speed when not halted (48 − 30%)
const WALL_TILE_H = 220;          // matches the wall-tile.png height
const WALL_TILE_COUNT = 5;        // enough to cover any viewport + cycle
const ENEMY_FIRE_INTERVAL = 2.6;  // seconds between an enemy's shots
const ENEMY_BALL_SPEED_UNUSED = 0; // (projectiles are time-based, kept for clarity)
const CATCHABLE_EVERY = 3;        // every Nth enemy shot is a catchable centred ball
const CATCH_TEXT_SEC = 2.0;       // how long the Catch-Can prompt shows
const SHAKE_INTENSITY_PX = 14;
const SHAKE_DURATION_SEC = 0.35;

// Where a halting encounter settles (its centre Y) before the player
// must clear it. Roughly the upper-middle of the playfield.
const HALT_STOP_Y = 250;

const Z_WALL = -20;
const Z_ENEMY = 0;
const Z_LABEL = 1;
const Z_TUT_HINT = 40;
const Z_POWER = 30;
const Z_CATCH_TEXT = 60;

// Phase 1 tutorial: a hazard container nestled on the side of the rock
// with a flashing red light. The climb does not begin until the player
// blows it up.
const TUT_HP = 2;

// ── Phase 2 catch-can lesson ──
// A single cannon teaches the catch-can mechanic before the level lets
// loose. First an AUTOMATIC demo (the cannon fires dead-centre, the
// player's cannon snaps to 0° and catches it for free), then the player
// is enticed to do it themselves on a second cannon. The climb holds and
// no other cannons spawn until the lesson is finished.
const P2 = {
  IDLE: 0,          // not in the lesson
  DEMO_SCROLL: 1,   // demo cannon scrolling into view (climb continues)
  DEMO_SETTLE: 2,   // demo cannon settled, brief beat
  DEMO_FLASH: 3,    // demo cannon flashing (about to fire)
  DEMO_FLIGHT: 4,   // centred ball in flight; cannon auto-corrects to 0°
  DEMO_CAUGHT: 5,   // auto-caught; "fire back!" — waiting on the player
  DEMO_EXPLODE: 6,  // return shot away; waiting for the cannon to blow
  LEARN_SCROLL: 7,  // second cannon scrolling into view
  LEARN_SETTLE: 8,  // second cannon settled; "now you try"
  LEARN_FLASH: 9,   // second cannon flashing
  LEARN_FLIGHT: 10, // centred ball; player must centre + catch (no auto)
  LEARN_CAUGHT: 11, // player caught it; waiting for the return shot
  LEARN_EXPLODE: 12, // return shot away; waiting for the cannon to blow
  DONE: 13,         // lesson complete; the rest of the wave is released
} as const;
const P2_FLASH_SEC = 1.1;       // how long a cannon flashes before firing
const P2_SETTLE_SEC = 0.7;      // beat after a lesson cannon appears
const P2_CANNON_CY = 240;       // lesson cannon centre Y (inside the player target band)
const P2_SCROLL_IN_MUL = 2.5;   // climb speed-up while scrolling a lesson cannon in
// Catch is now DIRECTION-based: the bore must point at the incoming ball
// (within this angle) and the ball must be near the muzzle — so the
// player aims the barrel into the ball's path rather than always centring.
const CATCH_ANGLE_TOL_DEG = 26; // bore must point within this of the ball
const CATCH_RADIUS_PX = 100;    // ...and the ball must be this close to the muzzle
const CATCH_SIDE_OFFSET_DEG = 12; // how far off-centre side catch-shots are aimed
const PARRY_FLASH_SEC = 1.4;    // PARRY prompt flashes ~twice when a red ball is incoming

// Enemy cannons stop firing once they scroll more than this far below the
// line the player's shots can reach — you shouldn't be shot by something
// you can no longer hit back.
const ENEMY_FIRE_CUTOFF_Y = TARGET_BAND_Y + 150;

// ── Enemy archetypes ──
interface EnemyType {
  key: string;
  label: string;
  color: string;   // "R;G;B" tint for the placeholder box
  hp: number;
  w: number;
  h: number;
  fires: boolean;
  firesRed?: boolean; // fires slow red wobbling balls that must be parried back
  isWall?: boolean;   // small "rock wall" container — part of the bonus run
  halts: boolean;  // does it stop the climb until destroyed?
  drain: number;   // how much Power Meter it removes when destroyed
}

const TYPES: Record<string, EnemyType> = {
  container: {
    key: "container",
    label: "CONTAINER\nHP 2",
    color: "235;205;70",
    hp: 2,
    w: 110,
    h: 110,
    fires: false,
    halts: false,
    drain: 8
  },
  cannon: {
    key: "cannon",
    label: "CANNON MIP\nHP 1",
    color: "220;80;60",
    hp: 1,
    w: 90,
    h: 90,
    fires: true,
    halts: false,
    drain: 6
  },
  redcannon: {
    key: "redcannon",
    label: "RED CANNON\nHP 1",
    color: "220;60;60",
    hp: 1,
    w: 90,
    h: 90,
    fires: true,
    firesRed: true,
    halts: false,
    drain: 6
  },
  wallcan: {
    key: "wallcan",
    label: "CTNR\nHP 1",
    color: "235;205;70",
    hp: 1,
    w: 64,
    h: 64,
    fires: false,
    isWall: true,
    halts: false,
    drain: 4
  },
  containment: {
    key: "containment",
    label: "CONTAINMENT\nHP 4",
    color: "235;145;55",
    hp: 4,
    w: 230,
    h: 230,
    fires: false,
    halts: true,
    drain: 26
  },
  station: {
    key: "station",
    label: "POWER STATION\nHP 6",
    color: "190;55;95",
    hp: 6,
    w: 250,
    h: 170,
    fires: true,
    halts: true,
    drain: 34
  },
};

// Which sprite object each type spawns as. Types with real art use a
// dedicated sprite; "station" still uses the tinted placeholder box.
const TYPE_OBJECT: Record<string, ObjectName> = {
  container: ObjectName.Reactor,      // reactor.webp
  cannon: ObjectName.EnemyCannon,     // cannon.webp, rotated 180° (muzzle south)
  redcannon: ObjectName.EnemyCannon,  // same art; fires red balls
  wallcan: ObjectName.Reactor,        // small reactor.webp container
  containment: ObjectName.Factory,    // factory.webp
  station: ObjectName.L2Enemy,        // placeholder box + label
};

// All sprite object types that can be an enemy, so the gameplay loop can
// iterate them uniformly regardless of which art they use.
const ENEMY_OBJECTS: ObjectName[] = [
  ObjectName.L2Enemy, ObjectName.Reactor, ObjectName.Factory, ObjectName.EnemyCannon,
  ObjectName.TutContainer,
];

function allEnemies(scene: GdjsRuntimeScene): GdjsRuntimeObject[] {
  let list: GdjsRuntimeObject[] = [];
  for (const name of ENEMY_OBJECTS) list = list.concat(all(scene, name));
  return list;
}

// Spawn schedule. `xFrac` is the horizontal centre as a fraction of the
// playfield width. Enemies spawn in order, gated by SPAWN_GAP seconds
// of scrolling between them (paused while halted).
interface WaveEntry {
  type: string;
  xFrac: number;
}

// Sentinel wave entry: when the spawner reaches it, it hands control to
// the scripted Phase-2 catch-can lesson (see tickPhase2Intro) instead of
// spawning an enemy. The rest of the wave is held until the lesson ends.
const P2_INTRO = "p2intro";
const WAVE: WaveEntry[] = [
  // Phase 1 — containment tutorial. No enemy cannons yet.
  {type: "container", xFrac: 0.30},  // Ctnr 1
  {type: "container", xFrac: 0.70},  // Ctnr 2
  {type: "containment", xFrac: 0.5},   // Big Containment — halts the climb
  // Phase 2 — catch-can lesson, then the live gauntlet (camera keeps
  // scrolling; no halts between these).
  {type: P2_INTRO, xFrac: 0.5},   // scripted: teaches catch-can with 2 cannons
  {type: "cannon", xFrac: 0.35},  // 2nd cannon — off-centre black shot, parry
  {type: "cannon", xFrac: 0.65},  // 3rd cannon — black shot, parry
  {type: "redcannon", xFrac: 0.5},   // red ball — PARRY (return it)
  {type: "redcannon", xFrac: 0.42},  // red ball — PARRY (last time)
  {type: "cannon", xFrac: 0.6},   // black cannonball — parry
  // Small containers along the rock wall — clear them all for full health.
  {type: "wallcan", xFrac: 0.12},
  {type: "wallcan", xFrac: 0.88},
  {type: "wallcan", xFrac: 0.15},
  {type: "wallcan", xFrac: 0.85},
  // Phase 3 — armed power station.
  {type: "station", xFrac: 0.5},   // halts the climb
];
const SPAWN_GAP_SEC = 2.4;
const WALL_RUN_COUNT = 4; // number of wallcan entries above
// Two cannons are spawned by the scripted intro (not in TYPES-driven WAVE
// entries), so add their drain to the budget explicitly.
const INTRO_CANNON_COUNT = 2;
const POWER_MAX =
  WAVE.reduce((sum, w) => sum + (TYPES[w.type]?.drain ?? 0), 0)
  + INTRO_CANNON_COUNT * TYPES.cannon!.drain;

// Scene-variable keys.
const V_INIT = "__l2Init";
const V_WAVE_IDX = "__l2WaveIdx";
const V_SPAWN_TIMER = "__l2SpawnTimer";
const V_POWER_LEFT = "__l2PowerLeft"; // remaining drain budget; 0 = level won
const V_HALTED = "__l2Halted";
const V_ENEMY_ID = "__l2EnemyId";
const V_CATCH_ARMED = "__l2CatchArmed";
const V_CATCH_TEXT_T = "__l2CatchTextTimer";
const V_SHOT_COUNTER = "__l2ShotCounter"; // counts enemy shots for catchable cadence
const V_TUT_DONE = "__l2TutDone";         // 0 = climb gated on the tutorial container
const V_TUT_T = "__l2TutTimer";           // accumulator for the warning-light pulse
const V_P2 = "__l2P2State";               // Phase-2 catch-can lesson state (see P2 enum)
const V_P2_T = "__l2P2Timer";             // per-state timer for the lesson
const V_P2_CANNON = "__l2P2CannonId";     // enemyId of the current lesson cannon
const V_P2_CATCH_AIM = "__l2P2CatchAim";  // aim angle the current lesson cannon's shot is catchable at
const V_P2_HINT_T = "__l2P2HintTimer";    // remaining show time for the P2 hint text
const V_PARRY_T = "__l2ParryTimer";       // PARRY flash countdown
const V_WALL_TOTAL = "__l2WallTotal";     // wall containers spawned so far
const V_WALL_KILLED = "__l2WallKilled";   // wall containers destroyed
const V_WALL_REWARDED = "__l2WallRewarded"; // 1 once the wall run has been judged
const V_RED_FIRED = "__l2RedFired";         // count of red balls fired (for PARRY prompt text)

function w(scene: GdjsRuntimeScene): number {
  return scene.getGame().getGameResolutionWidth();
}

function h(scene: GdjsRuntimeScene): number {
  return scene.getGame().getGameResolutionHeight();
}

export function ensure(scene: GdjsRuntimeScene): void {
  const vars = scene.getVariables();
  if (vars.get(V_INIT).getAsNumber() !== 0) return;
  vars.get(V_INIT).setNumber(1);
  vars.get(V_WAVE_IDX).setNumber(0);
  vars.get(V_SPAWN_TIMER).setNumber(SPAWN_GAP_SEC); // spawn the first almost immediately
  vars.get(V_POWER_LEFT).setNumber(POWER_MAX);
  vars.get(V_HALTED).setNumber(0);
  vars.get(V_ENEMY_ID).setNumber(0);
  vars.get(V_CATCH_ARMED).setNumber(0);
  vars.get(V_CATCH_TEXT_T).setNumber(0);
  vars.get(V_SHOT_COUNTER).setNumber(0);
  vars.get(V_TUT_DONE).setNumber(0);
  vars.get(V_TUT_T).setNumber(0);
  vars.get(V_P2).setNumber(P2.IDLE);
  vars.get(V_P2_T).setNumber(0);
  vars.get(V_P2_CANNON).setNumber(0);
  vars.get(V_P2_CATCH_AIM).setNumber(cannonMod.AIM_CENTER_DEG);
  vars.get(V_P2_HINT_T).setNumber(0);
  vars.get(V_PARRY_T).setNumber(0);
  vars.get(V_WALL_TOTAL).setNumber(0);
  vars.get(V_WALL_KILLED).setNumber(0);
  vars.get(V_WALL_REWARDED).setNumber(0);
  vars.get(V_RED_FIRED).setNumber(0);

  const vw = w(scene);

  // Wall tiles, stacked to cover the screen, scrolled + cycled.
  for (let i = 0; i < WALL_TILE_COUNT; i++) {
    const tile = spawn(scene, ObjectName.WallTile, 0, 0);
    if (!tile) continue;
    const tw = tile.getWidth();
    if (tw > 0) tile.setScaleX(vw / tw);
    tile.setX(0);
    tile.setY(i * WALL_TILE_H - WALL_TILE_H); // start one tile above the top
    tile.setZOrder(Z_WALL);
  }

  // Power meter on the left.
  const frame = spawn(scene, ObjectName.PowerFrame, 12, 60);
  if (frame) frame.setZOrder(Z_POWER);
  const fill = spawn(scene, ObjectName.PowerFill, 16, 64);
  if (fill) fill.setZOrder(Z_POWER);
  const label = spawn(scene, ObjectName.PowerLabel, 10, 36);
  if (label) {
    label.setString("DUKE");
    label.setZOrder(Z_POWER);
  }

  spawnTutorial(scene);

  console.log(`[level2] init, power budget ${POWER_MAX}, ${WAVE.length} encounters`);
}

/** Phase-1 tutorial container: a yellow hazard triangle nestled against
 *  the right-hand side of the rock, with a name label, a flashing red
 *  light and a "Blow up the container!" hint. It's a normal damageable
 *  enemy (in ENEMY_OBJECTS) so the standard collision + flash path
 *  applies; destroying it ends the tutorial (see tickTutorial). */
function spawnTutorial(scene: GdjsRuntimeScene): void {
  const vw = w(scene);
  const vh = h(scene);
  const id = scene.getVariables().get(V_ENEMY_ID).getAsNumber() + 1;
  scene.getVariables().get(V_ENEMY_ID).setNumber(id);

  const e = spawn(scene, ObjectName.TutContainer, 0, 0);
  if (!e) return;
  const nw = e.getWidth();
  const nh = e.getHeight();
  const targetW = 120;
  const scale = nw > 0 ? targetW / nw : 1;
  e.setScale(scale);
  const dispW = nw * scale;
  const dispH = nh * scale;
  e.setX(vw * 0.74 - dispW / 2); // nestled on the right side of the rock
  e.setY(vh * 0.40 - dispH / 2);
  e.setZOrder(Z_ENEMY);

  const bv = e.getVariables();
  bv.get("enemyId").setNumber(id);
  bv.get("hp").setNumber(TUT_HP);
  bv.get("fires").setNumber(0);
  bv.get("halts").setNumber(0);  // the tutorial gate (V_TUT_DONE) halts, not this
  bv.get("drain").setNumber(0);  // doesn't count toward the Duke's power budget
  bv.get("fireTimer").setNumber(0);
  bv.get("stopped").setNumber(1); // never moves
  bv.get("flashTimer").setNumber(0);
  bv.get("colorStr").setString("255;255;255");

  // Name label — reuses the per-enemy L2Label centring loop in tick().
  const label = spawn(scene, ObjectName.L2Label, 0, 0);
  if (label) {
    label.setString("POWER\nCONTAINER");
    label.getVariables().get("enemyId").setNumber(id);
    label.setZOrder(Z_LABEL);
  }
  // Flashing red warning light, glued to the container's apex.
  const light = spawn(scene, ObjectName.TutLight, 0, 0);
  if (light) light.setZOrder(Z_LABEL);
  // Hint text.
  const hint = spawn(scene, ObjectName.TutHintText, 0, 0);
  if (hint) {
    hint.setString("Blow up the container!");
    hint.setZOrder(Z_TUT_HINT);
  }
}

/** Drive the tutorial each frame while it's active: pulse the warning
 *  light, glue the light + hint to the container, and detect when the
 *  container has been destroyed — at which point the climb begins. */
function tickTutorial(scene: GdjsRuntimeScene, dt: number): void {
  const vars = scene.getVariables();
  const t = vars.get(V_TUT_T).getAsNumber() + dt;
  vars.get(V_TUT_T).setNumber(t);

  const tut = firstOrNull(scene, ObjectName.TutContainer);
  const light = firstOrNull(scene, ObjectName.TutLight);
  const hint = firstOrNull(scene, ObjectName.TutHintText);

  if (!tut) {
    // Container blown up → the platform starts to ascend.
    vars.get(V_TUT_DONE).setNumber(1);
    if (light) light.deleteFromScene(scene);
    if (hint) hint.deleteFromScene(scene);
    console.log("[level2] tutorial container destroyed — ascend begins");
    return;
  }

  if (light) {
    light.setX(tut.getX() + tut.getWidth() / 2 - light.getWidth() / 2);
    light.setY(tut.getY() - light.getHeight() * 0.3);
    const pulse = 0.5 + 0.5 * Math.sin(t * Math.PI * 3); // ~1.5 Hz blink
    light.setOpacity(Math.round(80 + 175 * pulse));
  }
  if (hint) {
    hint.setX(w(scene) / 2 - hint.getWidth() / 2);
    hint.setY(tut.getY() + tut.getHeight() + 18);
    hint.setZOrder(Z_TUT_HINT);
    const pulse = 0.6 + 0.4 * Math.sin(t * Math.PI * 2);
    hint.setOpacity(Math.round(255 * pulse));
  }
}

function spawnEnemy(scene: GdjsRuntimeScene, entry: WaveEntry): void {
  const t = TYPES[entry.type];
  if (!t) return;
  const vw = w(scene);
  const id = scene.getVariables().get(V_ENEMY_ID).getAsNumber() + 1;
  scene.getVariables().get(V_ENEMY_ID).setNumber(id);

  const objName = TYPE_OBJECT[entry.type] ?? ObjectName.L2Enemy;
  const isBox = objName === ObjectName.L2Enemy;
  const e = spawn(scene, objName, 0, 0);
  if (!e) return;
  const nw = e.getWidth();
  const nh = e.getHeight();
  let dispW: number;
  let dispH: number;
  if (isBox) {
    // Placeholder box: stretch to the type's box size and tint it.
    e.setScaleX(nw > 0 ? t.w / nw : 1);
    e.setScaleY(nh > 0 ? t.h / nh : 1);
    e.setColor(t.color);
    dispW = t.w;
    dispH = t.h;
  } else {
    // Art sprite: uniform scale to the target width, height by aspect.
    const scale = nw > 0 ? t.w / nw : 1;
    e.setScale(scale);
    dispW = nw * scale;
    dispH = nh * scale;
  }
  const cx = vw * entry.xFrac;
  e.setX(cx - dispW / 2);
  e.setY(-dispH - 10); // just above the top edge
  e.setZOrder(Z_ENEMY);
  // Enemy cannons aim their muzzle south (down) at the player.
  if (objName === ObjectName.EnemyCannon) e.setAngle(180);

  const bv = e.getVariables();
  bv.get("enemyId").setNumber(id);
  bv.get("hp").setNumber(t.hp);
  bv.get("fires").setNumber(t.fires ? 1 : 0);
  bv.get("halts").setNumber(t.halts ? 1 : 0);
  bv.get("drain").setNumber(t.drain);
  bv.get("fireTimer").setNumber(0);
  bv.get("stopped").setNumber(0);
  bv.get("flashTimer").setNumber(0);
  bv.get("chargedOnly").setNumber(0); // pooling: clear any lesson-cannon flag
  bv.get("firesRed").setNumber(t.firesRed ? 1 : 0);
  bv.get("isWall").setNumber(t.isWall ? 1 : 0);
  if (t.isWall) {
    const total = scene.getVariables().get(V_WALL_TOTAL).getAsNumber() + 1;
    scene.getVariables().get(V_WALL_TOTAL).setNumber(total);
  }
  // Restore tint after a hit-flash: the box reverts to its type colour,
  // art sprites revert to no tint (white = original art colours).
  bv.get("colorStr").setString(isBox ? t.color : "255;255;255");

  // Only the placeholder box gets a text label; art sprites speak for
  // themselves.
  if (isBox) {
    const label = spawn(scene, ObjectName.L2Label, 0, 0);
    if (label) {
      label.setString(t.label);
      label.getVariables().get("enemyId").setNumber(id);
      label.setZOrder(Z_LABEL);
    }
  }
  console.log(`[level2] spawn ${t.key} (${objName}) id=${id}`);
}

function labelFor(scene: GdjsRuntimeScene, enemyId: number): GdjsRuntimeObject | null {
  for (const l of all(scene, ObjectName.L2Label)) {
    if (l.getVariables().get("enemyId").getAsNumber() === enemyId) return l;
  }
  return null;
}

function despawnEnemy(scene: GdjsRuntimeScene, box: GdjsRuntimeObject): void {
  const id = box.getVariables().get("enemyId").getAsNumber();
  const l = labelFor(scene, id);
  if (l) l.deleteFromScene(scene);
  box.deleteFromScene(scene);
}

/** World centre of the cannon (breech pivot). */
function cannonCenter(cannon: GdjsRuntimeObject): { x: number; y: number } {
  return {x: cannon.getX() + cannon.getCenterX(), y: cannon.getY() + cannon.getCenterY()};
}

function cannonMuzzle(cannon: GdjsRuntimeObject): { x: number; y: number } {
  const c = cannonCenter(cannon);
  const off = cannon.getVariables().get("__cannonMuzzleOffset").getAsNumber() || 160;
  return {x: c.x, y: c.y - off};
}

/** Where the muzzle (bore opening) sits for a given aim angle — i.e. the
 *  end of the barrel as it swings around the breech pivot. Used both to
 *  aim catchable shots at a reachable spot and to test catches against
 *  the *current* bore direction. */
function muzzleArcPoint(cannon: GdjsRuntimeObject, aimDeg: number): { x: number; y: number } {
  const c = cannonCenter(cannon);
  const off = cannon.getVariables().get("__cannonMuzzleOffset").getAsNumber() || 160;
  const rad = (aimDeg * Math.PI) / 180;
  return {x: c.x + Math.cos(rad) * off, y: c.y + Math.sin(rad) * off};
}

export function tick(scene: GdjsRuntimeScene, dt: number, cannon: GdjsRuntimeObject | null): void {
  const vars = scene.getVariables();
  const vh = h(scene);
  const tutDone = vars.get(V_TUT_DONE).getAsNumber() === 1;
  const p2 = vars.get(V_P2).getAsNumber();
  // Scroll-in states keep climbing (faster) to bring the next lesson
  // cannon into view; the rest of the lesson holds the climb still.
  const p2ScrollIn = p2 === P2.DEMO_SCROLL || p2 === P2.LEARN_SCROLL;
  const p2Halts = p2 > P2.IDLE && p2 < P2.DONE && !p2ScrollIn;
  // The climb stays put until the Phase-1 tutorial container is blown up,
  // pauses for the catch-can lesson (except its scroll-in beats), and
  // afterwards still pauses at any "big" encounter that halts.
  const halted = !tutDone || p2Halts || vars.get(V_HALTED).getAsNumber() === 1;
  const scroll = halted ? 0 : SCROLL_SPEED_PX * (p2ScrollIn ? P2_SCROLL_IN_MUL : 1) * dt;

  // Scroll + cycle wall tiles.
  for (const tile of all(scene, ObjectName.WallTile)) {
    let ny = tile.getY() + scroll;
    if (ny >= vh) ny -= WALL_TILE_H * WALL_TILE_COUNT; // wrap to the top
    tile.setY(ny);
  }

  // Player shots are aimed at enemies that belong to the scrolling
  // world. Shift each in-flight player bullet's whole trajectory
  // (start + landing point) down by the same scroll, so a shot stays
  // locked onto the enemy it was aimed at instead of landing where the
  // enemy used to be before the platform climbed. Enemy balls are NOT
  // shifted — they target the fixed cannon, not the scrolling world.
  if (scroll !== 0) {
    for (const b of all(scene, ObjectName.Bullet).concat(all(scene, ObjectName.ChargedBullet))) {
      const bv = b.getVariables();
      bv.get("startY").setNumber(bv.get("startY").getAsNumber() + scroll);
      bv.get("targetY").setNumber(bv.get("targetY").getAsNumber() + scroll);
    }
  }

  // Spawn the next encounter on the scroll cadence (only while moving).
  // Hold the wave at a halting encounter: don't spawn anything past it
  // until it's destroyed, so e.g. Phase-2 cannons never appear during
  // the Phase-1 containment fight. The P2_INTRO sentinel hands off to the
  // scripted catch-can lesson and holds the rest of the wave until it's
  // finished.
  if (!halted) {
    const idx = vars.get(V_WAVE_IDX).getAsNumber();
    const haltingAlive = allEnemies(scene).some(
      (e) => e.getVariables().get("halts").getAsNumber() === 1,
    );
    if (idx < WAVE.length && !haltingAlive) {
      const entry = WAVE[idx]!;
      if (entry.type === P2_INTRO) {
        if (p2 === P2.DONE) {
          // Lesson finished — release the rest of the wave promptly.
          vars.get(V_WAVE_IDX).setNumber(idx + 1);
          vars.get(V_SPAWN_TIMER).setNumber(SPAWN_GAP_SEC);
        } else if (p2 === P2.IDLE) {
          startPhase2Intro(scene);
        }
      } else {
        const timer = vars.get(V_SPAWN_TIMER).getAsNumber() + dt;
        if (timer >= SPAWN_GAP_SEC) {
          vars.get(V_SPAWN_TIMER).setNumber(0);
          spawnEnemy(scene, entry);
          vars.get(V_WAVE_IDX).setNumber(idx + 1);
        } else {
          vars.get(V_SPAWN_TIMER).setNumber(timer);
        }
      }
    }
  }

  // Move + drive enemies.
  const cannonPos = cannon ? cannonCenter(cannon) : {x: w(scene) / 2, y: vh - 100};
  let anyHalting = false;
  for (const e of allEnemies(scene)) {
    const ev = e.getVariables();
    const halts = ev.get("halts").getAsNumber() === 1;
    const stopped = ev.get("stopped").getAsNumber() === 1;
    const ecy = e.getY() + e.getHeight() / 2;

    if (halts && !stopped && ecy + scroll >= HALT_STOP_Y) {
      // Reached its stop band — settle and halt the climb.
      ev.get("stopped").setNumber(1);
      e.setY(HALT_STOP_Y - e.getHeight() / 2);
    } else if (!stopped) {
      e.setY(e.getY() + scroll);
    }
    // (stopped halting enemies stay put; non-halting enemies scroll
    // with everything else above.)

    if (halts && ev.get("stopped").getAsNumber() === 1) anyHalting = true;

    // Cull enemies that have scrolled off the bottom (player missed them).
    if (e.getY() > vh + 20) {
      despawnEnemy(scene, e);
      continue;
    }

    // Decay the hit-flash and restore the box's base tint.
    const flash = ev.get("flashTimer").getAsNumber();
    if (flash > 0) {
      const nf = Math.max(0, flash - dt);
      ev.get("flashTimer").setNumber(nf);
      if (nf <= 0) e.setColor(ev.get("colorStr").getAsString());
    }

    // Keep the label centred on the box.
    const l = labelFor(scene, ev.get("enemyId").getAsNumber());
    if (l) {
      l.setX(e.getX() + e.getWidth() / 2 - l.getWidth() / 2);
      l.setY(e.getY() + e.getHeight() / 2 - l.getHeight() / 2);
    }

    // Firing — only once the enemy is on screen AND still within reach of
    // the player's shots (it stops once it scrolls too far past the line).
    if (ev.get("fires").getAsNumber() === 1 && e.getY() > 0 && ecy <= ENEMY_FIRE_CUTOFF_Y) {
      const ft = ev.get("fireTimer").getAsNumber() + dt;
      if (ft >= ENEMY_FIRE_INTERVAL) {
        ev.get("fireTimer").setNumber(0);
        fireEnemyShot(scene, e, cannon, cannonPos);
      } else {
        ev.get("fireTimer").setNumber(ft);
      }
    }
  }

  // Halt the climb while a halting encounter is settled and alive.
  vars.get(V_HALTED).setNumber(anyHalting ? 1 : 0);

  updatePowerMeter(scene);
  tickCatchText(scene, dt);
  if (!tutDone) tickTutorial(scene, dt);
  const p2Now = vars.get(V_P2).getAsNumber();
  if (p2Now > P2.IDLE && p2Now < P2.DONE) tickPhase2Intro(scene, dt, cannon);
  tickP2Hint(scene, dt);
  tickParry(scene, dt);
  if (cannon) updateLoadedBall(scene, cannon);
  evaluateWallReward(scene);

  // Win once the whole wave has spawned and every encounter is cleared
  // (the final Phase-3 station is the last entry). Missed wall containers
  // simply scroll off — they don't block the win, they just leave the
  // Duke with more power.
  const waveDone = vars.get(V_WAVE_IDX).getAsNumber() >= WAVE.length;
  if (tutDone && waveDone && allEnemies(scene).length === 0) {
    state.markWon(scene);
  }
}

function fireEnemyShot(
  scene: GdjsRuntimeScene,
  enemy: GdjsRuntimeObject,
  cannon: GdjsRuntimeObject | null,
  cannonPos: { x: number; y: number },
): void {
  const ev = enemy.getVariables();
  const ex = enemy.getX() + enemy.getWidth() / 2;
  const ey = enemy.getY() + enemy.getHeight() / 2;

  // Red-cannon fire: a slow, fiercely wobbling red ball on a slanted arc
  // (biased away from the enemy's side, per the GDD). It must be parried
  // back — returning it into the cannon makes it explode.
  if (ev.get("firesRed").getAsNumber() === 1) {
    const side = ex < w(scene) / 2 ? 1 : -1; // left enemy arcs right, and vice-versa
    const ball = proj.fire(
      scene, ObjectName.EnemyRedBall, ex, ey, cannonPos.x, cannonPos.y,
      {flightTimeSec: 4, wobble: true, xArcAmp: side * 60},
    );
    if (ball) {
      ball.getVariables().get("red").setNumber(1);
      ball.getVariables().get("firerId").setNumber(ev.get("enemyId").getAsNumber());
    }
    const redN = scene.getVariables().get(V_RED_FIRED).getAsNumber() + 1;
    scene.getVariables().get(V_RED_FIRED).setNumber(redN);
    const pt = firstOrNull(scene, ObjectName.ParryText);
    if (pt) pt.setString(redN >= 2 ? "PARRY!\nLAST TIME" : "PARRY!");
    scene.getVariables().get(V_PARRY_T).setNumber(PARRY_FLASH_SEC);
    audio.playEnemyFire();
    audio.playWhistle();
    return;
  }

  const counter = scene.getVariables().get(V_SHOT_COUNTER).getAsNumber() + 1;
  scene.getVariables().get(V_SHOT_COUNTER).setNumber(counter);
  const catchable = cannon != null && counter % CATCHABLE_EVERY === 0;
  if (catchable && cannon) {
    // Catchable shots come in from a RANDOM side: aimed at the spot the
    // muzzle reaches at that side angle, so the player must point the bore
    // toward the incoming ball (not just hold centre) to catch it.
    const side = Math.random() < 0.5 ? -1 : 1;
    const catchAimDeg = cannonMod.AIM_CENTER_DEG + side * CATCH_SIDE_OFFSET_DEG;
    const target = muzzleArcPoint(cannon, catchAimDeg);
    const ball = proj.fire(scene, ObjectName.EnemyBall, ex, ey, target.x, target.y, {xArcAmp: side * 45});
    if (ball) ball.getVariables().get("catchable").setNumber(1);
    audio.playEnemyFire();
    audio.playWhistle();
    return;
  }
  // Ordinary shot: still aimed at the cannon (a real threat) but swung in
  // on a randomised arc so it doesn't always come straight down the middle.
  const xArc = (Math.random() * 2 - 1) * 70;
  proj.fire(scene, ObjectName.EnemyBall, ex, ey, cannonPos.x, cannonPos.y, {xArcAmp: xArc});
  audio.playEnemyFire();
}

const POWER_PAD = 6; // inset of the fill inside the frame border

function updatePowerMeter(scene: GdjsRuntimeScene): void {
  const frame = firstOrNull(scene, ObjectName.PowerFrame);
  const fill = firstOrNull(scene, ObjectName.PowerFill);
  if (!frame || !fill) return;
  const left = scene.getVariables().get(V_POWER_LEFT).getAsNumber();
  const frac = Math.max(0, Math.min(1, left / POWER_MAX));
  // Place the fill inside the frame's actual rendered bounds so the bar
  // is always correctly sized regardless of the source PNG dimensions.
  const interiorX = frame.getX() + POWER_PAD;
  const interiorTop = frame.getY() + POWER_PAD;
  const interiorW = frame.getWidth() - 2 * POWER_PAD;
  const interiorH = frame.getHeight() - 2 * POWER_PAD;
  fill.setWidth(interiorW);
  fill.setHeight(interiorH * frac);
  fill.setX(interiorX);
  // Drains upward: the bottom stays pinned, the top recedes.
  fill.setY(interiorTop + interiorH * (1 - frac));
}

function tickCatchText(scene: GdjsRuntimeScene, dt: number): void {
  const vars = scene.getVariables();
  const timer = vars.get(V_CATCH_TEXT_T).getAsNumber();
  const txt = firstOrNull(scene, ObjectName.CatchCanText);
  if (timer > 0) {
    const next = Math.max(0, timer - dt);
    vars.get(V_CATCH_TEXT_T).setNumber(next);
    if (txt) {
      // Centre it; fade out over the last second.
      txt.setX(w(scene) / 2 - txt.getWidth() / 2);
      txt.setY(h(scene) * 0.34);
      txt.setZOrder(Z_CATCH_TEXT);
      txt.hide(false);
      txt.setOpacity(next < 1 ? Math.round(255 * next) : 255);
    }
  } else if (txt) {
    txt.hide(true);
  }
}

/** True if the player has a Catch-Can return shot queued. */
export function isCatchArmed(scene: GdjsRuntimeScene): boolean {
  return scene.getVariables().get(V_CATCH_ARMED).getAsNumber() === 1;
}

export function consumeCatchArm(scene: GdjsRuntimeScene): void {
  scene.getVariables().get(V_CATCH_ARMED).setNumber(0);
}

const LOADED_BALL_SIZE = 154;
const LOADED_BALL_PEEK_PX = -26; // pushed past the firing muzzle so it pokes out the bore
const Z_LOADED = 9; // behind the cannon (z 10), above the railing (z 5)

/** While a Catch-Can return is armed, show a red cannonball loaded in the
 *  barrel — poking out the muzzle bore with its base tucked behind the
 *  cannon (drawn behind it), matching the layout reference. Hidden when
 *  nothing is loaded. */
function updateLoadedBall(scene: GdjsRuntimeScene, cannon: GdjsRuntimeObject): void {
  let lb = firstOrNull(scene, ObjectName.LoadedBall);
  if (!isCatchArmed(scene)) {
    if (lb) lb.hide(true);
    return;
  }
  if (!lb) {
    lb = spawn(scene, ObjectName.LoadedBall, 0, 0);
    if (lb) lb.getVariables().get("nativeW").setNumber(lb.getWidth());
  }
  if (!lb) return;
  const nativeW = lb.getVariables().get("nativeW").getAsNumber() || lb.getWidth();
  if (nativeW > 0) lb.setScale(LOADED_BALL_SIZE / nativeW);
  const aimDeg = cannonMod.getAimDeg(scene);
  const rad = (aimDeg * Math.PI) / 180;
  const c = cannonCenter(cannon);
  const off = cannon.getVariables().get("__cannonMuzzleOffset").getAsNumber() || 160;
  const dist = off + LOADED_BALL_PEEK_PX; // sit at the bore lip so it pokes out the top
  const mx = c.x + Math.cos(rad) * dist;
  const my = c.y + Math.sin(rad) * dist;
  lb.setX(mx - lb.getWidth() / 2);
  lb.setY(my - lb.getHeight() / 2);
  lb.setZOrder(Z_LOADED);
  lb.hide(false);
}

/** Flash the "PARRY" prompt (~twice) while a red ball is incoming. */
function tickParry(scene: GdjsRuntimeScene, dt: number): void {
  const tv = scene.getVariables().get(V_PARRY_T);
  let rem = tv.getAsNumber();
  const txt = firstOrNull(scene, ObjectName.ParryText);
  if (rem <= 0) {
    if (txt) txt.hide(true);
    return;
  }
  rem = Math.max(0, rem - dt);
  tv.setNumber(rem);
  if (!txt) return;
  const elapsed = PARRY_FLASH_SEC - rem;
  const on = rem > 0 && (elapsed % 0.6) < 0.35; // ~2 flashes over the duration
  if (on) {
    txt.hide(false);
    txt.setX(w(scene) / 2 - txt.getWidth() / 2);
    txt.setY(h(scene) * 0.30);
    txt.setZOrder(Z_CATCH_TEXT);
    txt.setOpacity(255);
  } else {
    txt.hide(true);
  }
}

/** Once the rock-wall container run is over (all spawned, none left
 *  alive), reward full health if the player cleared every one. */
function evaluateWallReward(scene: GdjsRuntimeScene): void {
  const vars = scene.getVariables();
  if (vars.get(V_WALL_REWARDED).getAsNumber() === 1) return;
  if (vars.get(V_WALL_TOTAL).getAsNumber() < WALL_RUN_COUNT) return; // not all spawned yet
  let alive = 0;
  for (const e of allEnemies(scene)) {
    if (e.getVariables().get("isWall").getAsNumber() === 1) alive++;
  }
  if (alive > 0) return;
  vars.get(V_WALL_REWARDED).setNumber(1);
  if (vars.get(V_WALL_KILLED).getAsNumber() >= WALL_RUN_COUNT) {
    state.healFull(scene);
    showP2Hint(scene, "All containers cleared!\nFull health restored!", 2.6);
    popup.show(scene, "FULL HEALTH!", w(scene) / 2, h(scene) * 0.5, "120;255;140");
    vfx.flash(scene, "120;255;150", 120);
    audio.playCatch();
  }
}

// ── Phase 2 catch-can lesson ──────────────────────────────────────────

function findEnemyById(scene: GdjsRuntimeScene, id: number): GdjsRuntimeObject | null {
  if (id <= 0) return null;
  for (const e of allEnemies(scene)) {
    if (e.getVariables().get("enemyId").getAsNumber() === id) return e;
  }
  return null;
}

/** Spawn a single lesson cannon, pre-placed (no scroll-in) and inert: it
 *  doesn't auto-fire (the script fires it) and can only be destroyed by a
 *  caught red return shot (`chargedOnly`). Returns its enemyId. */
function spawnLessonCannon(scene: GdjsRuntimeScene, cx: number): number {
  const t = TYPES.cannon!;
  const id = scene.getVariables().get(V_ENEMY_ID).getAsNumber() + 1;
  scene.getVariables().get(V_ENEMY_ID).setNumber(id);
  const e = spawn(scene, ObjectName.EnemyCannon, 0, 0);
  if (!e) return id;
  const nw = e.getWidth();
  const nh = e.getHeight();
  const scale = nw > 0 ? t.w / nw : 1;
  e.setScale(scale);
  const dispW = nw * scale;
  const dispH = nh * scale;
  e.setX(cx - dispW / 2);
  e.setY(-dispH - 10); // just above the top — scrolls into view with the climb
  e.setZOrder(Z_ENEMY);
  e.setAngle(180); // muzzle south, at the player
  const bv = e.getVariables();
  bv.get("enemyId").setNumber(id);
  bv.get("hp").setNumber(1);
  bv.get("fires").setNumber(0);
  bv.get("halts").setNumber(0);
  bv.get("drain").setNumber(t.drain);
  bv.get("fireTimer").setNumber(0);
  bv.get("stopped").setNumber(0); // scrolls down until the lesson pins it
  bv.get("flashTimer").setNumber(0);
  bv.get("colorStr").setString("255;255;255");
  bv.get("chargedOnly").setNumber(1);
  return id;
}

/** Once a scrolling-in lesson cannon reaches the settle band, pin it in
 *  place. Returns true when it has settled. */
function settleLessonCannon(lessonCannon: GdjsRuntimeObject | null): boolean {
  if (!lessonCannon) return true; // nothing to wait on
  const ccy = lessonCannon.getY() + lessonCannon.getHeight() / 2;
  if (ccy < P2_CANNON_CY) return false;
  lessonCannon.getVariables().get("stopped").setNumber(1);
  lessonCannon.setY(P2_CANNON_CY - lessonCannon.getHeight() / 2);
  return true;
}

/** Fire a catchable ball from a lesson cannon toward the spot the muzzle
 *  reaches at `catchAimDeg` — so the player catches it by aiming the bore
 *  to that side (centre for the demo, a random side for the practice). */
function fireLessonBall(
  scene: GdjsRuntimeScene,
  enemy: GdjsRuntimeObject,
  cannon: GdjsRuntimeObject | null,
  catchAimDeg: number,
): void {
  const ex = enemy.getX() + enemy.getWidth() / 2;
  const ey = enemy.getY() + enemy.getHeight() / 2;
  const target = cannon ? muzzleArcPoint(cannon, catchAimDeg) : {x: w(scene) / 2, y: h(scene) - 150};
  const side = Math.sign(catchAimDeg - cannonMod.AIM_CENTER_DEG);
  const ball = proj.fire(scene, ObjectName.EnemyBall, ex, ey, target.x, target.y, {xArcAmp: side * 45});
  if (ball) ball.getVariables().get("catchable").setNumber(1);
  audio.playEnemyFire();
  audio.playWhistle();
}

function flashCannon(e: GdjsRuntimeObject, t: number): void {
  e.setColor(Math.sin(t * Math.PI * 8) > 0 ? "255;140;110" : "255;255;255");
}

function showP2Hint(scene: GdjsRuntimeScene, text: string, holdSec = 999): void {
  const hint = firstOrNull(scene, ObjectName.P2HintText);
  if (hint) hint.setString(text);
  scene.getVariables().get(V_P2_HINT_T).setNumber(holdSec);
}

function tickP2Hint(scene: GdjsRuntimeScene, dt: number): void {
  const hint = firstOrNull(scene, ObjectName.P2HintText);
  if (!hint) return;
  const tv = scene.getVariables().get(V_P2_HINT_T);
  let rem = tv.getAsNumber();
  if (rem <= 0) {
    hint.hide(true);
    return;
  }
  rem = Math.max(0, rem - dt);
  tv.setNumber(rem);
  hint.hide(false);
  hint.setX(w(scene) / 2 - hint.getWidth() / 2);
  hint.setY(h(scene) * 0.13);
  hint.setZOrder(Z_TUT_HINT);
  const fade = rem < 0.8 ? rem / 0.8 : 1;
  const pulse = 0.75 + 0.25 * Math.sin(scene.getVariables().get(V_P2_T).getAsNumber() * Math.PI * 2);
  hint.setOpacity(Math.round(255 * fade * pulse));
  if (rem <= 0) hint.hide(true);
}

/** True for the whole catch-can lesson. While active, the player cannot
 *  free-fire normal/charged shots — only the Catch-Can return is allowed
 *  (handled before this check in handleFire). The cannon can still aim. */
export function lessonActive(scene: GdjsRuntimeScene): boolean {
  const s = scene.getVariables().get(V_P2).getAsNumber();
  return s >= P2.DEMO_SCROLL && s <= P2.LEARN_EXPLODE;
}

function startPhase2Intro(scene: GdjsRuntimeScene): void {
  const vars = scene.getVariables();
  vars.get(V_P2).setNumber(P2.DEMO_SCROLL);
  vars.get(V_P2_T).setNumber(0);
  // Demo shot comes straight down the middle (catchable dead-centre).
  vars.get(V_P2_CATCH_AIM).setNumber(cannonMod.AIM_CENTER_DEG);
  const id = spawnLessonCannon(scene, w(scene) * 0.5);
  vars.get(V_P2_CANNON).setNumber(id);
  showP2Hint(scene, "An enemy cannon rises into view...");
  console.log("[level2] Phase 2 catch-can lesson begins");
}

function setP2(scene: GdjsRuntimeScene, state: number): void {
  scene.getVariables().get(V_P2).setNumber(state);
  scene.getVariables().get(V_P2_T).setNumber(0);
}

/** The scripted catch-can lesson. One cannon at a time: an automatic
 *  demonstration (cannon auto-corrects to 0° and catches for the player),
 *  then a hands-on repeat the player must perform to finish the lesson. */
function tickPhase2Intro(scene: GdjsRuntimeScene, dt: number, cannon: GdjsRuntimeObject | null): void {
  const vars = scene.getVariables();
  const t = vars.get(V_P2_T).getAsNumber() + dt;
  vars.get(V_P2_T).setNumber(t);
  const state = vars.get(V_P2).getAsNumber();
  const lessonCannon = findEnemyById(scene, vars.get(V_P2_CANNON).getAsNumber());
  const ballsGone = all(scene, ObjectName.EnemyBall).length === 0;
  const returnGone = all(scene, ObjectName.ChargedBullet).length === 0;

  switch (state) {
    case P2.DEMO_SCROLL:
      // Climb keeps moving (boosted) until the cannon reaches the band.
      if (settleLessonCannon(lessonCannon)) {
        showP2Hint(scene, "An enemy cannon!");
        setP2(scene, P2.DEMO_SETTLE);
      }
      break;

    case P2.DEMO_SETTLE:
      if (t >= P2_SETTLE_SEC) {
        showP2Hint(scene, "It's aiming straight at you...");
        setP2(scene, P2.DEMO_FLASH);
      }
      break;

    case P2.DEMO_FLASH:
      if (lessonCannon) flashCannon(lessonCannon, t);
      if (t >= P2_FLASH_SEC) {
        if (lessonCannon) {
          lessonCannon.setColor("255;255;255");
          fireLessonBall(scene, lessonCannon, cannon, vars.get(V_P2_CATCH_AIM).getAsNumber());
        }
        showP2Hint(scene, "Watch — the cannon lines up to CATCH it!");
        setP2(scene, P2.DEMO_FLIGHT);
      }
      break;

    case P2.DEMO_FLIGHT:
      // Auto-correct the player's bore onto the shot so the first catch is free.
      if (cannon) {
        const aim = vars.get(V_P2_CATCH_AIM).getAsNumber();
        const cur = cannonMod.getAimDeg(scene);
        const next = cur + (aim - cur) * Math.min(1, dt * 12);
        cannonMod.setAimDeg(scene, cannon, next);
      }
      if (isCatchArmed(scene)) {
        showP2Hint(scene, "CAUGHT IT! It's red-hot.\nTap to fire it back for DOUBLE damage!");
        setP2(scene, P2.DEMO_CAUGHT);
      } else if (ballsGone) {
        // Shouldn't happen with auto-aim, but re-fire just in case.
        setP2(scene, P2.DEMO_FLASH);
      }
      break;

    case P2.DEMO_CAUGHT:
      // Hold the bore on target so the return flies up into the cannon.
      if (cannon) cannonMod.setAimDeg(scene, cannon, vars.get(V_P2_CATCH_AIM).getAsNumber());
      if (!isCatchArmed(scene) || !lessonCannon) setP2(scene, P2.DEMO_EXPLODE);
      break;

    case P2.DEMO_EXPLODE:
      if (!lessonCannon) {
        consumeCatchArm(scene);
        // Practice shot comes in from a RANDOM side so the player learns
        // to catch angled shots, not just centred ones.
        const side = Math.random() < 0.5 ? -1 : 1;
        vars.get(V_P2_CATCH_AIM).setNumber(cannonMod.AIM_CENTER_DEG + side * CATCH_SIDE_OFFSET_DEG);
        const id = spawnLessonCannon(scene, w(scene) * (0.5 + side * 0.18));
        vars.get(V_P2_CANNON).setNumber(id);
        showP2Hint(scene, side > 0
          ? "Now YOU try!\nAim RIGHT to catch the shot."
          : "Now YOU try!\nAim LEFT to catch the shot.");
        setP2(scene, P2.LEARN_SCROLL);
      } else if (returnGone && !isCatchArmed(scene)) {
        // The return missed — re-arm so the player can fire again.
        armCatchCan(scene);
        setP2(scene, P2.DEMO_CAUGHT);
      }
      break;

    case P2.LEARN_SCROLL:
      if (settleLessonCannon(lessonCannon)) setP2(scene, P2.LEARN_SETTLE);
      break;

    case P2.LEARN_SETTLE:
      if (t >= P2_SETTLE_SEC + 0.6) setP2(scene, P2.LEARN_FLASH);
      break;

    case P2.LEARN_FLASH:
      if (lessonCannon) flashCannon(lessonCannon, t);
      if (t >= P2_FLASH_SEC) {
        if (lessonCannon) {
          lessonCannon.setColor("255;255;255");
          fireLessonBall(scene, lessonCannon, cannon, vars.get(V_P2_CATCH_AIM).getAsNumber());
        }
        showP2Hint(scene, "Point the bore at the incoming ball to catch it!");
        setP2(scene, P2.LEARN_FLIGHT);
      }
      break;

    case P2.LEARN_FLIGHT:
      // No auto-correct — the player must aim the bore at the ball.
      if (isCatchArmed(scene)) {
        showP2Hint(scene, "Caught! Now fire it back!");
        setP2(scene, P2.LEARN_CAUGHT);
      } else if (ballsGone) {
        showP2Hint(scene, "Missed! Aim the bore at the ball — try again.");
        setP2(scene, P2.LEARN_FLASH);
      }
      break;

    case P2.LEARN_CAUGHT:
      if (!isCatchArmed(scene) || !lessonCannon) setP2(scene, P2.LEARN_EXPLODE);
      break;

    case P2.LEARN_EXPLODE:
      if (!lessonCannon) {
        consumeCatchArm(scene);
        showP2Hint(scene, "Catch-Can mastered!", 2.5);
        setP2(scene, P2.DONE);
      } else if (returnGone && !isCatchArmed(scene)) {
        armCatchCan(scene);
        showP2Hint(scene, "So close — aim at the cannon and fire!");
        setP2(scene, P2.LEARN_CAUGHT);
      }
      break;

    default:
      break;
  }
}

// ── Level 2 player shooting (separate from Level 1) ──
// Unlimited ammo + a 0.75 s reload cooldown between shots. A charged
// shot (double-tap) fires after a 0.5 s delay during which normal shots
// are blocked but the cannon can still be aimed; it flies 1.25× faster
// than a standard shot (and is flat — none of the slow enemy-red wobble).
// A Catch-Can return shot fires immediately as a fast double-damage red.
//
// Inputs are QUEUED: a tap / double-tap given while the cannon is still
// reloading is remembered and fired the instant the cooldown clears
// (a queued charged shot then runs its 0.5 s pre-fire delay on top of
// that). The latest input wins, so a tap can be upgraded to a charged
// shot — or vice-versa — before the cooldown is up.
const L2_RELOAD_SEC = 0.75;
const L2_CHARGE_DELAY_SEC = 0.5;
const L2_NORMAL_FLIGHT_SEC = 1.5;
const L2_CHARGED_FLIGHT_SEC = L2_NORMAL_FLIGHT_SEC / 1.25; // 1.25× speed → 1.125 s
const V_FIRE_CD = "__l2FireCd";
const V_CHARGE_T = "__l2ChargeT";
const V_QUEUED = "__l2Queued"; // 0 none, 1 normal, 2 charged

const CHARGED_OPTS: proj.FireOptions = {flightTimeSec: L2_CHARGED_FLIGHT_SEC, wobble: false};

export function handleFire(
  scene: GdjsRuntimeScene,
  dt: number,
  cannon: GdjsRuntimeObject,
  aimDeg: number,
  tap: boolean,
  doubleTap: boolean,
): void {
  const vars = scene.getVariables();

  // Tick the reload cooldown.
  const cd = Math.max(0, vars.get(V_FIRE_CD).getAsNumber() - dt);
  vars.get(V_FIRE_CD).setNumber(cd);

  // Catch-Can return: while a caught ball is loaded, ANY fire input fires
  // it back INSTANTLY as a red double-damage shot — bypassing both the
  // reload cooldown and the charged windup. It's a free, immediate shot.
  if ((tap || doubleTap) && isCatchArmed(scene)) {
    cannonMod.fireBallAt(scene, cannon, aimDeg, /*charged*/ true, CHARGED_OPTS);
    consumeCatchArm(scene);
    vars.get(V_QUEUED).setNumber(0); // don't let the freebie also trigger a queued shot
    return;
  }

  // Until the catch-can lesson is finished, the player can't free-fire —
  // the only valid shot is the Catch-Can return handled above. (Aiming is
  // still allowed, so the player can centre the cannon to catch.)
  if (lessonActive(scene)) {
    vars.get(V_QUEUED).setNumber(0);
    return;
  }

  // Buffer the player's latest intent. A double-tap outranks a tap in
  // the same frame; either may be entered while reloading or charging
  // and is remembered for when the cannon is free again.
  if (doubleTap) vars.get(V_QUEUED).setNumber(2);
  else if (tap) vars.get(V_QUEUED).setNumber(1);

  // A charged shot already mid-windup: count it down and fire when ready.
  // The reload cooldown is set only when it actually fires, so chained
  // charged shots are gated by reload (0.75 s) + windup (0.5 s). Normal
  // shots are blocked meanwhile (aiming still works — that's in main.ts).
  const charge = vars.get(V_CHARGE_T).getAsNumber();
  if (charge > 0) {
    const next = Math.max(0, charge - dt);
    vars.get(V_CHARGE_T).setNumber(next);
    if (next <= 0) {
      cannonMod.fireBallAt(scene, cannon, aimDeg, /*charged*/ true, CHARGED_OPTS);
      vars.get(V_FIRE_CD).setNumber(L2_RELOAD_SEC);
    }
    return;
  }

  // Cannon free (reload finished) + something queued → execute it now.
  const queued = vars.get(V_QUEUED).getAsNumber();
  if (cd <= 0 && queued !== 0) {
    vars.get(V_QUEUED).setNumber(0);
    if (queued === 2) {
      // Charged: start the 0.5 s windup (it sets the reload when it fires).
      vars.get(V_CHARGE_T).setNumber(L2_CHARGE_DELAY_SEC);
    } else {
      // Standard shot.
      cannonMod.fireBallAt(scene, cannon, aimDeg, /*charged*/ false, {});
      vars.get(V_FIRE_CD).setNumber(L2_RELOAD_SEC);
    }
  }
}

function armCatchCan(scene: GdjsRuntimeScene): void {
  scene.getVariables().get(V_CATCH_ARMED).setNumber(1);
  scene.getVariables().get(V_CATCH_TEXT_T).setNumber(CATCH_TEXT_SEC);
  console.log(`[level2] Catch-Can! armed double-damage return shot`);
}

function boxHit(b: GdjsRuntimeObject, e: GdjsRuntimeObject): boolean {
  const bx = b.getX() + b.getWidth() / 2;
  const by = b.getY() + b.getHeight() / 2;
  return bx >= e.getX() && bx <= e.getX() + e.getWidth()
    && by >= e.getY() && by <= e.getY() + e.getHeight();
}

function ballHit(a: GdjsRuntimeObject, b: GdjsRuntimeObject): boolean {
  return gdjs.RuntimeObject.collisionTest(a, b, false);
}

const BULLET_DAMAGE = 1;
const CHARGED_DAMAGE = 2; // Level 2 charged + catch-can = 2× normal

/** Level-2 collision pass — replaces the Level-1 ship/target logic. */
export function handleCollisions(scene: GdjsRuntimeScene, cannon: GdjsRuntimeObject | null): void {
  const bullets = all(scene, ObjectName.Bullet).concat(all(scene, ObjectName.ChargedBullet));
  const enemyBalls = all(scene, ObjectName.EnemyBall).concat(all(scene, ObjectName.EnemyRedBall));
  const enemies = allEnemies(scene);

  for (const b of bullets) {
    const bv = b.getVariables();
    const charged = bv.get("charged").getAsNumber() === 1;
    // Parry incoming fire (any time during flight). Centred catchable
    // shots are NOT parried — they must be CAUGHT (by centring the aim),
    // so a stray shot can't silently consume a catch opportunity.
    let consumed = false;
    for (const eb of enemyBalls) {
      if (eb.getVariables().get("catchable").getAsNumber() === 1) continue;
      if (ballHit(b, eb)) {
        const ebx = eb.getX() + eb.getWidth() / 2;
        const eby = eb.getY() + eb.getHeight() / 2;
        const isRed = eb.getVariables().get("red").getAsNumber() === 1;
        eb.deleteFromScene(scene);
        if (isRed) {
          // Returned the red ball into the cannon — that cannon explodes.
          const firer = findEnemyById(scene, eb.getVariables().get("firerId").getAsNumber());
          if (firer) damageEnemy(scene, firer, 999, /*charged*/ true);
          popup.show(scene, "DEFLECTED!", ebx, eby, "255;120;90");
          vfx.flash(scene, "255;240;200", 120);
          audio.playParry();
        } else {
          vfx.spawnBurst(scene, ebx, eby, 40);
          popup.show(scene, "PARRIED!", ebx, eby, "150;220;255");
          audio.playParry();
        }
        if (charged) {
          bv.get("intercepted").setNumber(1);
        } else {
          b.deleteFromScene(scene);
          consumed = true;
        }
        break;
      }
    }
    if (consumed) continue;
    // Player bullets only damage an encounter once their flight is over.
    if (bv.get("landed").getAsNumber() !== 1) continue;
    for (const e of enemies) {
      if (boxHit(b, e)) {
        // Lesson cannons can only be destroyed by the caught red return
        // shot — a plain shot just fizzles, so the player must learn the
        // catch-can rather than cheesing the cannon with normal fire.
        const chargedOnly = e.getVariables().get("chargedOnly").getAsNumber() === 1;
        if (chargedOnly && !charged) {
          b.deleteFromScene(scene);
          break;
        }
        const dmg = charged ? CHARGED_DAMAGE : BULLET_DAMAGE;
        damageEnemy(scene, e, dmg, charged);
        b.deleteFromScene(scene);
        break;
      }
    }
  }

  // Enemy balls vs the cannon: catch-can (bore aimed at the ball) or damage.
  if (cannon) {
    const straightMuzzle = cannonMuzzle(cannon);
    const pivot = cannonCenter(cannon);
    const aimDeg = cannonMod.getAimDeg(scene);
    const aimRad = (aimDeg * Math.PI) / 180;
    const aimX = Math.cos(aimRad);
    const aimY = Math.sin(aimRad);
    const off = cannon.getVariables().get("__cannonMuzzleOffset").getAsNumber() || 160;
    const muzzleX = pivot.x + aimX * off;
    const muzzleY = pivot.y + aimY * off;
    const cosTol = Math.cos((CATCH_ANGLE_TOL_DEG * Math.PI) / 180);
    for (const eb of enemyBalls) {
      const ev = eb.getVariables();
      const landed = ev.get("landed").getAsNumber() === 1;
      if (ev.get("catchable").getAsNumber() === 1) {
        // Catch when the BORE points at the incoming ball (bore direction
        // aligned with the ball's bearing from the pivot) AND the ball has
        // reached the muzzle — a forgiving window, not the single landing
        // frame. So the player aims the barrel into the shot's path.
        const bx = eb.getX() + eb.getWidth() / 2;
        const by = eb.getY() + eb.getHeight() / 2;
        const dx = bx - pivot.x;
        const dy = by - pivot.y;
        const len = Math.hypot(dx, dy) || 1;
        const aligned = (dx / len) * aimX + (dy / len) * aimY >= cosTol;
        const near = Math.hypot(bx - muzzleX, by - muzzleY) <= CATCH_RADIUS_PX;
        if (aligned && near) {
          eb.deleteFromScene(scene);
          armCatchCan(scene);
          vfx.spawnBurst(scene, muzzleX, muzzleY, 90);
          vfx.flash(scene, "255;245;210", 110);
          popup.show(scene, "CAUGHT!", muzzleX, muzzleY - 28, "255;230;90");
          audio.playCatch();
          shake.trigger(scene, 9, 0.22);
        } else if (landed) {
          // Reached the muzzle without the bore lined up — it clips you.
          eb.deleteFromScene(scene);
          playerHit(scene, muzzleX, muzzleY, 1);
        }
        // else: still in flight / bore not yet on target — wait.
        continue;
      }
      if (!landed) continue;
      // Ordinary shot reaching the cannon → player damage.
      if (ballHit(eb, cannon) || nearMuzzle(eb, straightMuzzle)) {
        const hx = eb.getX() + eb.getWidth() / 2;
        const hy = eb.getY() + eb.getHeight() / 2;
        eb.deleteFromScene(scene);
        playerHit(scene, hx, hy, 1);
      }
    }
  }
}

/** Player takes a hit: damage + red screen flash + shake + a "-N" popup. */
function playerHit(scene: GdjsRuntimeScene, x: number, y: number, amount: number): void {
  state.damagePlayer(scene, amount);
  shake.trigger(scene, SHAKE_INTENSITY_PX, SHAKE_DURATION_SEC);
  vfx.flash(scene, "255;60;60", 115);
  popup.show(scene, `-${amount}`, x, y, "255;90;90");
}

function nearMuzzle(ball: GdjsRuntimeObject, muzzle: { x: number; y: number }): boolean {
  const bx = ball.getX() + ball.getWidth() / 2;
  const by = ball.getY() + ball.getHeight() / 2;
  return Math.hypot(bx - muzzle.x, by - muzzle.y) < 60;
}

// Hit-flash tints. A charged (red/caught) shot punches a bright white
// flash; a plain shot only scorches a dull yellow.
const FLASH_CHARGED = "255;255;255";
const FLASH_NORMAL = "210;185;90";

function damageEnemy(scene: GdjsRuntimeScene, e: GdjsRuntimeObject, amount: number, charged = false): void {
  const ev = e.getVariables();
  const hpVar = ev.get("hp");
  const next = hpVar.getAsNumber() - amount;
  hpVar.setNumber(next);
  // Brief hit-flash (restored to base tint by tick()'s flash timer).
  e.setColor(charged ? FLASH_CHARGED : FLASH_NORMAL);
  ev.get("flashTimer").setNumber(0.12);
  if (next <= 0) {
    const drain = ev.get("drain").getAsNumber();
    const pv = scene.getVariables().get(V_POWER_LEFT);
    pv.setNumber(Math.max(0, pv.getAsNumber() - drain));
    if (ev.get("isWall").getAsNumber() === 1) {
      const k = scene.getVariables().get(V_WALL_KILLED);
      k.setNumber(k.getAsNumber() + 1);
    }
    // Juicy destruction: a burst scaled to the enemy + an explosion boom.
    const bx = e.getX() + e.getWidth() / 2;
    const by = e.getY() + e.getHeight() / 2;
    vfx.spawnBurst(scene, bx, by, Math.max(e.getWidth(), e.getHeight()) * 1.4);
    audio.playExplosion();
    shake.trigger(scene, 11, 0.3);
    despawnEnemy(scene, e);
    console.log(`[level2] destroyed; power left ${pv.getAsNumber()}/${POWER_MAX}`);
  }
}
