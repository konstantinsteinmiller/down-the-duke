// Win screen: spawned the first frame `state.getState() === "won"`.
// Gold "VICTORY!" text + a CONTINUE button. CONTINUE advances the
// global level (Level 1 → Level 2) and restarts the Main scene, which
// then runs the next level. Levels share the one Main scene; the active
// level is chosen by the `currentLevel` global variable (see levels.ts).

import {firstOrNull, spawn, ObjectName} from "./entities.js";
import * as levels from "./levels.js";

const SPAWNED_VAR = "__winSpawned";

const Z_OVERLAY = 100;
const Z_BUTTON_BG = 101;
const Z_TEXT = 102;

const OVERLAY_OPACITY = 180;
const TITLE_Y_FRACTION = 0.30;
const BUTTON_Y_FRACTION = 0.55;

const BUTTON_W = 240;
const BUTTON_H = 64;

const REPLACE_SCENE = 3;     // gdjs.RuntimeScene.REPLACE_SCENE
const SCENE_NAME = "Main";   // both levels live in the Main scene
const MAX_LEVEL = 2;         // no Level 3 yet — CONTINUE on L2 just replays L2

function ensureSpawned(scene: GdjsRuntimeScene): void {
  const vars = scene.getVariables();
  if (vars.get(SPAWNED_VAR).getAsNumber() !== 0) return;
  vars.get(SPAWNED_VAR).setNumber(1);

  const game = scene.getGame();
  const w = game.getGameResolutionWidth();
  const h = game.getGameResolutionHeight();

  // Same dark overlay sprite as the lose screen — we re-use the
  // LoseOverlay object since it's just a tintable dark rectangle.
  const overlay = spawn(scene, ObjectName.LoseOverlay, 0, 0);
  if (overlay) {
    overlay.setWidth(w);
    overlay.setHeight(Math.max(h, 2000));
    overlay.setOpacity(OVERLAY_OPACITY);
    overlay.setZOrder(Z_OVERLAY);
  }

  const title = spawn(scene, ObjectName.VictoryText, 0, 0);
  if (title) {
    const tw = title.getWidth() || 260;
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
    buttonBg.getVariables().get("isContinueButton").setNumber(1);
  }
  const buttonText = spawn(scene, ObjectName.ContinueButtonText, 0, 0);
  if (buttonText) {
    const tw = buttonText.getWidth() || 160;
    const th = buttonText.getHeight() || 36;
    buttonText.setX(w / 2 - tw / 2);
    buttonText.setY(h * BUTTON_Y_FRACTION + BUTTON_H / 2 - th / 2);
    buttonText.setZOrder(Z_TEXT);
  }

  console.log(`[win] spawned`);
}

function continueButton(scene: GdjsRuntimeScene): GdjsRuntimeObject | null {
  // Find the RestartButtonBg instance flagged with `isContinueButton`
  // (the lose-screen one isn't flagged, so the two screens don't
  // collide if both ever appeared in the same scene).
  for (const bg of scene.getObjects(ObjectName.RestartButtonBg)) {
    if (bg.getVariables().get("isContinueButton").getAsNumber() === 1) return bg;
  }
  return firstOrNull(scene, ObjectName.RestartButtonBg);
}

export function tick(scene: GdjsRuntimeScene, cursorX: number, cursorY: number, firePressed: boolean): void {
  ensureSpawned(scene);
  if (!firePressed) return;
  const bg = continueButton(scene);
  if (!bg) return;
  const x = bg.getX(), y = bg.getY(), w = bg.getWidth(), h = bg.getHeight();
  if (cursorX >= x && cursorX < x + w && cursorY >= y && cursorY < y + h) {
    const nextLevel = Math.min(levels.current(scene) + 1, MAX_LEVEL);
    levels.setLevel(scene, nextLevel);
    console.log(`[win] continue → level ${nextLevel}`);
    scene.requestChange(REPLACE_SCENE, SCENE_NAME);
  }
}
