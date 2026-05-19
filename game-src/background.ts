// Level 1 background: sky strip at the top, the user's Island parallax
// silhouette near the horizon, sea band filling most of the screen
// below the sky, and the two dead-zone playfield boundary lines.
//
// Z-order convention:
//   Sea:      -20   (furthest back)
//   Island:   -15   (distant parallax silhouette)
//   Castle:   -12   (kept around but optional; rendered behind island)
//   DeadZone:  -5   (faint dashed line, behind ships/bullets)
//   Gameplay:  0+   (ships, target, bullets — cannon is at z=5, railing 10)

import {firstOrNull, spawn, ObjectName} from "./entities.js";

const SEA_Z = -20;
const ISLAND_Z = -15;
const DEADZONE_Z = -5;

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

  const w = scene.getGame().getGameResolutionWidth();

  const sea = spawn(scene, ObjectName.Sea, 0, SKY_HEIGHT_PX);
  if (sea) sea.setZOrder(SEA_Z);

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

  const dzLeft = spawn(scene, ObjectName.DeadZone, DEADZONE_INSET_PX, 0);
  if (dzLeft) dzLeft.setZOrder(DEADZONE_Z);
  const dzRight = spawn(scene, ObjectName.DeadZone, w - DEADZONE_INSET_PX, 0);
  if (dzRight) dzRight.setZOrder(DEADZONE_Z);

  console.log(`[background] sky/sea/island/deadzones spawned`);
}
