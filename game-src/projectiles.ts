// Time-based parabolic projectile motion. Each cannonball travels for
// exactly FLIGHT_TIME_SEC from its spawn point to a target position,
// arcing along a parabola whose peak is clamped to stay inside the
// viewport. Collisions are checked elsewhere (collisions.ts) every
// frame, so a ball that overlaps its target sprite mid-arc still
// registers as a hit.
//
// Per the GDD: "Impact ship in 2.25 seconds" — same flight time for
// both player and enemy fire so the visual rhythm is symmetric.
//
// Parametrisation
//   x(t) = sx + (tx − sx) · t
//   y(t) = sy + (ty − sy) · t − arcH · 4 · t · (1 − t)
//   where t ∈ [0, 1], t = elapsed / FLIGHT_TIME_SEC.
// The arc subtracts from y (lifts the ball upward on screen) with peak
// at t = 0.5 − (ty − sy) / (8 · arcH). We pick arcH from a heuristic
// (proportional to distance) and then clamp it analytically so the peak
// y stays above VIEWPORT_PEAK_MARGIN_PX — i.e. the ball never leaves
// the top of the viewport.

import {all, spawn, ObjectName} from "./entities.js";

const FLIGHT_TIME_SEC = 2.25;
// Red cannonballs are slower per the GDD: ~4 s in the air, big
// wobble, bigger sprite. ChargedBullet is the player's red ball.
const FLIGHT_TIME_RED_SEC = 4.0;

// ── Cannonball launch sizes (display px at the moment of firing) ──
// Player balls launch close to the camera (big) and shrink as they
// fly toward the distant enemy. Enemy balls launch far (small) and
// grow as they approach the player. Tweak these to taste.
const INITIAL_PLAYER_CANNONBALL_SIZE = 80;
const INITIAL_ENEMY_CANNONBALL_SIZE = 13;
const CHARGED_SIZE_MULTIPLIER = 2; // special red ball is this × the normal player ball

// Perspective amounts: how much the ball scales over its flight.
//   Player: shrinks to (1 − PLAYER_SHRINK) of its launch size.
//   Enemy:  grows to (1 + ENEMY_GROW) of its launch size.
const PLAYER_SHRINK = 0.85; // 80 px → ~13 px
const ENEMY_GROW = 6.05;    // 13 px → ~80 px

// Sinusoidal side-to-side wobble for red balls. Amplitude in px,
// frequency in oscillations per second.
const WOBBLE_AMP_PX = 28;
const WOBBLE_HZ = 1.6;
const VIEWPORT_PEAK_MARGIN_PX = 24;
const MIN_ARC_HEIGHT_PX = 80;

/** Kinds that get the per-frame perspective scaling treatment. */
function isScaledBall(kind: ObjectName): boolean {
  return kind === ObjectName.Bullet || kind === ObjectName.ChargedBullet
    || kind === ObjectName.EnemyBall || kind === ObjectName.EnemyRedBall;
}

/** Enemy projectiles (grow toward the camera). */
function isEnemyBall(kind: ObjectName): boolean {
  return kind === ObjectName.EnemyBall || kind === ObjectName.EnemyRedBall;
}

/** Launch (t=0) display size for a given projectile kind. */
function launchSizeFor(kind: ObjectName): number {
  if (kind === ObjectName.EnemyRedBall) return INITIAL_ENEMY_CANNONBALL_SIZE * 1.5; // bigger hitbox
  if (kind === ObjectName.EnemyBall) return INITIAL_ENEMY_CANNONBALL_SIZE;
  if (kind === ObjectName.ChargedBullet) return INITIAL_PLAYER_CANNONBALL_SIZE * CHARGED_SIZE_MULTIPLIER;
  return INITIAL_PLAYER_CANNONBALL_SIZE; // Bullet
}

export interface FireOptions {
  /** Player's charged shot (double-tap) — bigger ball, 2× damage. */
  charged?: boolean;
  /** Horizontal arc amplitude in pixels. Positive pushes the ball
   *  rightward at the midpoint of its flight before curving back to
   *  the linear endpoint; negative pushes leftward. Used by enemy
   *  cannonballs to fly out from the ship's side and curve over to
   *  the player, matching the GDD "Ball Trajectory" sketch. */
  xArcAmp?: number;
  /** Override the flight time (seconds). Defaults by kind: 4 s for the
   *  red ChargedBullet, 2.25 s otherwise. Level 2's fast charged shot
   *  passes a shorter value (1.25× speed) without changing Level 1. */
  flightTimeSec?: number;
  /** Override the side-to-side wobble. Defaults to on for the red
   *  ChargedBullet, off otherwise. */
  wobble?: boolean;
}

