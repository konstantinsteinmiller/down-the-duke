/**
 * One-off (idempotent) script: update Project/game-current.json to reference
 * the user-provided WebP art at Project/assets/art/*.webp. Adds the new
 * Island and Railing sprite objects if they don't exist. Re-points existing
 * Cannon / Enemy / Bullet / EnemyBall resources to the WebP files.
 *
 * Run: pnpm tsx scripts/sync-art-assets.ts
 */

import {promises as fs} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const FILE = path.join(ROOT, "Project", "game-current.json");

interface Resource {
  alwaysLoaded: boolean;
  file: string;
  kind: string;
  metadata: string;
  name: string;
  userAdded: boolean;
  smoothed: boolean;
}

interface SpriteFrame {
  hasCustomCollisionMask: boolean;
  image: string;
  points: unknown[];
  originPoint: { name: string; x: number; y: number };
  centerPoint: { automatic: boolean; name: string; x: number; y: number };
  customCollisionMask: unknown[];
}

interface SpriteObject {
  assetStoreId: string;
  name: string;
  persistentUuid: string;
  type: string;
  updateIfNotVisible: boolean;
  variables: unknown[];
  effects: unknown[];
  behaviors: unknown[];
  adaptCollisionMaskAutomatically: boolean;
  animations: Array<{
    name: string;
    useMultipleDirections: boolean;
    directions: Array<{
      looping: boolean;
      timeBetweenFrames: number;
      sprites: SpriteFrame[];
    }>;
  }>;
}

const raw = await fs.readFile(FILE, "utf8");
const g = JSON.parse(raw);

const resources: Resource[] = g.resources.resources;

function upsertResource(name: string, file: string): void {
  const existing = resources.find((r) => r.name === name);
  if (existing) {
    if (existing.file !== file) console.log(`  resource ${name}: ${existing.file} → ${file}`);
    existing.file = file;
    return;
  }
  resources.push({
    alwaysLoaded: false,
    file,
    kind: "image",
    metadata: "",
    name,
    userAdded: true,
    smoothed: true,
  });
  console.log(`  resource ${name}: ADDED → ${file}`);
}

// 1. Re-point existing resources to the new WebP art.
upsertResource("cannon", "assets/art/cannon.webp");
upsertResource("enemy", "assets/art/ship1.webp");
upsertResource("bullet", "assets/art/cannonball-black.webp");
upsertResource("enemyball", "assets/art/cannonball-black.webp");
// 2. Add the new resources.
upsertResource("island", "assets/art/island.webp");
upsertResource("railing", "assets/art/railing.webp");
upsertResource("cannonball-ui", "assets/art/cannonball-ui.webp");
upsertResource("crosshair", "assets/art/crosshair.webp");
upsertResource("cannonball-red", "assets/art/cannonball-red.webp");
upsertResource("healthbar", "assets/placeholders/healthbar.png");
upsertResource("healthbar-bg", "assets/placeholders/healthbar-bg.png");
upsertResource("reload-pip", "assets/placeholders/reload-pip.png");

const scene = g.layouts[0];
const sceneObjects: SpriteObject[] = scene.objects;

function buildSprite(name: string, image: string, uuid: string): SpriteObject {
  return {
    assetStoreId: "",
    name,
    persistentUuid: uuid,
    type: "Sprite",
    updateIfNotVisible: false,
    variables: [],
    effects: [],
    behaviors: [],
    adaptCollisionMaskAutomatically: true,
    animations: [
      {
        name: "default",
        useMultipleDirections: false,
        directions: [
          {
            looping: false,
            timeBetweenFrames: 0.08,
            sprites: [
              {
                hasCustomCollisionMask: false,
                image,
                points: [],
                originPoint: {name: "origine", x: 0, y: 0},
                centerPoint: {automatic: true, name: "centre", x: 0, y: 0},
                customCollisionMask: [],
              },
            ],
          },
        ],
      },
    ],
  };
}

function upsertSprite(name: string, image: string, uuid: string): void {
  const existing = sceneObjects.find((o) => o.name === name);
  if (existing) {
    console.log(`  sprite ${name}: already exists`);
    return;
  }
  sceneObjects.push(buildSprite(name, image, uuid));
  console.log(`  sprite ${name}: ADDED (image=${image})`);
}

upsertSprite("Island", "island", "15140e11-7777-4ca1-9a1c-aaa777777777");
upsertSprite("Railing", "railing", "9a1110e1-8888-4ca1-9a1c-bbb888888888");
upsertSprite("Crosshair", "crosshair", "c2055ae1-9999-4ca1-9a1c-ccc999999999");
upsertSprite("HealthBar", "healthbar", "4ea17b00-aaaa-4ca1-9a1c-aaa000000000");
upsertSprite("HealthBarBg", "healthbar-bg", "4ea17b00-bbbb-4ca1-9a1c-bbb000000000");
upsertSprite("CannonballUI", "cannonball-ui", "a330d00e-cccc-4ca1-9a1c-ccc000000000");
upsertSprite("AmmoDot", "cannonball-black", "a330d00e-dddd-4ca1-9a1c-ddd000000000");
upsertSprite("ReloadPip", "reload-pip", "e0a17777-eeee-4ca1-9a1c-eee000000000");

