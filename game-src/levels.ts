// Which level is currently active. Stored as a GLOBAL (game) variable so
// it survives the scene restarts we use to (re)start a level via
// requestChange(REPLACE_SCENE, "Main"). Scene variables would reset on
// restart; game variables don't.
//
// Default is 2 for now (development focus on the vertical-scroller).
// The Level 1 win screen's CONTINUE button sets it to 2 before
// restarting; a future Level 2 win would set 3, etc.

const LEVEL_VAR = "currentLevel";
const DEFAULT_LEVEL = 2;

export function current(scene: GdjsRuntimeScene): number {
  const v = scene.getGame().getVariables().get(LEVEL_VAR);
  const n = v.getAsNumber();
  if (n === 0) {
    v.setNumber(DEFAULT_LEVEL);
    return DEFAULT_LEVEL;
  }
  return n;
}

export function setLevel(scene: GdjsRuntimeScene, n: number): void {
  scene.getGame().getVariables().get(LEVEL_VAR).setNumber(n);
}
