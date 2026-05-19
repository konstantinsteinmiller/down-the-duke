/**
 * Game entry point — bundled to an IIFE and injected as the Main scene's
 * single JsCode event. Runs every frame. Module-level code re-executes
 * each frame, so persistent state lives on scene/object variables.
 *
 * Level 1 mocked loop (static screen, arcade cannon shooter):
 *   1. Init scene state on first frame (HP, background, cannon).
 *   2. Read input + gestures. Tap → normal shot. Double-tap → charged
 *      shot. Hold-drag → rotate the cannon via mouse-X delta.
 *   3. Update the Crosshair at the projected landing point.
 *   4. Enemy wave tick: ships enter from L/R, sail through dead zone,
 *      stop just inside the playfield, fire EnemyBalls at the cannon.
 *      After N ships sunk → WON.
 *   5. Update projectile arcs (2.25 s flight, viewport-clamped peak).
 *   6. Resolve collisions: bullet↔target (damage; charged = ×2),
 *      bullet↔enemyball (parry), enemyball↔cannon (player damage).
 *   7. Check win/lose.
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
import * as lose from "./lose.js";
import * as win from "./win.js";

declare const runtimeScene: GdjsRuntimeScene;

const scene = runtimeScene;

state.ensureInit(scene);
ensureBackground(scene);
const cannon = cannonMod.ensureCannon(scene);
hud.ensureHud(scene);

const playing = state.getState(scene) === "playing";
const dt = scene.getElapsedTime() / 1000;
const input = readInput(scene);
const gesture = detectGesture(scene, dt, input.cursor.x, input.cursor.y, input.fire);

if (cannon && playing) {
  // Only let drags steer the cannon — a quick tap shouldn't twitch it.
  const aimDeg = cannonMod.aim(scene, cannon, input.cursor.x, gesture.dragging);
  cannonMod.updateCrosshair(scene, cannon, aimDeg);
  if (gesture.tap) cannonMod.fire(scene, cannon, aimDeg, /*charged*/ false);
  if (gesture.doubleTap) cannonMod.fire(scene, cannon, aimDeg, /*charged*/ true);
  enemyMod.tick(
    scene, dt,
    cannon.getX() + cannon.getCenterX(),
    cannon.getY() + cannon.getCenterY(),
  );
}

proj.update(scene, ObjectName.Bullet, dt);
proj.update(scene, ObjectName.ChargedBullet, dt);
proj.update(scene, ObjectName.EnemyBall, dt);
hud.tick(scene, dt, cannon);
hudHealth.tick(scene, dt);
shake.tick(scene, dt);

if (playing) {
  resolveBulletHits(scene);
  resolveEnemyBallHits(scene, cannon);
  if (enemyMod.isLevelComplete(scene)) state.markWon(scene);
}

// End-of-scene screens. They run after the main loop so the win/lose
// flags can be set by collisions / level-complete checks before we
// decide which screen to show. Only one is active at a time because
// state can only be "won" or "lost", not both.
const endState = state.getState(scene);
if (endState === "lost") {
  lose.tick(scene, input.cursor.x, input.cursor.y, input.firePressed);
} else if (endState === "won") {
  win.tick(scene, input.cursor.x, input.cursor.y, input.firePressed);
}
