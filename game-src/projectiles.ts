// Generic projectile pool — handles any sprite whose instances live as scene
// objects and store their velocity on object variables `vx` / `vy`.
// Used for both player Bullets and EnemyBalls.

import {all, spawn, ObjectName} from "./entities.js";

const OFFSCREEN_PAD = 48;

// Display size for cannonballs in scene pixels. Source art is ~103×104
// (chunky) — scale to roughly half a tile.
const BALL_DISPLAY_SIZE_PX = 28;

export function fire(
  scene: GdjsRuntimeScene,
  kind: ObjectName,
  x: number,
  y: number,
  dx: number,
  dy: number,
  speed: number,
): GdjsRuntimeObject | null {
  const len = Math.hypot(dx, dy) || 1;
  const vx = (dx / len) * speed;
  const vy = (dy / len) * speed;
  const p = spawn(scene, kind, x, y);
  if (!p) return null;
  // Cannonballs come from an art sprite that's ~100px on each side;
  // scale them down to something proportionate to the playfield.
  if (kind === ObjectName.Bullet || kind === ObjectName.EnemyBall) {
    const native = p.getWidth();
    if (native > 0) p.setScale(BALL_DISPLAY_SIZE_PX / native);
  }
  const v = p.getVariables();
  v.get("vx").setNumber(vx);
  v.get("vy").setNumber(vy);
  return p;
}

export function update(scene: GdjsRuntimeScene, kind: ObjectName, dt: number): void {
  const game = scene.getGame();
  const w = game.getGameResolutionWidth();
  const h = game.getGameResolutionHeight();
  for (const p of all(scene, kind)) {
    const v = p.getVariables();
    const nx = p.getX() + v.get("vx").getAsNumber() * dt;
    const ny = p.getY() + v.get("vy").getAsNumber() * dt;
    if (nx < -OFFSCREEN_PAD || nx > w + OFFSCREEN_PAD || ny < -OFFSCREEN_PAD || ny > h + OFFSCREEN_PAD) {
      p.deleteFromScene(scene);
      continue;
    }
    p.setX(nx);
    p.setY(ny);
  }
}
