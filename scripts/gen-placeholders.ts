/**
 * Generate RGBA PNG placeholders for the prototype sprites.
 * Hand-rolled minimal PNG encoder so we don't drag in pngjs / native deps.
 *
 * Each placeholder is either a solid colour or a per-pixel function. Shapes
 * are drawn with simple coordinate tests — readable, no compositor needed.
 *
 * Output: Project/assets/placeholders/*.png
 *
 * Run: pnpm tsx scripts/gen-placeholders.ts
 */

import {promises as fs} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {deflateSync} from "node:zlib";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(HERE, "..");
const OUT_DIR = path.join(PROJECT_ROOT, "Project", "assets", "placeholders");

type RGBA = [number, number, number, number];
type PixelFn = (x: number, y: number, w: number, h: number) => RGBA;

const TRANSPARENT: RGBA = [0, 0, 0, 0];

// ---------- Palette ----------
const BROWN_DARK: RGBA = [70, 45, 25, 255];
const BROWN_MID: RGBA = [130, 90, 60, 255];
const BROWN_WOOD: RGBA = [180, 130, 80, 255];
const GREY_DARK: RGBA = [50, 50, 60, 255];
const GREY_MID: RGBA = [95, 95, 105, 255];
const BLACK: RGBA = [15, 15, 15, 255];
const BLACK_RIM: RGBA = [55, 55, 55, 255];
const RED_STRIPE: RGBA = [220, 35, 35, 255];
const WHITE_STRIPE: RGBA = [240, 240, 240, 255];
const SEA_BLUE: RGBA = [30, 90, 140, 255];
const CASTLE: RGBA = [55, 50, 70, 255];

// ---------- Shape helpers ----------
function inRect(x: number, y: number, x0: number, y0: number, x1: number, y1: number): boolean {
  return x >= x0 && x < x1 && y >= y0 && y < y1;
}

function distSq(x: number, y: number, cx: number, cy: number): number {
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy;
}

// ---------- Sprite pixel functions ----------

/** 80×40 side-view ship hull: mast, deck, hull. Faces "into" the screen
 *  (symmetric horizontally so it reads the same coming from L or R). */
const ship: PixelFn = (x, y) => {
  // Mast
  if (inRect(x, y, 38, 2, 42, 18)) return BROWN_DARK;
  // Crow's nest / sail patch on the mast
  if (inRect(x, y, 34, 6, 46, 10)) return BROWN_WOOD;
  // Deck top (lighter wood, slightly trapezoidal: narrow at the top)
  if (inRect(x, y, 10, 18, 70, 22)) return BROWN_WOOD;
  // Hull body
  if (inRect(x, y, 8, 22, 72, 30)) return BROWN_MID;
  if (inRect(x, y, 12, 30, 68, 35)) return BROWN_DARK;
  // Hull bottom (tapered manually)
  if (inRect(x, y, 16, 35, 64, 38)) return BROWN_DARK;
  if (inRect(x, y, 22, 38, 58, 40)) return BROWN_DARK;
  return TRANSPARENT;
};

/** 20×20 red+white concentric bullseye target — the ship's weak point. */
const target: PixelFn = (x, y) => {
  const d2 = distSq(x, y, 10, 10);
  if (d2 >= 10 * 10) return TRANSPARENT;
  if (d2 >= 8 * 8) return WHITE_STRIPE; // outer white rim
  if (d2 >= 6 * 6) return RED_STRIPE;   // red ring
  if (d2 >= 3 * 3) return WHITE_STRIPE; // inner white ring
  return RED_STRIPE;                       // bullseye
};

/** 120×200 cannon — the BIG foreground element at the bottom of the
 *  screen. Player views the game "from behind the cannon". Comprises a
 *  wooden carriage with two wheels at the bottom and a thick dark
 *  barrel rising up from the centre. Rotates as one sprite via
 *  setAngle(); the carriage swings a little along with the barrel
 *  under default centre-of-mass rotation, which is acceptable for the
 *  ±15° aim range. */
