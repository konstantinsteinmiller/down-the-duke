// Cannon — the player's primary interactive element. Sits at the BOTTOM
// of the screen as the big foreground sprite; the player views the game
// "from behind the cannon" (first-person framing, per the GDD mockups).
// A Railing sprite renders BEHIND the cannon to frame the bottom edge.
// A Crosshair sprite is positioned every frame at the projected landing
// point of the next shot, so the player can see where the cannonball
// will end up before they fire.
//
// Aim updates only while the player is dragging (a held touch / left
// mouse button). On desktop or mobile, a quick release within the tap
// threshold doesn't move the cannon.
//
// Math convention: angle 0 = +X (right). -90 = up.

import {firstOrNull, spawn, ObjectName} from "./entities.js";
import * as proj from "./projectiles.js";
import * as hud from "./hud.js";

const AIM_CENTER_DEG = -90;
const AIM_SPREAD_DEG = 15;
// Aim lands on the ship's HULL (where the crew / weak point sit), not
// the sails up top. Ship spawns at y=140 and is 181 tall, so the hull
// is around y=240–320 — splitting the difference at y=270 puts the
// crosshair on the deck just above the waterline.
const TARGET_BAND_Y = 270;

const AIM_DEG_PER_PX = 1 / 8;
const AIM_DEG_VAR = "__aimDeg";
const PREV_CURSOR_X_VAR = "__prevCursorX";
const AIM_INIT_VAR = "__aimInit";

// Layout, derived from the user's reference mockup (380×800 portrait):
//   - Cannon spans ~62% of the screen width, centred, with its base
//     extending past the bottom edge so only the breech + barrel show.
//     Its cap (top) lands around 63% of the screen height.
//   - Railing fills the full width, anchored so its top rail sits just
//     above the cannon's breech (~70% height) and the posts run off the
//     bottom. Drawn behind the cannon.
const CANNON_WIDTH_FRAC = 0.62;
const CANNON_BOTTOM_OVERHANG = 28; // px the cannon base pokes below the screen
const RAILING_TOP_FRAC = 0.70;     // top of the railing sprite as a fraction of height

const CANNON_Z = 10;
const RAILING_Z = 5;
const CROSSHAIR_Z = 15;

// Muzzle sits this fraction of the cannon's scaled height above its
// pivot (breech ≈69% down), along the aim direction. The barrel tip is
// roughly 62% of the full sprite height above the breech pivot. Stored
// at spawn so fire() doesn't read the rotation-sensitive AABB height.
const MUZZLE_OFFSET_FRAC = 0.62;
const CANNON_MUZZLE_OFFSET_VAR = "__cannonMuzzleOffset";

export function ensureCannon(scene: GdjsRuntimeScene): GdjsRuntimeObject | null {
  let c = firstOrNull(scene, ObjectName.Cannon);
  if (c) return c;

  const game = scene.getGame();
  const w = game.getGameResolutionWidth();
  const h = game.getGameResolutionHeight();

  // Railing first so it renders behind the cannon. Scaled to full width.
  const r = spawn(scene, ObjectName.Railing, 0, 0);
  if (r) {
    const rnw = r.getWidth();
    if (rnw > 0) r.setScale(w / rnw);
    r.setX(0);
    r.setY(h * RAILING_TOP_FRAC);
    r.setZOrder(RAILING_Z);
  }

  c = spawn(scene, ObjectName.Cannon, 0, 0);
  if (c) {
    const cnw = c.getWidth();
    const cnh = c.getHeight();
    const scale = cnw > 0 ? (w * CANNON_WIDTH_FRAC) / cnw : 1;
    c.setScale(scale);
    const dispW = cnw * scale;
    const dispH = cnh * scale;
    c.setX(w / 2 - dispW / 2);
    c.setY(h - dispH + CANNON_BOTTOM_OVERHANG);
    c.setZOrder(CANNON_Z);
    c.getVariables().get(CANNON_MUZZLE_OFFSET_VAR).setNumber(dispH * MUZZLE_OFFSET_FRAC);
    console.log(`[cannon] spawned scaled ${dispW.toFixed(0)}×${dispH.toFixed(0)}`);
  }

  return c;
}

/** World centre of the cannon's centre point. GDJS's `getCenterX/Y` on
 *  Sprite returns local-frame coordinates — origin + that gives scene
 *  coords. Rotation pivots around the centre, so this is rotation-safe. */
function cannonCenter(cannon: GdjsRuntimeObject): { x: number; y: number } {
  return {
    x: cannon.getX() + cannon.getCenterX(),
    y: cannon.getY() + cannon.getCenterY(),
  };
}

/** Project the aim ray onto the enemy band (y = TARGET_BAND_Y) and
 *  clamp into the viewport. Used by both fire() and the crosshair. */
function aimTarget(scene: GdjsRuntimeScene, cannon: GdjsRuntimeObject, aimDeg: number): { x: number; y: number } {
  const rad = (aimDeg * Math.PI) / 180;
  const dx = Math.cos(rad);
  const dy = Math.sin(rad);
  const {x: cx, y: cy} = cannonCenter(cannon);
  const game = scene.getGame();
  const w = game.getGameResolutionWidth();
  const h = game.getGameResolutionHeight();
  let tx: number, ty: number;
  if (dy < -0.05) {
    const tDist = (TARGET_BAND_Y - cy) / dy;
    tx = cx + dx * tDist;
    ty = TARGET_BAND_Y;
  } else {
    tx = cx + dx * 400;
    ty = cy + dy * 400;
  }
  tx = Math.max(20, Math.min(w - 20, tx));
  ty = Math.max(20, Math.min(h - 20, ty));
  return {x: tx, y: ty};
}

