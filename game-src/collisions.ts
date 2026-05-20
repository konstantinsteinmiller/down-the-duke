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
import {damage as damageEnemy, findShipForTarget, flash as flashShip} from "./enemy.js";
import {damagePlayer} from "./state.js";
import * as shake from "./shake.js";

const SHAKE_INTENSITY_PX = 14;
const SHAKE_DURATION_SEC = 0.35;

// Enemy balls arm late so the big cannon sprite isn't hit while the
// ball is still high in its descent. (Player bullets use the stricter
// `landed` flag instead — see below.)
const ENEMY_HIT_ARM_FRAC = 0.7;

/** Fraction (0..1) of the way through a projectile's flight. */
function flightT(b: GdjsRuntimeObject): number {
  const v = b.getVariables();
  const flightTime = v.get("flightTime").getAsNumber() || 2.25;
  return v.get("elapsed").getAsNumber() / flightTime;
}

/** True if the bullet's centre is over the ship's HULL — a tighter
 *  region than the full sprite bounding box (which includes the sails
 *  and transparent margins). Excludes the upper sails and the outer
 *  edges so grazing the image corner doesn't count as a body hit. */
function bulletOverHull(b: GdjsRuntimeObject, e: GdjsRuntimeObject): boolean {
  const bx = b.getX() + b.getWidth() / 2;
  const by = b.getY() + b.getHeight() / 2;
  const ex = e.getX();
  const ey = e.getY();
  const ew = e.getWidth();
  const eh = e.getHeight();
  return bx >= ex + ew * 0.20 && bx <= ex + ew * 0.80
    && by >= ey + eh * 0.42 && by <= ey + eh * 0.95;
}

// Per the updated GDD:
//   Normal shot:  2 dmg on the weak point, 0.5 dmg on a body graze.
//   Charged shot: 2.5× normal — 5 dmg weak, 1.25 dmg body.
//   Charged shot intercepted by an enemy cannonball: passes through
//     with damage cut to 1.25× normal — 2.5 dmg weak, 0.625 dmg body.
const BULLET_DAMAGE = 1;
const BULLET_BODY_DAMAGE = 0.25;
const CHARGED_MULTIPLIER = 2.5;
const CHARGED_INTERCEPTED_MULTIPLIER = 1.25;
const ENEMY_BALL_DAMAGE = 1;

function bulletDamage(charged: boolean, intercepted: boolean, body: boolean): number {
  const base = body ? BULLET_BODY_DAMAGE : BULLET_DAMAGE;
  if (!charged) return base;
  return base * (intercepted ? CHARGED_INTERCEPTED_MULTIPLIER : CHARGED_MULTIPLIER);
}

function hit(a: GdjsRuntimeObject, b: GdjsRuntimeObject): boolean {
  return gdjs.RuntimeObject.collisionTest(a, b, false);
}

export function resolveBulletHits(scene: GdjsRuntimeScene): { kills: number; parries: number } {
  // Charged red bullets are a separate sprite — merge them into one
  // list so the rest of the hit-detection loop doesn't care.
  const bullets = all(scene, ObjectName.Bullet).concat(all(scene, ObjectName.ChargedBullet));
  if (bullets.length === 0) return {kills: 0, parries: 0};
  const targets = all(scene, ObjectName.Target);
  const enemyBalls = all(scene, ObjectName.EnemyBall);
  let kills = 0;
  let parries = 0;
  for (const b of bullets) {
    let consumed = false;
    const charged = b.getVariables().get("charged").getAsNumber() === 1;
    // Parry / intercept on incoming enemy fire.
    //   Normal bullet  → both destroyed (mutual annihilation).
    //   Charged bullet → only the enemy ball pops; the charged shot
    //                    continues with an `intercepted` flag that
    //                    cuts its subsequent damage to 1.25× normal.
    for (const eb of enemyBalls) {
      if (hit(b, eb)) {
        eb.deleteFromScene(scene);
        if (charged) {
          b.getVariables().get("intercepted").setNumber(1);
          parries += 1;
        } else {
          b.deleteFromScene(scene);
          parries += 1;
          consumed = true;
        }
        break;
      }
    }
    if (consumed) continue;
    // Player bullets only register a ship hit once their flight time is
    // fully over — the projectiles module flags `landed` on the final
    // frame and holds the ball at its landing point for this check. So
    // a shot always completes its whole arc before it can damage a ship.
    if (b.getVariables().get("landed").getAsNumber() !== 1) continue;
    const intercepted = b.getVariables().get("intercepted").getAsNumber() === 1;
    // Direct hit on a ship's weak point → full damage + white flash.
    // Skip if the ship is still in its dead-zone entry phase (state=0).
    let handled = false;
    for (const t of targets) {
      if (hit(b, t)) {
        const dmg = bulletDamage(charged, intercepted, /*body*/ false);
        b.deleteFromScene(scene);
        const ship = findShipForTarget(scene, t);
        const state = ship ? ship.getVariables().get("state").getAsNumber() : 0;
        if (ship && state === 1) {
          flashShip(ship, /*direct*/ true);
          if (damageEnemy(scene, ship, dmg)) kills += 1;
        }
        handled = true;
        break;
      }
    }
    if (handled) continue;
    // Off-target body hit → grazing damage + yellow flash. Uses the
    // tighter hull region so a shot only counts when it's actually over
    // the ship's body, not its transparent sprite edge.
    for (const e of all(scene, ObjectName.Enemy)) {
      if (bulletOverHull(b, e)) {
        const state = e.getVariables().get("state").getAsNumber();
        if (state === 1) {
          const dmg = bulletDamage(charged, intercepted, /*body*/ true);
          flashShip(e, /*direct*/ false);
          if (damageEnemy(scene, e, dmg)) kills += 1;
        }
        b.deleteFromScene(scene);
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
    // Arm late so the ball reaches the cannon at the bottom of its
    // descent rather than clipping the tall cannon sprite's top edge.
    if (flightT(b) < ENEMY_HIT_ARM_FRAC) continue;
    if (hit(b, cannon)) {
      b.deleteFromScene(scene);
      damagePlayer(scene, ENEMY_BALL_DAMAGE);
      shake.trigger(scene, SHAKE_INTENSITY_PX, SHAKE_DURATION_SEC);
      dmg += ENEMY_BALL_DAMAGE;
    }
  }
  return dmg;
}
