// Lightweight visual effects — currently the radial "burst" used for
// catch-can flashes and enemy explosions. A burst is a Burst sprite
// that scales up and fades out over its short lifetime. Pooled like the
// projectiles; state lives on object variables so it survives the
// per-frame IIFE re-run.

import {all, spawn, ObjectName} from "./entities.js";

const BURST_LIFE_SEC = 0.45;
const BURST_Z = 70;

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
