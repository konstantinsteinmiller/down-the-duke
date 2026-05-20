// Player-side state: HP, win/lose flag. All persisted on scene variables
// because the IIFE re-runs every frame and module scope is reset.

export const INITIAL_PLAYER_HP = 5;

const HP_VAR = "playerHp";
const STATE_VAR = "gameState"; // 0 = playing, 1 = won, 2 = lost
const HP_INIT_FLAG = "__hpInit";

export type GameState = "playing" | "won" | "lost";

export function ensureInit(scene: GdjsRuntimeScene): void {
  const vars = scene.getVariables();
  if (vars.get(HP_INIT_FLAG).getAsNumber() === 0) {
    vars.get(HP_INIT_FLAG).setNumber(1);
    vars.get(HP_VAR).setNumber(INITIAL_PLAYER_HP);
    vars.get(STATE_VAR).setNumber(0);
    console.log(`[state] init hp=${INITIAL_PLAYER_HP}`);
  }
}

export function getHp(scene: GdjsRuntimeScene): number {
  return scene.getVariables().get(HP_VAR).getAsNumber();
}

export function getState(scene: GdjsRuntimeScene): GameState {
  const s = scene.getVariables().get(STATE_VAR).getAsNumber();
  return s === 1 ? "won" : s === 2 ? "lost" : "playing";
}

export function damagePlayer(scene: GdjsRuntimeScene, amount: number): void {
  if (getState(scene) !== "playing") return;
  const hpVar = scene.getVariables().get(HP_VAR);
  const next = Math.max(0, hpVar.getAsNumber() - amount);
  hpVar.setNumber(next);
  console.log(`[state] player hp=${next}`);
  if (next <= 0) {
    scene.getVariables().get(STATE_VAR).setNumber(2);
    console.log(`[state] LOST`);
  }
}

/** Restore the player to full HP (e.g. the wall-container clear reward). */
export function healFull(scene: GdjsRuntimeScene): void {
  if (getState(scene) !== "playing") return;
  scene.getVariables().get(HP_VAR).setNumber(INITIAL_PLAYER_HP);
  console.log(`[state] player healed to full (${INITIAL_PLAYER_HP})`);
}

export function markWon(scene: GdjsRuntimeScene): void {
  if (getState(scene) !== "playing") return;
  scene.getVariables().get(STATE_VAR).setNumber(1);
  console.log(`[state] WON`);
}
