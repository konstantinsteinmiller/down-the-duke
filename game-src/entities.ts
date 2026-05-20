// Thin typed wrappers over runtimeScene.createObject / getObjects.
// Centralises object-name strings.

export const ObjectName = {
  Player: "Player",
  Enemy: "Enemy",
  Bullet: "Bullet",
  Cannon: "Cannon",
  EnemyBall: "EnemyBall",
  Castle: "Castle",
  Sea: "Sea",
  Target: "Target",
  DeadZone: "DeadZone",
  Island: "Island",
  Railing: "Railing",
  Crosshair: "Crosshair",
  HealthBar: "HealthBar",
  HealthBarBg: "HealthBarBg",
  CannonballUI: "CannonballUI",
  AmmoDot: "AmmoDot",
  ReloadPip: "ReloadPip",
  AmmoText: "AmmoText",
  LoseOverlay: "LoseOverlay",
  RestartButtonBg: "RestartButtonBg",
  GameOverText: "GameOverText",
  RestartButtonText: "RestartButtonText",
  PlayerHpFrame: "PlayerHpFrame",
  PlayerHpSection: "PlayerHpSection",
  ChargedBullet: "ChargedBullet",
  VictoryText: "VictoryText",
  ContinueButtonText: "ContinueButtonText",
  // Level 2 (vertical scroller)
  WallTile: "WallTile",
  PowerFrame: "PowerFrame",
  PowerFill: "PowerFill",
  L2Enemy: "L2Enemy",
  L2Label: "L2Label",
  PowerLabel: "PowerLabel",
  CatchCanText: "CatchCanText",
  Factory: "Factory",
  Reactor: "Reactor",
  EnemyCannon: "EnemyCannon",
  TutContainer: "TutContainer",
  TutLight: "TutLight",
  TutHintText: "TutHintText",
  Burst: "Burst",
  P2HintText: "P2HintText",
  ParryText: "ParryText",
  LoadedBall: "LoadedBall",
  EnemyRedBall: "EnemyRedBall",
  Flash: "Flash",
  Popup: "Popup",
} as const;
export type ObjectName = typeof ObjectName[keyof typeof ObjectName];

export function spawn(
  scene: GdjsRuntimeScene,
  name: ObjectName,
  x: number,
  y: number,
): GdjsRuntimeObject | null {
  const obj = scene.createObject(name, x, y);
  if (!obj) {
    console.warn(`[entities] createObject('${name}') returned null — is it defined in the scene?`);
  }
  return obj;
}

export function all(scene: GdjsRuntimeScene, name: ObjectName): GdjsRuntimeObject[] {
  return scene.getObjects(name);
}

export function firstOrNull(scene: GdjsRuntimeScene, name: ObjectName): GdjsRuntimeObject | null {
  const arr = scene.getObjects(name);
  return arr.length > 0 ? arr[0]! : null;
}
