// Cannon — the player's primary interactive element. Sits at the BOTTOM
// of the screen as the big foreground sprite; the player views the game
// "from behind the cannon" (first-person framing, per the GDD mockups).
// A Railing sprite renders IN FRONT of the cannon so the player feels
// like they are standing behind their ship's railing.
//
// Sizes are read at runtime from the loaded image, so swapping the art
// for a different size doesn't require a code change here.
//
// Math convention: angle 0 = +X (right). -90 = up. Sprite default
// forward in GDevelop is +X, our cannon art is drawn with the barrel
// pointing up — so the visual rotation we set is `aimDeg + 90`.

import {firstOrNull, spawn, ObjectName} from "./entities.js";
import * as proj from "./projectiles.js";

const BULLET_SPEED = 720;
const AIM_CENTER_DEG = -90;
const AIM_SPREAD_DEG = 15;
const AIM_SENSITIVITY_PX = 140;
const BOTTOM_MARGIN = 14;
const RAILING_BOTTOM_MARGIN = 0;

const CANNON_Z = 10;
const RAILING_Z = 5; // behind the cannon — cannon sits in front, railing peeks out around it

export function ensureCannon(scene: GdjsRuntimeScene): GdjsRuntimeObject | null {
  let c = firstOrNull(scene, ObjectName.Cannon);
  if (c) return c;

  const game = scene.getGame();
  const w = game.getGameResolutionWidth();
  const h = game.getGameResolutionHeight();

  // Spawn the cannon first at (0, 0); read its actual size from the
  // loaded image, then re-position to the bottom centre.
  c = spawn(scene, ObjectName.Cannon, 0, 0);
  if (c) {
    const cw = c.getWidth();
    const ch = c.getHeight();
    const cx = w / 2 - cw / 2;
    const cy = h - ch - BOTTOM_MARGIN;
    c.setX(cx);
    c.setY(cy);
    c.setZOrder(CANNON_Z);
    console.log(`[cannon] spawned ${cw}×${ch} at ${cx},${cy}`);
  }

  // Railing: rendered IN FRONT of the cannon. Centred at the bottom,
  // spans most of the width.
  const r = spawn(scene, ObjectName.Railing, 0, 0);
  if (r) {
    const rw = r.getWidth();
    const rh = r.getHeight();
    const rx = w / 2 - rw / 2;
    const ry = h - rh - RAILING_BOTTOM_MARGIN;
    r.setX(rx);
    r.setY(ry);
    r.setZOrder(RAILING_Z);
    console.log(`[railing] spawned ${rw}×${rh} at ${rx},${ry}`);
  }

  return c;
}

/** Compute aim angle clamped to ±15° of straight up, from cursor X
 *  relative to the cannon's centre. */
export function computeAimDeg(cannonX: number, cursorX: number): number {
  const t = Math.max(-1, Math.min(1, (cursorX - cannonX) / AIM_SENSITIVITY_PX));
  return AIM_CENTER_DEG + t * AIM_SPREAD_DEG;
}

export function aim(cannon: GdjsRuntimeObject, cursorX: number): number {
  const aimDeg = computeAimDeg(cannon.getCenterX(), cursorX);
  cannon.setAngle(aimDeg + 90);
  return aimDeg;
}

export function fire(scene: GdjsRuntimeScene, cannon: GdjsRuntimeObject, aimDeg: number): void {
  const rad = (aimDeg * Math.PI) / 180;
  const dx = Math.cos(rad);
  const dy = Math.sin(rad);
  // Muzzle sits at the top of the barrel, half the cannon's height above
  // its centre. Empirically pull in a bit so the ball doesn't pop out
  // overlapping the muzzle.
  const muzzleOffset = cannon.getHeight() * 0.45;
  const muzzleX = cannon.getCenterX() + dx * muzzleOffset;
  const muzzleY = cannon.getCenterY() + dy * muzzleOffset;
  proj.fire(scene, ObjectName.Bullet, muzzleX, muzzleY, dx, dy, BULLET_SPEED);
}
