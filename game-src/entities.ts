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
