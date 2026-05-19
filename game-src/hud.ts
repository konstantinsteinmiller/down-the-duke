// Heads-up display:
//   - CannonballUI sprite anchored at the top-right.
//   - AmmoText TextObject showing the remaining shot count inside the
//     yellow LCD area.
//   - 12 ReloadPip sprites arranged in a circle around the cannon
//     that fill progressively while the reload timer counts down.
//
// Magazine = 4 shots. Reload = 4 s. Charged shot costs 2 ammo. While
// reloading, `canFire` returns false and the cannon ignores tap /
// double-tap. The ammo text shows the remaining number; during a
// reload it shows ":" then briefly "4" when ready, to read as a
// status display.
//
// Persistent state on scene variables — the bundled IIFE re-runs every
// frame, so no module-level mutable state can be trusted.

import {all, firstOrNull, spawn, ObjectName} from "./entities.js";

const MAX_AMMO = 4;
const RELOAD_SEC = 4.0;
const NORMAL_SHOT_COST = 1;
const CHARGED_SHOT_COST = 2;
// Minimum delay between consecutive player shots, so the player can't
// fire two cannonballs in the same tap-frame burst.
const SHOT_COOLDOWN_SEC = 0.75;

const UI_RIGHT_MARGIN = 12;
const UI_TOP_MARGIN = 12;

// Ammo-text placement inside the cannonball-ui sprite's recessed
// counter box (the "12" placeholder area in the new art at roughly
// sprite-local (78, 22)).
const TEXT_OFFSET_X = 86;
const TEXT_OFFSET_Y = 20;

// Reload pip ring around the cannon.
const RELOAD_PIP_COUNT = 12;
const RELOAD_PIP_RADIUS = 110;

const HUD_INIT_VAR = "__hudInit";
const HUD_AMMO_VAR = "__hudAmmo";
const HUD_RELOAD_VAR = "__hudReload"; // seconds left in current reload; 0 = idle
const HUD_COOLDOWN_VAR = "__hudShotCooldown"; // seconds left until next shot allowed
const PIPS_SPAWNED_VAR = "__hudPipsSpawned";

const UI_Z = 30;
const TEXT_Z = 32;
const PIP_Z = 40;

export function ensureHud(scene: GdjsRuntimeScene): void {
  const vars = scene.getVariables();
  if (vars.get(HUD_INIT_VAR).getAsNumber() !== 0) return;
  vars.get(HUD_INIT_VAR).setNumber(1);
  vars.get(HUD_AMMO_VAR).setNumber(MAX_AMMO);
  vars.get(HUD_RELOAD_VAR).setNumber(0);

  const game = scene.getGame();
  const w = game.getGameResolutionWidth();

  const ui = spawn(scene, ObjectName.CannonballUI, 0, 0);
  if (!ui) return;
  const uw = ui.getWidth();
  const ux = w - uw - UI_RIGHT_MARGIN;
  const uy = UI_TOP_MARGIN;
  ui.setX(ux);
  ui.setY(uy);
  ui.setZOrder(UI_Z);

  const text = spawn(scene, ObjectName.AmmoText, 0, 0);
  if (text) {
    text.setX(ux + TEXT_OFFSET_X);
    text.setY(uy + TEXT_OFFSET_Y);
    text.setZOrder(TEXT_Z);
    text.setString(String(MAX_AMMO));
  }

  console.log(`[hud] ammo UI at (${ux}, ${uy})`);
}

export function canFire(scene: GdjsRuntimeScene, cost: number): boolean {
  const vars = scene.getVariables();
  if (vars.get(HUD_RELOAD_VAR).getAsNumber() > 0) return false;
  if (vars.get(HUD_COOLDOWN_VAR).getAsNumber() > 0) return false;
  return vars.get(HUD_AMMO_VAR).getAsNumber() >= cost;
}

export function canFireNormal(scene: GdjsRuntimeScene): boolean {
  return canFire(scene, NORMAL_SHOT_COST);
}

export function canFireCharged(scene: GdjsRuntimeScene): boolean {
  return canFire(scene, CHARGED_SHOT_COST);
}

