// Tap / double-tap / drag gesture detection.
//
// The bundled IIFE re-runs every frame, so all timing state is stored on
// scene variables. `detectGesture` is called once per frame with the
// current cursor / touch state and returns a snapshot of which discrete
// events fired this frame plus whether we're currently in a drag.
//
// State machine:
//   IDLE         — no contact.
//   PENDING      — finger/mouse just went down. Could become a tap or a drag.
//   DRAGGING     — held past TAP_DURATION_MAX_SEC or moved past
//                   TAP_MOVEMENT_MAX_PX. Stays in this state until release.
//
// On release, if the press was short and didn't move much we treat it as
// a tap. To distinguish a single tap from the first half of a double-tap
// we hold the tap "pending" for DOUBLE_TAP_WINDOW_SEC and emit the single
// `tap` event only once the window expires without a second press. A
// second quick release within that window emits `doubleTap` immediately
// and cancels the pending single tap, so a double-tap never fires the
// single-tap handler too. This adds ~300 ms of latency to a plain tap,
// which is the standard price for unambiguous double-tap detection.

const TAP_DURATION_MAX_SEC = 0.10;
const TAP_MOVEMENT_MAX_PX = 12;
const DOUBLE_TAP_WINDOW_SEC = 0.30;

// Scene-variable keys. Underscore-prefixed so they don't collide with
// game-state vars the user might inspect in the GDevelop debugger.
const V_PREV_PRESSED = "__gPrevPressed";
const V_PRESS_TIME = "__gPressTime";
const V_PRESS_X = "__gPressX";
const V_PRESS_Y = "__gPressY";
const V_DRAGGING = "__gDragging";
const V_PENDING_TAP_T = "__gPendingTapTime";
const V_SCENE_TIME = "__gSceneTime";

export interface Gesture {
  /** A confirmed single tap fired this frame (no second tap in window). */
  tap: boolean;
  /** A double-tap fired this frame (second quick release within window). */
  doubleTap: boolean;
  /** Currently in drag state — held past the tap threshold. */
  dragging: boolean;
  /** Did the drag state JUST start this frame? */
  dragStarted: boolean;
}

export function detectGesture(
  scene: GdjsRuntimeScene,
  dt: number,
  cursorX: number,
  cursorY: number,
  pressed: boolean,
): Gesture {
  const vars = scene.getVariables();
  const now = vars.get(V_SCENE_TIME).getAsNumber() + dt;
  vars.get(V_SCENE_TIME).setNumber(now);

  const wasPressed = vars.get(V_PREV_PRESSED).getAsNumber() === 1;
  vars.get(V_PREV_PRESSED).setNumber(pressed ? 1 : 0);

  let tap = false;
  let doubleTap = false;
  let dragging = vars.get(V_DRAGGING).getAsNumber() === 1;
  let dragStarted = false;

  // Press just started → record anchor; don't decide tap-vs-drag yet.
  if (pressed && !wasPressed) {
    vars.get(V_PRESS_TIME).setNumber(now);
    vars.get(V_PRESS_X).setNumber(cursorX);
    vars.get(V_PRESS_Y).setNumber(cursorY);
    vars.get(V_DRAGGING).setNumber(0);
    dragging = false;
  }

  // Holding — escalate to drag if held long enough or moved enough.
  if (pressed && wasPressed && !dragging) {
    const held = now - vars.get(V_PRESS_TIME).getAsNumber();
    const dx = cursorX - vars.get(V_PRESS_X).getAsNumber();
    const dy = cursorY - vars.get(V_PRESS_Y).getAsNumber();
    const moved = Math.hypot(dx, dy);
    if (held >= TAP_DURATION_MAX_SEC || moved >= TAP_MOVEMENT_MAX_PX) {
      dragging = true;
      dragStarted = true;
      vars.get(V_DRAGGING).setNumber(1);
    }
  }

  // Release — if we never entered drag, this was a tap (or the second tap).
  if (!pressed && wasPressed) {
    if (!dragging) {
      const pending = vars.get(V_PENDING_TAP_T).getAsNumber();
      if (pending > 0 && (now - pending) <= DOUBLE_TAP_WINDOW_SEC) {
        doubleTap = true;
        vars.get(V_PENDING_TAP_T).setNumber(0);
      } else {
        // Hold the tap as "pending" until the double-tap window passes.
        vars.get(V_PENDING_TAP_T).setNumber(now);
      }
    }
    vars.get(V_DRAGGING).setNumber(0);
    dragging = false;
  }

  // Pending single-tap aged out without a second press → emit it now.
  const pending = vars.get(V_PENDING_TAP_T).getAsNumber();
  if (pending > 0 && (now - pending) > DOUBLE_TAP_WINDOW_SEC) {
    tap = true;
    vars.get(V_PENDING_TAP_T).setNumber(0);
  }

  return {tap, doubleTap, dragging, dragStarted};
}

// Convenience predicates for callers that only care about one event.
export function isTap(g: Gesture): boolean {
  return g.tap;
}

export function isDoubleTap(g: Gesture): boolean {
  return g.doubleTap;
}

export function isDragging(g: Gesture): boolean {
  return g.dragging;
}
