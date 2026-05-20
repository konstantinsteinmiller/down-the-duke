// Lightweight visual effects — currently the radial "burst" used for
// catch-can flashes and enemy explosions. A burst is a Burst sprite
// that scales up and fades out over its short lifetime. Pooled like the
// projectiles; state lives on object variables so it survives the
// per-frame IIFE re-run.

import {all, firstOrNull, spawn, ObjectName} from "./entities.js";

const BURST_LIFE_SEC = 0.45;
const BURST_Z = 70;

// Full-screen colour flash. Stretched to cover the playfield, tinted and
// faded out fast. Sits below the popups/text (z 55) so callouts stay on
// top. One reused instance; `flashOn`/intensity live on its variables.
const FLASH_Z = 55;
const FLASH_FADE_PER_SEC = 900; // opacity units / second (≈0.2 s from 180)

/** Punch a brief full-screen flash of `color` at the given peak opacity. */
export function flash(scene: GdjsRuntimeScene, color: string, intensity = 150): void {
  let f = firstOrNull(scene, ObjectName.Flash);
  if (!f) f = spawn(scene, ObjectName.Flash, 0, 0);
  if (!f) return;
  const game = scene.getGame();
  f.setWidth(game.getGameResolutionWidth());
  f.setHeight(game.getGameResolutionHeight());
  f.setX(0);
  f.setY(0);
  f.setColor(color);
  f.setZOrder(FLASH_Z);
  f.hide(false);
  f.setOpacity(intensity);
  f.getVariables().get("flashOn").setNumber(1);
}

function tickFlash(scene: GdjsRuntimeScene, dt: number): void {
  const f = firstOrNull(scene, ObjectName.Flash);
  if (!f || f.getVariables().get("flashOn").getAsNumber() !== 1) return;
  const op = f.getOpacity() - FLASH_FADE_PER_SEC * dt;
  if (op <= 0) {
    f.setOpacity(0);
    f.hide(true);
    f.getVariables().get("flashOn").setNumber(0);
  } else {
    f.setOpacity(op);
  }
}

/** Spawn a burst centred at (x, y) that grows to `peakSize` px wide. */
export function spawnBurst(scene: GdjsRuntimeScene, x: number, y: number, peakSize: number): void {
  const b = spawn(scene, ObjectName.Burst, 0, 0);
  if (!b) return;
  const nativeW = b.getWidth();
  const v = b.getVariables();
  v.get("nativeW").setNumber(nativeW);
  v.get("peakSize").setNumber(peakSize);
  v.get("life").setNumber(0);
  v.get("cx").setNumber(x);
  v.get("cy").setNumber(y);
  b.setZOrder(BURST_Z);
  if (nativeW > 0) b.setScale((peakSize * 0.3) / nativeW);
  b.setX(x - b.getWidth() / 2);
  b.setY(y - b.getHeight() / 2);
}

export function tick(scene: GdjsRuntimeScene, dt: number): void {
  tickFlash(scene, dt);
  for (const b of all(scene, ObjectName.Burst)) {
    const v = b.getVariables();
    const life = v.get("life").getAsNumber() + dt;
    v.get("life").setNumber(life);
    const t = life / BURST_LIFE_SEC;
    if (t >= 1) {
      b.deleteFromScene(scene);
      continue;
    }
    const nativeW = v.get("nativeW").getAsNumber();
    const peakSize = v.get("peakSize").getAsNumber();
    const cx = v.get("cx").getAsNumber();
    const cy = v.get("cy").getAsNumber();
    const size = peakSize * (0.3 + 0.9 * t);
    if (nativeW > 0) b.setScale(size / nativeW);
    b.setX(cx - b.getWidth() / 2);
    b.setY(cy - b.getHeight() / 2);
    b.setOpacity(Math.round(255 * (1 - t)));
  }
}