// White-on-shadowed text helper. Shadows + outlines give contrast on
// any background. Both properties get overwritten on re-sync so it's
// safe to tweak the defaults here and re-run the script.
interface TextProps {
  characterSize?: number;
  color?: { r: number; g: number; b: number };
  outlineThickness?: number;
}

function upsertTextObject(name: string, uuid: string, initial: string, props: TextProps = {}): void {
  const obj = {
    assetStoreId: "",
    name,
    persistentUuid: uuid,
    type: "TextObject::Text",
    string: initial,
    font: "",
    characterSize: props.characterSize ?? 28,
    color: props.color ?? {r: 255, g: 255, b: 255},
    bold: true,
    italic: false,
    smoothed: true,
    underlined: false,
    isShadowEnabled: true,
    shadowColor: {r: 0, g: 0, b: 0},
    shadowOpacity: 230,
    shadowDistance: 2,
    shadowAngle: 90,
    shadowBlurRadius: 1,
    isOutlineEnabled: true,
    outlineColor: {r: 0, g: 0, b: 0},
    outlineThickness: props.outlineThickness ?? 2,
    variables: [],
    effects: [],
    behaviors: [],
  };
  const existing = sceneObjects.find((o) => o.name === name);
  if (existing) {
    Object.assign(existing, obj);
    console.log(`  text ${name}: UPDATED (initial="${initial}")`);
    return;
  }
  sceneObjects.push(obj as unknown as SpriteObject);
  console.log(`  text ${name}: ADDED (initial="${initial}")`);
}

upsertResource("overlay", "assets/placeholders/overlay.png");
upsertResource("button-bg", "assets/placeholders/button-bg.png");
upsertResource("hb-frame", "assets/placeholders/hb-frame.png");
upsertResource("hb-section", "assets/placeholders/hb-section.png");

upsertSprite("LoseOverlay", "overlay", "1059e077-0000-4ca1-9a1c-000000000001");
upsertSprite("RestartButtonBg", "button-bg", "b0770e88-1111-4ca1-9a1c-111111111111");
upsertSprite("PlayerHpFrame", "hb-frame", "b0770e88-2222-4ca1-9a1c-aaa222222222");
upsertSprite("PlayerHpSection", "hb-section", "b0770e88-3333-4ca1-9a1c-bbb333333333");
upsertSprite("ChargedBullet", "cannonball-red", "ba110e22-4444-4ca1-9a1c-aab444444444");

// Pivot the cannon around its breech (≈69% down the 533×698 sprite)
// instead of the geometric centre, so aiming swings the barrel while
// the mounted base stays roughly planted. Coordinates are in native
// (un-scaled) sprite pixels.
function setCenterPoint(name: string, x: number, y: number): void {
  const obj = sceneObjects.find((o) => o.name === name);
  if (!obj || !obj.animations?.[0]?.directions?.[0]?.sprites?.[0]) return;
  const cp = obj.animations[0].directions[0].sprites[0].centerPoint;
  cp.automatic = false;
  cp.x = x;
  cp.y = y;
  console.log(`  centerPoint ${name}: (${x}, ${y})`);
}

setCenterPoint("Cannon", 266, 480);

upsertTextObject("AmmoText", "11111111-aaaa-4111-aaaa-111111111111", "4");
upsertTextObject("GameOverText", "60a0ee70-2222-4222-bbbb-222222222222", "YOU SUNK!", {
  characterSize: 56,
  color: {r: 240, g: 60, b: 60},
  outlineThickness: 3,
});
upsertTextObject("RestartButtonText", "9e57a917-3333-4333-cccc-333333333333", "RESTART", {
  characterSize: 32,
  color: {r: 250, g: 230, b: 180},
});
upsertTextObject("VictoryText", "01ce0079-4444-4444-dddd-444444444444", "VICTORY!", {
  characterSize: 56,
  color: {r: 240, g: 210, b: 80},
  outlineThickness: 3,
});
upsertTextObject("ContinueButtonText", "c071711e-5555-4555-eeee-555555555555", "CONTINUE", {
  characterSize: 32,
  color: {r: 250, g: 230, b: 180},
});

// ── Level 2 (vertical scroller) ──
upsertResource("wall-tile", "assets/placeholders/wall-tile.png");
upsertResource("power-frame", "assets/placeholders/power-frame.png");
upsertResource("power-fill", "assets/placeholders/power-fill.png");
upsertResource("l2box", "assets/placeholders/l2box.png");

