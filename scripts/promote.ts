/**
 * Promote Project/game-current.json → Project/game.json.
 *
 * Run this once the working copy is in a state you want the GDevelop IDE
 * to see. Close the project in the IDE first (otherwise the IDE has the
 * old game.json in memory and will overwrite this on its next save).
 *
 * Browser preview does NOT need a promote — `pnpm build` exports to
 * `dist/` from `game-current.json` directly.
 */

import {promises as fs} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = path.resolve(HERE, "..", "Project");
const SRC = path.join(PROJECT_DIR, "game-current.json");
const DST = path.join(PROJECT_DIR, "game.json");

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

if (!(await exists(SRC))) {
  console.error(`Nothing to promote — ${path.basename(SRC)} doesn't exist yet. Run \`pnpm build:game\` first.`);
  process.exit(1);
}

const raw = await fs.readFile(SRC, "utf8");
await fs.writeFile(DST, raw, "utf8");
console.log(`Promoted ${path.basename(SRC)} → ${path.basename(DST)} (${raw.length.toLocaleString()} chars).`);
console.log(`Close + reopen the project in GDevelop IDE to pick up the changes.`);
