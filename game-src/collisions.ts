// Hit detection for the Level 1 mocked gameplay loop.
//
//   Bullet ↔ Target    → full damage to the ship that owns the target
//   Bullet ↔ EnemyBall → parry (both destroyed)
//   EnemyBall ↔ Cannon → player damage
//
// We deliberately do NOT register Bullet ↔ Enemy as a hit — only target
// strikes count for damage. (The design doc has a partial-damage off-target
// rule; deferring that until basic combat feels right.)

import {all, ObjectName} from "./entities.js";
import {damage as damageEnemy, findShipForTarget} from "./enemy.js";
import {damagePlayer} from "./state.js";

const BULLET_DAMAGE = 1;
const ENEMY_BALL_DAMAGE = 1;

function hit(a: GdjsRuntimeObject, b: GdjsRuntimeObject): boolean {
  return gdjs.RuntimeObject.collisionTest(a, b, false);
}

export function resolveBulletHits(scene: GdjsRuntimeScene): { kills: number; parries: number } {
  const bullets = all(scene, ObjectName.Bullet);
  if (bullets.length === 0) return {kills: 0, parries: 0};
  const targets = all(scene, ObjectName.Target);
  const enemyBalls = all(scene, ObjectName.EnemyBall);
  let kills = 0;
  let parries = 0;
  for (const b of bullets) {
    let consumed = false;
    // Parry first — incoming enemy fire intercepted in mid-air.
    for (const eb of enemyBalls) {
      if (hit(b, eb)) {
        eb.deleteFromScene(scene);
        b.deleteFromScene(scene);
        parries += 1;
        consumed = true;
        break;
      }
    }
    if (consumed) continue;
    // Direct hit on a ship's weak point. Skip the damage if the ship is
    // still in its dead-zone entry phase (state=0) — bullets pass
    // through harmlessly to honour the "no-fire favours the player"
    // rule going both ways: the player gets the window to aim, but the
    // ship is invulnerable until it crosses into the playfield.
    for (const t of targets) {
      if (hit(b, t)) {
        b.deleteFromScene(scene);
        const ship = findShipForTarget(scene, t);
        const state = ship ? ship.getVariables().get("state").getAsNumber() : 0;
        if (ship && state === 1 && damageEnemy(scene, ship, BULLET_DAMAGE)) {
          kills += 1;
        }
        break;
      }
    }
  }
  return {kills, parries};
}

export function resolveEnemyBallHits(scene: GdjsRuntimeScene, cannon: GdjsRuntimeObject | null): number {
  if (!cannon) return 0;
  const balls = all(scene, ObjectName.EnemyBall);
  if (balls.length === 0) return 0;
  let dmg = 0;
  for (const b of balls) {
    if (hit(b, cannon)) {
      b.deleteFromScene(scene);
      damagePlayer(scene, ENEMY_BALL_DAMAGE);
      dmg += ENEMY_BALL_DAMAGE;
    }
  }
  return dmg;
}