/**
 * Largest arc height for which the parabola's peak stays at y >= margin
 * during flight. Derived by solving
 *   sy − (4A − u)² / (16A) = margin     where u = ty − sy
 * for A. Two roots; we take the larger one (peak y is non-monotonic in
 * A — it rises as A grows past |u|/4 and then falls; the larger root is
 * the upper bound where peak crosses the margin from below).
 */
function maxAllowedArcH(sy: number, ty: number, margin: number): number {
  const u = ty - sy;
  const M = sy - margin;
  if (M <= 0) return Number.POSITIVE_INFINITY;
  const disc = 256 * M * (M + u); // = 256 · (sy−margin) · (ty−margin)
  if (disc <= 0) return Number.POSITIVE_INFINITY;
  return (8 * u + 16 * M + Math.sqrt(disc)) / 32;
}

function centerOn(p: GdjsRuntimeObject, x: number, y: number): void {
  p.setX(x - p.getWidth() / 2);
  p.setY(y - p.getHeight() / 2);
}

/**
 * Fire a projectile that arcs from (startX, startY) to (targetX, targetY)
 * over FLIGHT_TIME_SEC. Coordinates are interpreted as the ball's
 * desired *centre* — the sprite's top-left is offset accordingly.
 */
export function fire(
  scene: GdjsRuntimeScene,
  kind: ObjectName,
  startX: number,
  startY: number,
  targetX: number,
  targetY: number,
  opts: FireOptions = {},
): GdjsRuntimeObject | null {
  const p = spawn(scene, kind, startX, startY);
  if (!p) return null;
  const charged = opts.charged === true;
  // Capture the native (un-scaled) sprite width BEFORE any setScale,
  // so the per-frame perspective scaler always knows the true source
  // dimension. (Previously we tried to recover this after setScale
  // and ended up storing 28 instead of 103, which made the per-frame
  // setScale apply a too-large factor — the ball was 3-4× its
  // intended size, causing visual + collision oddities.)
  let nativeW = 0;
  if (isScaledBall(kind)) {
    nativeW = p.getWidth();
    const displaySize = launchSizeFor(kind);
    if (nativeW > 0) p.setScale(displaySize / nativeW);
  }
  centerOn(p, startX, startY);
  const horizDist = Math.abs(targetX - startX);
  const vertSpan = Math.abs(targetY - startY);
  // Tuned so symmetric player↑ and enemy↓ shots peak around y≈150
  // on a 380×800 portrait.
  const desired = Math.max(MIN_ARC_HEIGHT_PX, vertSpan * 0.55 + horizDist * 0.45);
  const maxAllowed = maxAllowedArcH(startY, targetY, VIEWPORT_PEAK_MARGIN_PX);
  const arcH = Math.min(desired, maxAllowed);
  const v = p.getVariables();
  // IMPORTANT: GDevelop pools and reuses object instances, so a freshly
  // spawned ball may carry stale variables from a previous life. Reset
  // every per-shot flag explicitly. The `landed` flag in particular, if
  // left at 1 from a recycled instance, made the ball register a ship
  // hit on the way UP at ~1 s instead of waiting out its full flight.
  v.get("landed").setNumber(0);
  v.get("intercepted").setNumber(0);
  v.get("catchable").setNumber(0);
  v.get("charged").setNumber(charged ? 1 : 0);
  v.get("startX").setNumber(startX);
  v.get("startY").setNumber(startY);
  v.get("targetX").setNumber(targetX);
  v.get("targetY").setNumber(targetY);
  v.get("arcH").setNumber(arcH);
  v.get("xArcAmp").setNumber(opts.xArcAmp ?? 0);
  v.get("elapsed").setNumber(0);
  // Red cannonballs (ChargedBullet for the player, EnemyRedBall for the
  // enemy) wobble side-to-side and take longer to land — unless the
  // caller overrides (Level 2's charged shot is fast + flat).
  const isRed = kind === ObjectName.ChargedBullet || kind === ObjectName.EnemyRedBall;
  const flightTime = opts.flightTimeSec ?? (isRed ? FLIGHT_TIME_RED_SEC : FLIGHT_TIME_SEC);
  const wobble = opts.wobble ?? isRed;
  v.get("flightTime").setNumber(flightTime);
  v.get("wobbleAmp").setNumber(wobble ? WOBBLE_AMP_PX : 0);
  // Persist what the per-frame perspective scaler needs.
  if (isScaledBall(kind)) {
    v.get("baseSize").setNumber(launchSizeFor(kind));
    v.get("nativeW").setNumber(nativeW);
  }
  return p;
}