const cannon: PixelFn = (x, y) => {
  // Wheels (circles on left and right of the carriage)
  const lwx = 28, rwx = 92, wy = 175, wr = 22;
  const ldist2 = distSq(x, y, lwx, wy);
  const rdist2 = distSq(x, y, rwx, wy);
  if (ldist2 < wr * wr) return ldist2 < (wr - 5) * (wr - 5) ? BROWN_DARK : BROWN_WOOD;
  if (rdist2 < wr * wr) return rdist2 < (wr - 5) * (wr - 5) ? BROWN_DARK : BROWN_WOOD;
  // Carriage (wooden box body)
  if (inRect(x, y, 16, 140, 104, 185)) return BROWN_WOOD;
  // Carriage frame (darker top + bottom rails)
  if (inRect(x, y, 16, 140, 104, 146)) return BROWN_DARK;
  if (inRect(x, y, 16, 180, 104, 186)) return BROWN_DARK;
  // Barrel tube
  if (inRect(x, y, 44, 30, 76, 150)) return GREY_DARK;
  // Muzzle ring (slightly wider at the tip)
  if (inRect(x, y, 38, 12, 82, 36)) return GREY_MID;
  // Trunnion / cap connecting barrel to carriage
  if (inRect(x, y, 36, 130, 84, 148)) return GREY_DARK;
  // Touch hole accent on the carriage
  if (inRect(x, y, 56, 158, 64, 168)) return [40, 25, 15, 255];
  return TRANSPARENT;
};

/** 14×14 black cannonball — used for both the player's "black shot" and
 *  enemy fire (per design doc, both are black; we'll separate them later
 *  by giving the enemy ball a red rim once visual differentiation matters). */
const cannonball: PixelFn = (x, y) => {
  const d2 = distSq(x, y, 7, 7);
  if (d2 >= 7 * 7) return TRANSPARENT;
  if (d2 >= 6 * 6) return BLACK_RIM;
  return BLACK;
};

/** 14×14 enemy ball — black core with a faint red rim so it reads as
 *  hostile at a glance. */
const enemyball: PixelFn = (x, y) => {
  const d2 = distSq(x, y, 7, 7);
  if (d2 >= 7 * 7) return TRANSPARENT;
  if (d2 >= 6 * 6) return RED_STRIPE; // red rim
  return BLACK;
};

/** 96×220 castle silhouette in the distance: solid dark slate body with
 *  crenellations across the top edge. */
const castleSilhouette: PixelFn = (x, y) => {
  // Crenellations: 12px-wide alternating blocks across the top 18px
  if (y < 18) {
    return Math.floor(x / 12) % 2 === 0 ? CASTLE : TRANSPARENT;
  }
  return CASTLE;
};

/** 4×800 vertical dashed line — dead-zone playfield boundary marker.
 *  Every other 10-px block is filled, so the line reads as dashed. */
const deadZoneLine: PixelFn = (x, y) => {
  return Math.floor(y / 10) % 2 === 0 ? [240, 240, 240, 160] : TRANSPARENT;
};

/** 380×100 player ship — wide wooden deck spanning the bottom of the
 *  screen, with railings on the left and right and a slight raised bow
 *  in the middle where the cannon mounts. Renders behind the cannon. */
const playerShip: PixelFn = (x, y, w, h) => {
  const cx = w / 2;
  // Curved bow lip in the middle — raised wooden ridge where the cannon
  // base sits. A shallow semicircle peeking up from the top of the deck.
  const bowR = 60;
  const d2 = distSq(x, y, cx, 30);
  if (d2 < bowR * bowR && y < 30) return BROWN_MID;
  if (d2 < (bowR - 6) * (bowR - 6) && y < 30) return BROWN_WOOD;
  // Main deck planks
  if (inRect(x, y, 0, 26, w, 92)) {
    // Plank seam lines every 12 px
    if (y % 12 === 0) return BROWN_DARK;
    return BROWN_WOOD;
  }
  // Top railing across the deck
  if (inRect(x, y, 0, 22, w, 28)) return BROWN_DARK;
  // Hull bottom strip (darker)
  if (inRect(x, y, 0, 92, w, 100)) return BROWN_DARK;
  // Side posts / railings — small dark vertical bars near each end
  if (inRect(x, y, 8, 6, 18, 26)) return BROWN_DARK;
  if (inRect(x, y, w - 18, 6, w - 8, 26)) return BROWN_DARK;
  return TRANSPARENT;
};

// ---------- Output table ----------

interface Placeholder {
  name: string;
  w: number;
  h: number;
  pixel: RGBA | PixelFn;
}

