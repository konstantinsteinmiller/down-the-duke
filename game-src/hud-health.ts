// Player health bar: 5 chunky red sections in a dark frame anchored
// at the bottom-centre of the screen. Each section corresponds to one
// HP point (5 max). On HP change the affected section plays a brief
// animation:
//   - lost: flash to white, then shrink + fade out (~0.35 s)
//   - gained: pop in, fade from white to red (~0.30 s)
// Otherwise the section is fully visible if `slot < currentHp`, hidden
// otherwise.

import {all, spawn, ObjectName} from "./entities.js";
import {getHp} from "./state.js";

const SECTION_COUNT = 5;
const SECTION_W = 48;
const SECTION_H = 28;
const SECTION_GAP = 6;
const FRAME_PADDING = 8;
const FRAME_BOTTOM_MARGIN = 18;

const LOST_ANIM_SEC = 0.35;
const GAINED_ANIM_SEC = 0.30;

const Z_FRAME = 40;
const Z_SECTION = 41;

const V_INIT = "__healthHudInit";
const V_PREV_HP = "__healthHudPrevHp";

const ANIM_NONE = 0;
const ANIM_LOST = 1;
const ANIM_GAINED = 2;

function ensureSpawn(scene: GdjsRuntimeScene): void {
  const vars = scene.getVariables();
  if (vars.get(V_INIT).getAsNumber() !== 0) return;
  vars.get(V_INIT).setNumber(1);
  vars.get(V_PREV_HP).setNumber(getHp(scene));

  const game = scene.getGame();
  const w = game.getGameResolutionWidth();
  const h = game.getGameResolutionHeight();
  const totalW = SECTION_COUNT * SECTION_W + (SECTION_COUNT - 1) * SECTION_GAP;
  const startX = w / 2 - totalW / 2;
  const y = h - SECTION_H - FRAME_BOTTOM_MARGIN;

  // Frame backdrop (resized to wrap the section row with FRAME_PADDING margin).
  const frame = spawn(scene, ObjectName.PlayerHpFrame, 0, 0);
  if (frame) {
    frame.setWidth(totalW + 2 * FRAME_PADDING);
    frame.setHeight(SECTION_H + 2 * FRAME_PADDING);
    frame.setX(startX - FRAME_PADDING);
    frame.setY(y - FRAME_PADDING);
    frame.setZOrder(Z_FRAME);
  }
  for (let i = 0; i < SECTION_COUNT; i++) {
    const sec = spawn(scene, ObjectName.PlayerHpSection, 0, 0);
    if (!sec) continue;
    sec.setX(startX + i * (SECTION_W + SECTION_GAP));
    sec.setY(y);
    sec.setZOrder(Z_SECTION);
    const vv = sec.getVariables();
    vv.get("slot").setNumber(i);
    vv.get("animTimer").setNumber(0);
    vv.get("animType").setNumber(ANIM_NONE);
  }
  console.log(`[hud-health] spawned ${SECTION_COUNT} sections at y=${y}`);
}

function startAnim(sec: GdjsRuntimeObject, type: number, durationSec: number): void {
  const v = sec.getVariables();
  v.get("animTimer").setNumber(durationSec);
  v.get("animDur").setNumber(durationSec);
  v.get("animType").setNumber(type);
  sec.hide(false);
}

function applyDefault(sec: GdjsRuntimeObject): void {
  sec.setColor("255;255;255");
  sec.setOpacity(255);
  sec.setScaleX(1);
  sec.setScaleY(1);
}

export function tick(scene: GdjsRuntimeScene, dt: number): void {
  ensureSpawn(scene);
  const vars = scene.getVariables();
  const hp = getHp(scene);
  const prev = vars.get(V_PREV_HP).getAsNumber();

  // HP changed — flag the relevant sections for animation.
  if (hp !== prev) {
    for (const sec of all(scene, ObjectName.PlayerHpSection)) {
      const slot = sec.getVariables().get("slot").getAsNumber();
      if (hp < prev && slot >= hp && slot < prev) {
        startAnim(sec, ANIM_LOST, LOST_ANIM_SEC);
      } else if (hp > prev && slot >= prev && slot < hp) {
        startAnim(sec, ANIM_GAINED, GAINED_ANIM_SEC);
      }
    }
    vars.get(V_PREV_HP).setNumber(hp);
  }

  // Per-frame visual update.
  for (const sec of all(scene, ObjectName.PlayerHpSection)) {
    const v = sec.getVariables();
    const slot = v.get("slot").getAsNumber();
    const animTimer = v.get("animTimer").getAsNumber();
    const animType = v.get("animType").getAsNumber();
    if (animTimer > 0) {
      const dur = v.get("animDur").getAsNumber() || 1;
      const next = Math.max(0, animTimer - dt);
      v.get("animTimer").setNumber(next);
      const tNorm = 1 - next / dur; // 0 → 1 over the animation
      if (animType === ANIM_LOST) {
        // Bright flash → fade & shrink.
        const flashT = Math.min(1, tNorm * 3); // first third is the flash
        const r = Math.round(255 - 35 * flashT);
        const g = Math.round(80 + 60 * flashT);
        const b = Math.round(80 + 60 * flashT);
        sec.setColor(`${r};${g};${b}`);
        const fade = 1 - tNorm;
        sec.setOpacity(255 * fade);
        sec.setScaleX(Math.max(0.1, 1 - tNorm * 0.5));
        sec.setScaleY(Math.max(0.1, 1 - tNorm * 0.5));
      } else if (animType === ANIM_GAINED) {
        // Pop in: scale 0.3 → 1, opacity 0 → 255, tint white → red.
        const fade = tNorm;
        sec.setOpacity(255 * fade);
        const scl = 0.3 + 0.7 * tNorm;
        sec.setScaleX(scl);
        sec.setScaleY(scl);
        const r = 255;
        const g = Math.round(255 - 200 * tNorm);
        const b = Math.round(255 - 200 * tNorm);
        sec.setColor(`${r};${g};${b}`);
      }
      if (next <= 0) {
        // Animation finished — settle into a steady state.
        v.get("animType").setNumber(ANIM_NONE);
        applyDefault(sec);
        sec.hide(slot >= hp);
      }
    } else {
      applyDefault(sec);
      sec.hide(slot >= hp);
    }
  }
}