/**
 * Depth-based scale factor for perspective. Player balls start large
 * (close to the camera) and shrink as they fly away to the distant
 * enemy. Enemy balls do the opposite — they grow as they approach the
 * player. Linear interpolation between near/far display sizes.
 */
function depthScale(t: number, kind: ObjectName): number {
  // Multiplier applied to the launch size over the ball's flight, so
  // every kind starts at exactly its INITIAL_*_CANNONBALL_SIZE at t=0.
  //   Player / charged: shrink away from the camera (1 → 1−PLAYER_SHRINK).
  //   Enemy:            grow toward the camera     (1 → 1+ENEMY_GROW).
  if (isEnemyBall(kind)) return 1.0 + ENEMY_GROW * t;
  return 1.0 - PLAYER_SHRINK * t; // Bullet + ChargedBullet
}

export function update(scene: GdjsRuntimeScene, kind: ObjectName, dt: number): void {
  for (const p of all(scene, kind)) {
    const v = p.getVariables();
    const elapsed = v.get("elapsed").getAsNumber() + dt;
    const flightTime = v.get("flightTime").getAsNumber() || FLIGHT_TIME_SEC;
    if (elapsed >= flightTime) {
      // Flight finished. Hold the ball at its exact landing point for a
      // single frame, flagged `landed`, so the collision pass evaluates
      // the impact only now (flight time over) rather than mid-arc. The
      // next frame removes it.
      if (v.get("landed").getAsNumber() === 1) {
        p.deleteFromScene(scene);
        continue;
      }
      v.get("landed").setNumber(1);
      v.get("elapsed").setNumber(flightTime);
      const tx0 = v.get("targetX").getAsNumber();
      const ty0 = v.get("targetY").getAsNumber();
      if (isScaledBall(kind)) {
        const baseSize = v.get("baseSize").getAsNumber();
        const nativeW = v.get("nativeW").getAsNumber();
        if (baseSize > 0 && nativeW > 0) {
          p.setScale((baseSize * depthScale(1, kind)) / nativeW);
        }
      }
      centerOn(p, tx0, ty0);
      continue;
    }
    v.get("elapsed").setNumber(elapsed);
    const t = elapsed / flightTime;
    const sx = v.get("startX").getAsNumber();
    const sy = v.get("startY").getAsNumber();
    const tx = v.get("targetX").getAsNumber();
    const ty = v.get("targetY").getAsNumber();
    const arcH = v.get("arcH").getAsNumber();
    const xArcAmp = v.get("xArcAmp").getAsNumber();
    const wobbleAmp = v.get("wobbleAmp").getAsNumber();
    let x = sx + (tx - sx) * t + xArcAmp * 4 * t * (1 - t);
    const y = sy + (ty - sy) * t - arcH * 4 * t * (1 - t);
    // Red-ball wobble: sinusoidal side-to-side jitter, damped slightly
    // at the ends so it doesn't snap off the spawn / target points.
    if (wobbleAmp !== 0) {
      const damp = Math.sin(Math.PI * t); // 0 at endpoints, 1 in the middle
      x += Math.sin(2 * Math.PI * WOBBLE_HZ * elapsed) * wobbleAmp * damp;
    }
    // Perspective scale: shrink as it gets farther from the camera.
    if (isScaledBall(kind)) {
      const baseSize = v.get("baseSize").getAsNumber();
      const nativeW = v.get("nativeW").getAsNumber();
      if (baseSize > 0 && nativeW > 0) {
        const size = baseSize * depthScale(t, kind);
        p.setScale(size / nativeW);
      }
    }
    centerOn(p, x, y);
  }
}