const PLACEHOLDERS: Placeholder[] = [
  {name: "player", w: 380, h: 100, pixel: playerShip},        // wide deck at the bottom, cannon sits on top
  {name: "cannon", w: 120, h: 200, pixel: cannon},
  {name: "enemy", w: 80, h: 40, pixel: ship},
  {name: "target", w: 20, h: 20, pixel: target},
  {name: "bullet", w: 14, h: 14, pixel: cannonball},
  {name: "enemyball", w: 14, h: 14, pixel: enemyball},
  {name: "castle", w: 80, h: 140, pixel: castleSilhouette},
  {name: "sea", w: 380, h: 600, pixel: SEA_BLUE},
  {name: "deadzone", w: 4, h: 800, pixel: deadZoneLine},
  {name: "healthbar-bg", w: 60, h: 8, pixel: [25, 25, 25, 220]}, // dark plate
  {name: "healthbar", w: 60, h: 8, pixel: [220, 35, 35, 255]}, // bright red fill
  {
    name: "reload-pip", w: 10, h: 10, pixel: (x, y) => {
      const cx = 5, cy = 5;
      const d2 = (x - cx) * (x - cx) + (y - cy) * (y - cy);
      if (d2 >= 25) return [0, 0, 0, 0];
      return [255, 215, 80, 255]; // amber pip
    }
  },
  // Lose-screen overlay: solid black; we set opacity 180 at spawn time
  // so the gameplay still reads dimly underneath.
  {name: "overlay", w: 64, h: 64, pixel: [0, 0, 0, 255]},
  // Restart button background: dark slate with a lighter rim.
  {
    name: "button-bg", w: 240, h: 64, pixel: (x, y, w, h) => {
      const RIM = 4;
      const inFrame = x >= RIM && x < w - RIM && y >= RIM && y < h - RIM;
      if (!inFrame) return [210, 195, 130, 240]; // tan rim
      return [55, 45, 30, 235]; // dark inner panel
    }
  },
  // Player health bar — frame + per-HP section. Drawn with a thin
  // light bevel on the top edge, a thicker dark shadow on the bottom,
  // and a darker red fill in the middle so it reads as a chunky 3D
  // brick rather than a flat rectangle.
  {
    name: "hb-frame", w: 280, h: 44, pixel: (x, y, w, h) => {
      const RIM = 4;
      if (x < RIM || x >= w - RIM || y < RIM || y >= h - RIM) return [205, 175, 120, 240];
      return [30, 22, 16, 235];
    }
  },
  {
    name: "hb-section", w: 48, h: 28, pixel: (x, y, w, h) => {
      // top highlight
      if (y < 4) return [255, 140, 100, 240];
      // bottom shadow
      if (y >= h - 4) return [110, 18, 18, 240];
      // left + right rim
      if (x < 2 || x >= w - 2) return [80, 14, 14, 240];
      // main fill — vertical gradient red → darker
      const t = (y - 4) / (h - 8);
      const r = Math.round(220 - 40 * t);
      const g = Math.round(40 - 18 * t);
      const b = Math.round(40 - 18 * t);
      return [r, g, b, 240];
    }
  },
];

// ---------- PNG encoder (RGBA, 8-bit, no filtering, single IDAT) ----------

const CRC_TABLE: Uint32Array = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePng(w: number, h: number, pixel: Placeholder["pixel"]): Buffer {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr.writeUInt8(8, 8);  // bit depth
  ihdr.writeUInt8(6, 9);  // colour type RGBA
  ihdr.writeUInt8(0, 10); // compression
  ihdr.writeUInt8(0, 11); // filter
  ihdr.writeUInt8(0, 12); // interlace

  const raw = Buffer.alloc(h * (1 + w * 4));
  for (let y = 0; y < h; y++) {
    const rowStart = y * (1 + w * 4);
    raw[rowStart] = 0; // filter byte (None)
    for (let x = 0; x < w; x++) {
      const c = typeof pixel === "function" ? pixel(x, y, w, h) : pixel;
      const o = rowStart + 1 + x * 4;
      raw[o + 0] = c[0];
      raw[o + 1] = c[1];
      raw[o + 2] = c[2];
      raw[o + 3] = c[3];
    }
  }
  const idat = deflateSync(raw);
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

// ---------- Run ----------

await fs.mkdir(OUT_DIR, {recursive: true});
for (const p of PLACEHOLDERS) {
  const png = encodePng(p.w, p.h, p.pixel);
  const file = path.join(OUT_DIR, `${p.name}.png`);
  await fs.writeFile(file, png);
  console.log(`wrote ${file} (${p.w}×${p.h}, ${png.length} bytes)`);
}
