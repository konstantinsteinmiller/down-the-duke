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
const BALL_DISPLAY_SIZE_PX = 28;
const CHARGED_BALL_DISPLAY_SIZE_PX = 44;
const VIEWPORT_PEAK_MARGIN_PX = 24;
const MIN_ARC_HEIGHT_PX = 80;

export interface FireOptions {
  /** Player's charged shot (double-tap) — bigger ball, 2× damage. */
  charged?: boolean;
  /** Horizontal arc amplitude in pixels. Positive pushes the ball
   *  rightward at the midpoint of its flight before curving back to
   *  the linear endpoint; negative pushes leftward. Used by enemy
   *  cannonballs to fly out from the ship's side and curve over to
   *  the player, matching the GDD "Ball Trajectory" sketch. */
  xArcAmp?: number;
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
  if (kind === ObjectName.Bullet || kind === ObjectName.ChargedBullet || kind === ObjectName.EnemyBall) {
    nativeW = p.getWidth();
    const displaySize = charged ? CHARGED_BALL_DISPLAY_SIZE_PX : BALL_DISPLAY_SIZE_PX;
    if (nativeW > 0) p.setScale(displaySize / nativeW);
  }
  centerOn(p, startX, startY);
  if (charged) p.getVariables().get("charged").setNumber(1);
  const horizDist = Math.abs(targetX - startX);
  const vertSpan = Math.abs(targetY - startY);
  // Tuned so symmetric player↑ and enemy↓ shots peak around y≈150
  // on a 380×800 portrait.
  const desired = Math.max(MIN_ARC_HEIGHT_PX, vertSpan * 0.55 + horizDist * 0.45);
  const maxAllowed = maxAllowedArcH(startY, targetY, VIEWPORT_PEAK_MARGIN_PX);
  const arcH = Math.min(desired, maxAllowed);
  const v = p.getVariables();
  v.get("startX").setNumber(startX);
  v.get("startY").setNumber(startY);
  v.get("targetX").setNumber(targetX);
  v.get("targetY").setNumber(targetY);
  v.get("arcH").setNumber(arcH);
  v.get("xArcAmp").setNumber(opts.xArcAmp ?? 0);
  v.get("elapsed").setNumber(0);
  // Persist what the per-frame perspective scaler needs.
  if (kind === ObjectName.Bullet || kind === ObjectName.ChargedBullet || kind === ObjectName.EnemyBall) {
    const baseSize = charged ? CHARGED_BALL_DISPLAY_SIZE_PX : BALL_DISPLAY_SIZE_PX;
    v.get("baseSize").setNumber(baseSize);
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
  // Cannonballs read at ~100 m apart between the player and the enemy
  // ship: approaching balls grow toward the camera, receding balls
  // shrink away from it. Tuned for visibility at all stages — both
  // kinds stay in roughly the same 12–28 px range on screen.
  //   Player balls: 100% at launch (close, ~28 px) → 45% at impact (~13 px).
  //   Enemy ball:    45% at launch (far,    ~13 px) → 100% at impact (~28 px).
  // Charged bullet shares the player curve so the red ball reads as
  // travelling alongside the regular black one — just bigger overall.
  if (kind === ObjectName.Bullet || kind === ObjectName.ChargedBullet) return 1.0 - 0.55 * t;
  if (kind === ObjectName.EnemyBall) return 0.45 + 0.55 * t;
  return 1.0;
}

export function update(scene: GdjsRuntimeScene, kind: ObjectName, dt: number): void {
  for (const p of all(scene, kind)) {
    const v = p.getVariables();
    const elapsed = v.get("elapsed").getAsNumber() + dt;
    if (elapsed >= FLIGHT_TIME_SEC) {
      // Ball completed its arc without hitting anything.
      p.deleteFromScene(scene);
      continue;
    }
    v.get("elapsed").setNumber(elapsed);
    const t = elapsed / FLIGHT_TIME_SEC;
    const sx = v.get("startX").getAsNumber();
    const sy = v.get("startY").getAsNumber();
    const tx = v.get("targetX").getAsNumber();
    const ty = v.get("targetY").getAsNumber();
    const arcH = v.get("arcH").getAsNumber();
    const xArcAmp = v.get("xArcAmp").getAsNumber();
    const x = sx + (tx - sx) * t + xArcAmp * 4 * t * (1 - t);
    const y = sy + (ty - sy) * t - arcH * 4 * t * (1 - t);
    // Perspective scale: shrink as it gets farther from the camera.
    if (kind === ObjectName.Bullet || kind === ObjectName.ChargedBullet || kind === ObjectName.EnemyBall) {
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
