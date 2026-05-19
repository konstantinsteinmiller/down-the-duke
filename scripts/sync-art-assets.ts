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

// 3. Ensure objectsFolderStructure has children entries for new sprites.
const folder = scene.objectsFolderStructure as { folderName: string; children?: Array<{ objectName: string }> };
folder.children = folder.children ?? [];
for (const name of ["Island", "Railing"]) {
  if (!folder.children.some((c) => c.objectName === name)) {
    folder.children.push({objectName: name});
    console.log(`  folder child: ADDED ${name}`);
  }
}

await fs.writeFile(FILE, JSON.stringify(g, null, 2) + "\n", "utf8");
console.log(`Wrote ${path.relative(ROOT, FILE)}.`);
