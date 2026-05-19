// Level 1 background: sky strip at the top, the user's Island parallax
// silhouette near the horizon, sea band filling most of the screen
// below the sky.
//
// Dead-zone geometry is still defined here (the enemy ship logic uses
// `deadZoneInset()` to pick its stop position), but the visual dashed
// markers are no longer spawned — only the gameplay invariant remains.
//
// Z-order convention:
//   Sea:      -20   (furthest back)
//   Island:   -15   (distant parallax silhouette)
//   Castle:   -12   (kept around but optional; rendered behind island)
//   Gameplay:  0+   (ships, target, bullets — cannon is at z=5, railing 10)

import {firstOrNull, spawn, ObjectName} from "./entities.js";

const SEA_Z = -20;
const ISLAND_Z = -15;

const SKY_HEIGHT_PX = 130;
const ISLAND_Y = 110; // anchored at the horizon — island sits on the sea line
const DEADZONE_INSET_PX = 56;

const INIT_VAR = "__bgInit";

export function deadZoneInset(): number {
  return DEADZONE_INSET_PX;
}

export function ensureBackground(scene: GdjsRuntimeScene): void {
  const vars = scene.getVariables();
  if (vars.get(INIT_VAR).getAsNumber() !== 0) return;
  vars.get(INIT_VAR).setNumber(1);

  const game = scene.getGame();
  const w = game.getGameResolutionWidth();
  const h = game.getGameResolutionHeight();

  // Sea: stretched to fill the viewport from the sky strip down past
  // the bottom. With `adaptWidth` the runtime canvas can be taller
  // than the game's logical 800 px, so sizing the sea to exactly
  // (h - SKY_HEIGHT_PX) leaves the scene's pale background colour
  // visible below the cannon. Padding the height with +1200 px makes
  // the sea reach well past the bottom edge regardless of aspect.
  const sea = spawn(scene, ObjectName.Sea, 0, SKY_HEIGHT_PX);
  if (sea) {
    sea.setWidth(w);
    sea.setHeight(Math.max(h - SKY_HEIGHT_PX, 0) + 1200);
    sea.setZOrder(SEA_Z);
  }

  // Island silhouette — distant landmass on the horizon. Centred
  // horizontally. Size is read from the loaded image so swapping the
  // art works without code changes.
  const island = spawn(scene, ObjectName.Island, 0, 0);
  if (island) {
    const iw = island.getWidth();
    island.setX(w / 2 - iw / 2);
    island.setY(ISLAND_Y);
    island.setZOrder(ISLAND_Z);
  }

  // Dead-zone markers intentionally NOT spawned anymore — the dashed
  // line was cluttering the screen edge. The gameplay invariant
  // (enemies can't fire from inside the dead-zone strip) is still
  // enforced via `deadZoneInset()` in enemy.ts.

  console.log(`[background] viewport ${w}×${h}, sky 0..${SKY_HEIGHT_PX}, sea ${SKY_HEIGHT_PX}..${h}`);
}
