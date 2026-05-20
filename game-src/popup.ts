// Floating popup callouts — short-lived text that pops in, drifts up and
// fades ("PARRIED!", "DEFLECTED!", "CAUGHT!", etc.). Pooled like the
// projectiles; each Popup instance carries its own lifetime on object
// variables so it survives the per-frame IIFE re-run.

import {all, spawn, ObjectName} from "./entities.js";

const LIFE_SEC = 0.95;
const RISE_PX = 50;
const Z_POPUP = 80;

/** Spawn a popup centred at (x, y) that rises and fades. */
export function show(
  scene: GdjsRuntimeScene,
  text: string,
  x: number,
  y: number,
  color = "255;235;170",
): void {
  const p = spawn(scene, ObjectName.Popup, 0, 0);
  if (!p) return;
  p.setString(text);
  p.setColor(color);
  const v = p.getVariables();
  v.get("life").setNumber(0);
  v.get("x0").setNumber(x);
  v.get("y0").setNumber(y);
  p.setZOrder(Z_POPUP);
  p.setX(x - p.getWidth() / 2);
  p.setY(y);
  p.setOpacity(255);
}

export function tick(scene: GdjsRuntimeScene, dt: number): void {
  for (const p of all(scene, ObjectName.Popup)) {
    const v = p.getVariables();
    const life = v.get("life").getAsNumber() + dt;
    v.get("life").setNumber(life);
    const t = life / LIFE_SEC;
    if (t >= 1) {
      p.deleteFromScene(scene);
      continue;
    }
    const x0 = v.get("x0").getAsNumber();
    const y0 = v.get("y0").getAsNumber();
    p.setX(x0 - p.getWidth() / 2);
    p.setY(y0 - RISE_PX * t);
    p.setZOrder(Z_POPUP);
    // Pop in over the first 15%, then ease out.
    const a = t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85;
    p.setOpacity(Math.round(255 * Math.max(0, Math.min(1, a))));
  }
}