upsertResource("factory", "assets/art/factory.webp");
upsertResource("reactor", "assets/art/reactor.webp");
upsertResource("tut-container", "assets/placeholders/tut-container.png");
upsertResource("tut-light", "assets/placeholders/tut-light.png");
upsertResource("burst", "assets/placeholders/burst.png");

upsertSprite("WallTile", "wall-tile", "wa1170e2-0000-4ca1-9a1c-aaa000000002");
upsertSprite("PowerFrame", "power-frame", "90we7f00-1111-4ca1-9a1c-bbb000000002");
upsertSprite("PowerFill", "power-fill", "90we7f00-2222-4ca1-9a1c-ccc000000002");
upsertSprite("L2Enemy", "l2box", "12e0e000-3333-4ca1-9a1c-ddd000000002");
upsertSprite("Factory", "factory", "facc0002-0000-4ca1-9a1c-aaa000000003");
upsertSprite("Reactor", "reactor", "4eac0002-1111-4ca1-9a1c-bbb000000003");
// Enemy cannon reuses the player cannon art; spawned rotated 180° to
// point its muzzle south at the player.
upsertSprite("EnemyCannon", "cannon", "ecaa0002-2222-4ca1-9a1c-ccc000000003");
// Phase-1 tutorial: yellow hazard container + its flashing red light.
upsertSprite("TutContainer", "tut-container", "70700002-0000-4ca1-9a1c-aaa000000004");
upsertSprite("TutLight", "tut-light", "70700002-1111-4ca1-9a1c-bbb000000004");
upsertSprite("Burst", "burst", "b0552002-0000-4ca1-9a1c-ccc000000004");
// Catch-can: red ball shown loaded in the cannon pipe; and the enemy's
// red cannonball projectile. Both reuse the red cannonball art.
upsertSprite("LoadedBall", "cannonball-red", "70adb002-0000-4ca1-9a1c-ddd000000004");
upsertSprite("EnemyRedBall", "cannonball-red", "e2edba11-0000-4ca1-9a1c-eee000000004");

upsertTextObject("L2Label", "12e0e000-4444-4444-eeee-000000000002", "ENEMY", {
  characterSize: 16,
  color: {r: 20, g: 20, b: 20},
  outlineThickness: 1,
});
upsertTextObject("PowerLabel", "90we7f00-5555-4555-aaaa-000000000002", "DUKE", {
  characterSize: 14,
  color: {r: 240, g: 240, b: 240},
});
upsertTextObject("CatchCanText", "ca7c0a00-6666-4666-bbbb-000000000002",
  "CATCH-CAN!\nFire back for\nDOUBLE DAMAGE!", {
    characterSize: 30,
    color: {r: 255, g: 90, b: 60},
    outlineThickness: 3,
  });
upsertTextObject("TutHintText", "70700002-2222-4222-cccc-000000000004",
  "Blow up the container!", {
    characterSize: 22,
    color: {r: 255, g: 230, b: 120},
    outlineThickness: 2,
  });
upsertTextObject("P2HintText", "70700002-3333-4333-dddd-000000000004",
  "", {
    characterSize: 22,
    color: {r: 255, g: 235, b: 170},
    outlineThickness: 2,
  });
upsertTextObject("ParryText", "70700002-4444-4444-eeee-000000000004",
  "PARRY", {
    characterSize: 52,
    color: {r: 255, g: 90, b: 60},
    outlineThickness: 3,
  });

// 3. Ensure objectsFolderStructure has children entries for new sprites.
const folder = scene.objectsFolderStructure as { folderName: string; children?: Array<{ objectName: string }> };
folder.children = folder.children ?? [];
for (const name of ["Island", "Railing", "Crosshair", "HealthBar", "HealthBarBg", "CannonballUI", "AmmoDot", "ReloadPip", "AmmoText", "LoseOverlay", "RestartButtonBg", "GameOverText", "RestartButtonText", "PlayerHpFrame", "PlayerHpSection", "ChargedBullet", "VictoryText", "ContinueButtonText", "WallTile", "PowerFrame", "PowerFill", "L2Enemy", "L2Label", "PowerLabel", "CatchCanText", "Factory", "Reactor", "EnemyCannon", "TutContainer", "TutLight", "TutHintText", "Burst", "P2HintText", "ParryText", "LoadedBall", "EnemyRedBall"]) {
  if (!folder.children.some((c) => c.objectName === name)) {
    folder.children.push({objectName: name});
    console.log(`  folder child: ADDED ${name}`);
  }
}

await fs.writeFile(FILE, JSON.stringify(g, null, 2) + "\n", "utf8");
console.log(`Wrote ${path.relative(ROOT, FILE)}.`);