/** Spend ammo. If the magazine hits 0, kick off a reload. Returns the
 *  ammo remaining after the spend (0 means a reload just started). */
export function consumeAmmo(scene: GdjsRuntimeScene, cost: number): number {
  const vars = scene.getVariables();
  const before = vars.get(HUD_AMMO_VAR).getAsNumber();
  const after = Math.max(0, before - cost);
  vars.get(HUD_AMMO_VAR).setNumber(after);
  if (after <= 0) {
    vars.get(HUD_RELOAD_VAR).setNumber(RELOAD_SEC);
    console.log(`[hud] empty — reloading for ${RELOAD_SEC}s`);
  }
  // Lock the cannon for SHOT_COOLDOWN_SEC after every shot.
  vars.get(HUD_COOLDOWN_VAR).setNumber(SHOT_COOLDOWN_SEC);
  return after;
}

function spawnReloadPipsIfNeeded(scene: GdjsRuntimeScene, cannon: GdjsRuntimeObject | null): void {
  if (!cannon) return;
  const vars = scene.getVariables();
  if (vars.get(PIPS_SPAWNED_VAR).getAsNumber() === 1) return;
  vars.get(PIPS_SPAWNED_VAR).setNumber(1);
  const cx = cannon.getX() + cannon.getCenterX();
  const cy = cannon.getY() + cannon.getCenterY();
  for (let i = 0; i < RELOAD_PIP_COUNT; i++) {
    const angle = (i / RELOAD_PIP_COUNT) * 2 * Math.PI - Math.PI / 2;
    const x = cx + RELOAD_PIP_RADIUS * Math.cos(angle);
    const y = cy + RELOAD_PIP_RADIUS * Math.sin(angle);
    const pip = spawn(scene, ObjectName.ReloadPip, 0, 0);
    if (!pip) continue;
    pip.setX(x - pip.getWidth() / 2);
    pip.setY(y - pip.getHeight() / 2);
    pip.setZOrder(PIP_Z);
    pip.hide(true);
    pip.getVariables().get("idx").setNumber(i);
  }
}

/** Tick the reload timer, update the ammo text, and progress the
 *  circular pip indicator around the cannon. */
export function tick(scene: GdjsRuntimeScene, dt: number, cannon: GdjsRuntimeObject | null): void {
  const vars = scene.getVariables();
  const reloadLeft = vars.get(HUD_RELOAD_VAR).getAsNumber();

  // Decrement reload timer.
  if (reloadLeft > 0) {
    const next = reloadLeft - dt;
    if (next <= 0) {
      vars.get(HUD_RELOAD_VAR).setNumber(0);
      vars.get(HUD_AMMO_VAR).setNumber(MAX_AMMO);
      console.log(`[hud] reload complete`);
    } else {
      vars.get(HUD_RELOAD_VAR).setNumber(next);
    }
  }

  // Decrement per-shot cooldown.
  const cd = vars.get(HUD_COOLDOWN_VAR).getAsNumber();
  if (cd > 0) vars.get(HUD_COOLDOWN_VAR).setNumber(Math.max(0, cd - dt));

  const ammo = vars.get(HUD_AMMO_VAR).getAsNumber();
  const reloading = vars.get(HUD_RELOAD_VAR).getAsNumber() > 0;

  // Update the ammo text. While reloading, show a ":" placeholder.
  const text = firstOrNull(scene, ObjectName.AmmoText);
  if (text) text.setString(reloading ? ":" : String(ammo));

  // Reload pips: spawn (lazily, once cannon exists), show progressively.
  spawnReloadPipsIfNeeded(scene, cannon);
  if (reloading) {
    const duration = RELOAD_SEC;
    const left = vars.get(HUD_RELOAD_VAR).getAsNumber();
    const progress = Math.max(0, Math.min(1, 1 - left / duration));
    const visibleCount = Math.ceil(progress * RELOAD_PIP_COUNT);
    for (const pip of all(scene, ObjectName.ReloadPip)) {
      const idx = pip.getVariables().get("idx").getAsNumber();
      pip.hide(idx >= visibleCount);
    }
  } else {
    for (const pip of all(scene, ObjectName.ReloadPip)) pip.hide(true);
  }
}
