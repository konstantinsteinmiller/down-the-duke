/**
 * Game entry point — bundled to an IIFE and injected as the Main scene's
 * single JsCode event. Runs every frame. Module-level code re-executes
 * each frame, so persistent state lives on scene/object variables.
 *
 * Level 1 mocked loop (static screen, arcade cannon shooter):
 *   1. Init scene state on first frame (HP, background, cannon at bottom).
 *   2. Read input → aim cannon (±15° from up via cursor X), fire Bullet
 *      on click/space edge.
 *   3. Enemy wave tick: ships enter from L/R at the top, sail through
 *      their dead-zone strip (no-fire), stop just inside the playfield,
 *      fire EnemyBalls at the cannon. After N ships sunk → WON.
 *   4. Update projectile positions (cull off-screen).
 *   5. Resolve collisions: bullet↔target (damage parent ship),
 *      bullet↔enemyball (parry), enemyball↔cannon (player damage).
 *   6. Check win/lose.
 */

import {readInput} from "./input.js";
import {ObjectName} from "./entities.js";
import * as proj from "./projectiles.js";
import * as cannonMod from "./cannon.js";
import * as enemyMod from "./enemy.js";
import * as state from "./state.js";
import {ensureBackground} from "./background.js";
import {resolveBulletHits, resolveEnemyBallHits} from "./collisions.js";

declare const runtimeScene: GdjsRuntimeScene;

const scene = runtimeScene;

state.ensureInit(scene);
ensureBackground(scene);
const cannon = cannonMod.ensureCannon(scene);

const playing = state.getState(scene) === "playing";
const dt = scene.getElapsedTime() / 1000;
const input = readInput(scene);

if (cannon && playing) {
  const aimDeg = cannonMod.aim(cannon, input.cursor.x);
  if (input.firePressed) cannonMod.fire(scene, cannon, aimDeg);
  enemyMod.tick(scene, dt, cannon.getCenterX(), cannon.getCenterY());
}

proj.update(scene, ObjectName.Bullet, dt);
proj.update(scene, ObjectName.EnemyBall, dt);

if (playing) {
  resolveBulletHits(scene);
  resolveEnemyBallHits(scene, cannon);
  if (enemyMod.isLevelComplete(scene)) state.markWon(scene);
}