/** Update the cannon aim by the cursor's horizontal delta since the
 *  previous frame, but only while `dragging` is true. The cursor's X
 *  is tracked every frame regardless so a new drag starts from where
 *  the cursor currently is. Returns the current aim angle in degrees. */
export function aim(
  scene: GdjsRuntimeScene,
  cannon: GdjsRuntimeObject,
  cursorX: number,
  dragging: boolean,
): number {
  const vars = scene.getVariables();
  if (vars.get(AIM_INIT_VAR).getAsNumber() === 0) {
    vars.get(AIM_INIT_VAR).setNumber(1);
    vars.get(AIM_DEG_VAR).setNumber(AIM_CENTER_DEG);
    vars.get(PREV_CURSOR_X_VAR).setNumber(cursorX);
  }
  const prev = vars.get(PREV_CURSOR_X_VAR).getAsNumber();
  const dx = cursorX - prev;
  vars.get(PREV_CURSOR_X_VAR).setNumber(cursorX);
  let aimDeg = vars.get(AIM_DEG_VAR).getAsNumber();
  if (dragging) {
    aimDeg += dx * AIM_DEG_PER_PX;
    aimDeg = Math.max(AIM_CENTER_DEG - AIM_SPREAD_DEG, Math.min(AIM_CENTER_DEG + AIM_SPREAD_DEG, aimDeg));
    vars.get(AIM_DEG_VAR).setNumber(aimDeg);
  }
  cannon.setAngle(aimDeg + 90);
  return aimDeg;
}

/** Glue the Crosshair sprite to the current aim's projected landing
 *  point. Spawned lazily on first call. */
export function updateCrosshair(scene: GdjsRuntimeScene, cannon: GdjsRuntimeObject, aimDeg: number): void {
  let cross = firstOrNull(scene, ObjectName.Crosshair);
  if (!cross) {
    cross = spawn(scene, ObjectName.Crosshair, 0, 0);
    if (cross) cross.setZOrder(CROSSHAIR_Z);
  }
  if (!cross) return;
  const t = aimTarget(scene, cannon, aimDeg);
  cross.setX(t.x - cross.getWidth() / 2);
  cross.setY(t.y - cross.getHeight() / 2);
}

/** Fire a cannonball. `charged` (from a double-tap) doubles damage and
 *  spawns a bigger projectile, but costs 2 ammo instead of 1. If a
 *  charged shot is requested but only 1 ammo is available, fall back
 *  to a normal shot rather than no-op'ing — the double-tap still
 *  registers as a shot.
 *  Returns true if a shot was actually fired (gated by ammo / reload). */
export function fire(
  scene: GdjsRuntimeScene,
  cannon: GdjsRuntimeObject,
  aimDeg: number,
  charged: boolean = false,
): boolean {
  let actuallyCharged = charged;
  let cost = actuallyCharged ? 2 : 1;
  if (!hud.canFire(scene, cost)) {
    if (actuallyCharged && hud.canFire(scene, 1)) {
      // Not enough ammo for a charged shot — downgrade to a normal one.
      actuallyCharged = false;
      cost = 1;
      console.log(`[cannon] charged downgraded to normal (low ammo)`);
    } else {
      return false;
    }
  }
  charged = actuallyCharged;
  const rad = (aimDeg * Math.PI) / 180;
  const dx = Math.cos(rad);
  const dy = Math.sin(rad);
  const {x: cx, y: cy} = cannonCenter(cannon);
  // Muzzle offset scaled with the cannon sprite (stored at spawn).
  const muzzleOffset = cannon.getVariables().get(CANNON_MUZZLE_OFFSET_VAR).getAsNumber() || 80;
  const muzzleX = cx + dx * muzzleOffset;
  const muzzleY = cy + dy * muzzleOffset;
  const target = aimTarget(scene, cannon, aimDeg);
  // Player cannonball gets an outward horizontal arc — biased in the
  // direction of aim with a minimum +/- 40 px so even a straight-up
  // shot visibly curves rather than tracking a vertical line.
  const horizDelta = target.x - muzzleX;
  const dir = horizDelta === 0 ? 1 : Math.sign(horizDelta);
  const xArcAmp = horizDelta * 0.5 + dir * 40;
  // Charged shot uses the red cannonball sprite so it reads
  // distinctly from the regular black shot.
  const kind = charged ? ObjectName.ChargedBullet : ObjectName.Bullet;
  proj.fire(scene, kind, muzzleX, muzzleY, target.x, target.y, {charged, xArcAmp});
  hud.consumeAmmo(scene, cost);
  console.log(`[cannon] fire${charged ? " CHARGED" : ""} aim=${aimDeg.toFixed(1)}° muzzle=(${muzzleX.toFixed(0)},${muzzleY.toFixed(0)}) → (${target.x.toFixed(0)},${target.y.toFixed(0)})`);
  return true;
}
