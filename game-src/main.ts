/**
 * Game entry point — bundled to an IIFE and injected as the Main scene's
 * single JsCode event. Runs every frame. Module-level code re-executes
 * each frame, so persistent state lives on scene/object variables.
 *
 * The Main scene hosts BOTH levels; which one runs is chosen by the
 * global `currentLevel` variable (see levels.ts), so the win screen can
 * advance levels via a scene restart. Shared systems (cannon, HUD,
 * health bar, gestures, projectiles, lose/win screens, shake) run for
 * every level; only the background + enemy logic + win condition differ.
 *
 *   Level 1: static arcade — ships from L/R, sink 3 to win.
 *   Level 2: vertical scroller — climb the fortress, drain the Power
 *            Meter, Catch-Can mechanic.
 */

import {readInput} from "./input.js";
import {detectGesture} from "./gestures.js";
import {ObjectName} from "./entities.js";
import * as proj from "./projectiles.js";
import * as cannonMod from "./cannon.js";
import * as enemyMod from "./enemy.js";
import * as state from "./state.js";
import {ensureBackground} from "./background.js";
import {resolveBulletHits, resolveEnemyBallHits} from "./collisions.js";
import * as hud from "./hud.js";
import * as hudHealth from "./hud-health.js";
import * as shake from "./shake.js";
import * as vfx from "./vfx.js";
import * as lose from "./lose.js";
import * as win from "./win.js";
import * as levels from "./levels.js";
import * as level2 from "./level2.js";

declare const runtimeScene: GdjsRuntimeScene;

const scene = runtimeScene;
const level = levels.current(scene);

state.ensureInit(scene);
if (level === 2) {
  level2.ensure(scene);
} else {
  ensureBackground(scene);
}
const cannon = cannonMod.ensureCannon(scene);
// The 4-shot ammo HUD is a Level-1 mechanic; Level 2 has unlimited ammo.
if (level !== 2) hud.ensureHud(scene);

const playing = state.getState(scene) === "playing";
const dt = scene.getElapsedTime() / 1000;
const input = readInput(scene);
const gesture = detectGesture(scene, dt, input.cursor.x, input.cursor.y, input.fire);

if (cannon && playing) {
  const aimDeg = cannonMod.aim(scene, cannon, input.cursor.x, gesture.dragging);
  cannonMod.updateCrosshair(scene, cannon, aimDeg);

  if (level === 2) {
    // Level 2 has its own shoot rules (unlimited ammo, 0.75 s reload,
    // 0.5 s charged delay, Catch-Can). Aiming above is shared. handleFire
    // itself blocks free-fire during the catch-can lesson (only the
    // Catch-Can return is allowed until the mechanic is learnt).
    level2.handleFire(scene, dt, cannon, aimDeg, gesture.tap, gesture.doubleTap);
    level2.tick(scene, dt, cannon);
  } else {
    if (gesture.tap) cannonMod.fire(scene, cannon, aimDeg, /*charged*/ false);
    if (gesture.doubleTap) cannonMod.fire(scene, cannon, aimDeg, /*charged*/ true);
    enemyMod.tick(
      scene, dt,
      cannon.getX() + cannon.getCenterX(),
      cannon.getY() + cannon.getCenterY(),
    );
  }
}

proj.update(scene, ObjectName.Bullet, dt);
proj.update(scene, ObjectName.ChargedBullet, dt);
proj.update(scene, ObjectName.EnemyBall, dt);
proj.update(scene, ObjectName.EnemyRedBall, dt);
if (level !== 2) hud.tick(scene, dt, cannon);
hudHealth.tick(scene, dt);
vfx.tick(scene, dt);
shake.tick(scene, dt);

if (playing) {
  if (level === 2) {
    level2.handleCollisions(scene, cannon);
  } else {
    resolveBulletHits(scene);
    resolveEnemyBallHits(scene, cannon);
    if (enemyMod.isLevelComplete(scene)) state.markWon(scene);
  }
}

// End-of-scene screens. Run after the main loop so the win/lose flags
// set during this frame are reflected. Only one is active at a time.
const endState = state.getState(scene);
if (endState === "lost") {
  lose.tick(scene, input.cursor.x, input.cursor.y, input.firePressed);
} else if (endState === "won") {
  win.tick(scene, input.cursor.x, input.cursor.y, input.firePressed);
}
