// Input abstraction over GDevelop's InputManager.
// The bundled IIFE re-runs every frame, so edge-triggered state ("just
// pressed this frame") is reconstructed by stashing previous-frame bits
// on a scene variable.

const KEY = {
  LEFT: 37,
  UP: 38,
  RIGHT: 39,
  DOWN: 40,
  W: 87, A: 65, S: 83, D: 68,
  SPACE: 32,
} as const;

const PREV_BITS_VAR = "__inputPrevBits";

const enum Btn {
  Fire = 1 << 0,
  Mouse = 1 << 1,
}

export interface InputState {
  /** -1, 0, or 1. Diagonals NOT normalised here — caller decides. */
  axes: { x: number; y: number };
  fire: boolean;
  /** Edge-triggered: true only on the frame fire transitions up → down.
   *  Triggers on Space OR left-mouse-button. */
  firePressed: boolean;
  /** Cursor / primary-touch position in scene coordinates. */
  cursor: { x: number; y: number };
}

export function readInput(scene: GdjsRuntimeScene): InputState {
  const im = scene.getGame().getInputManager();

  let x = 0;
  let y = 0;
  if (im.isKeyPressed(KEY.LEFT) || im.isKeyPressed(KEY.A)) x -= 1;
  if (im.isKeyPressed(KEY.RIGHT) || im.isKeyPressed(KEY.D)) x += 1;
  if (im.isKeyPressed(KEY.UP) || im.isKeyPressed(KEY.W)) y -= 1;
  if (im.isKeyPressed(KEY.DOWN) || im.isKeyPressed(KEY.S)) y += 1;

  const space = im.isKeyPressed(KEY.SPACE);
  const mouse = im.isMouseButtonPressed(0);
  const fire = space || mouse;

  const prevVar = scene.getVariables().get(PREV_BITS_VAR);
  const prev = prevVar.getAsNumber();
  const wasFire = (prev & (Btn.Fire | Btn.Mouse)) !== 0;
  const firePressed = fire && !wasFire;

  let next = 0;
  if (space) next |= Btn.Fire;
  if (mouse) next |= Btn.Mouse;
  prevVar.setNumber(next);

  return {
    axes: {x, y},
    fire,
    firePressed,
    cursor: {x: im.getCursorX(), y: im.getCursorY()},
  };
}
