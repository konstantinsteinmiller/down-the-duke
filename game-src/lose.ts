// Lose screen: spawned the first frame `state.getState() === "lost"`.
// Renders a dark overlay across the whole canvas, a big red
// "YOU SUNK!" headline, and a RESTART button in the middle. A click
// inside the button's bounds restarts the scene via
// `runtimeScene.requestChange(REPLACE_SCENE, "Main")` — the cheapest
// way to wipe all the in-flight scene variables / projectiles / ships
// without manually un-spawning each one.

import {firstOrNull, spawn, ObjectName} from "./entities.js";
import * as levels from "./levels.js";

const SPAWNED_VAR = "__loseSpawned";

const Z_OVERLAY = 100;
const Z_BUTTON_BG = 101;
const Z_TEXT = 102;

const OVERLAY_OPACITY = 180;
const TITLE_Y_FRACTION = 0.30;
const BUTTON_Y_FRACTION = 0.55;

const BUTTON_W = 240;
const BUTTON_H = 64;

// GDJS scene-change codes in the bundled runtime:
//   0 CONTINUE, 1 PUSH_SCENE, 2 POP_SCENE, 3 REPLACE_SCENE,
//   4 CLEAR_SCENES, 5 STOP_GAME.
const REPLACE_SCENE = 3;
const SCENE_NAME = "Main";

function ensureSpawned(scene: GdjsRuntimeScene): void {
  const vars = scene.getVariables();
  if (vars.get(SPAWNED_VAR).getAsNumber() !== 0) return;
  vars.get(SPAWNED_VAR).setNumber(1);

  const game = scene.getGame();
  const w = game.getGameResolutionWidth();
  const h = game.getGameResolutionHeight();

  const overlay = spawn(scene, ObjectName.LoseOverlay, 0, 0);
  if (overlay) {
    overlay.setWidth(w);
    overlay.setHeight(Math.max(h, 2000));
    overlay.setOpacity(OVERLAY_OPACITY);
    overlay.setZOrder(Z_OVERLAY);
  }

  const title = spawn(scene, ObjectName.GameOverText, 0, 0);
  if (title) {
    // "YOU SUNK!" reads as a naval loss on Level 1; from Level 2 (the
    // fortress climb) it's "WASTED".
    title.setString(levels.current(scene) >= 2 ? "WASTED" : "YOU SUNK!");
    // Roughly centred — TextObject anchors at its top-left, so we
    // estimate the width from the string length × characterSize.
    const tw = title.getWidth() || 280;
    title.setX(w / 2 - tw / 2);
    title.setY(h * TITLE_Y_FRACTION);
    title.setZOrder(Z_TEXT);
  }

  const buttonBg = spawn(scene, ObjectName.RestartButtonBg, 0, 0);
  if (buttonBg) {
    buttonBg.setWidth(BUTTON_W);
    buttonBg.setHeight(BUTTON_H);
    buttonBg.setX(w / 2 - BUTTON_W / 2);
    buttonBg.setY(h * BUTTON_Y_FRACTION);
    buttonBg.setZOrder(Z_BUTTON_BG);
  }
  const buttonText = spawn(scene, ObjectName.RestartButtonText, 0, 0);
  if (buttonText) {
    const tw = buttonText.getWidth() || 140;
    const th = buttonText.getHeight() || 36;
    buttonText.setX(w / 2 - tw / 2);
    buttonText.setY(h * BUTTON_Y_FRACTION + BUTTON_H / 2 - th / 2);
    buttonText.setZOrder(Z_TEXT);
  }

  console.log(`[lose] spawned`);
}

function buttonBounds(scene: GdjsRuntimeScene): { x: number; y: number; w: number; h: number } | null {
  const bg = firstOrNull(scene, ObjectName.RestartButtonBg);
  if (!bg) return null;
  return {x: bg.getX(), y: bg.getY(), w: bg.getWidth(), h: bg.getHeight()};
}

/** Drive the lose screen. Spawns the UI on first entry. If the player
 *  clicked inside the RESTART button this frame, request a scene
 *  restart. */
export function tick(scene: GdjsRuntimeScene, cursorX: number, cursorY: number, firePressed: boolean): void {
  ensureSpawned(scene);
  if (!firePressed) return;
  const b = buttonBounds(scene);
  if (!b) return;
  if (cursorX >= b.x && cursorX < b.x + b.w && cursorY >= b.y && cursorY < b.y + b.h) {
    console.log(`[lose] restart requested`);
    scene.requestChange(REPLACE_SCENE, SCENE_NAME);
  }
}
