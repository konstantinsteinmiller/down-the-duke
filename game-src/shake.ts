// Screen-shake on hit. Triggered by collisions.ts when an enemy ball
// connects with the player's cannon. Implemented by nudging the base
// layer's camera around its default centre (game-resolution / 2) with
// random offsets that decay linearly to zero over the shake duration.
//
// Persistent across the per-frame IIFE via scene variables.

const V_TIMER = "__shakeTimer";        // seconds remaining
const V_DURATION = "__shakeDuration";  // total duration of current shake
const V_INTENSITY = "__shakeIntensity"; // peak px offset

export function trigger(scene: GdjsRuntimeScene, intensityPx: number, durationSec: number): void {
  const vars = scene.getVariables();
  vars.get(V_TIMER).setNumber(durationSec);
  vars.get(V_DURATION).setNumber(durationSec);
  vars.get(V_INTENSITY).setNumber(intensityPx);
}

export function tick(scene: GdjsRuntimeScene, dt: number): void {
  const vars = scene.getVariables();
  const timer = vars.get(V_TIMER).getAsNumber();
  const game = scene.getGame();
  const layer = scene.getLayer("");
  const baseX = game.getGameResolutionWidth() / 2;
  const baseY = game.getGameResolutionHeight() / 2;
  if (timer <= 0) {
    // Snap back to the default camera centre. (No-op once already there.)
    layer.setCameraX(baseX);
    layer.setCameraY(baseY);
    return;
  }
  const next = Math.max(0, timer - dt);
  vars.get(V_TIMER).setNumber(next);
  const duration = vars.get(V_DURATION).getAsNumber();
  const intensity = vars.get(V_INTENSITY).getAsNumber();
  const decay = duration > 0 ? next / duration : 0; // 1 → 0 across the shake
  const offX = (Math.random() - 0.5) * 2 * intensity * decay;
  const offY = (Math.random() - 0.5) * 2 * intensity * decay;
  layer.setCameraX(baseX + offX);
  layer.setCameraY(baseY + offY);
}
