/**
 * Bundle game-src/ to a single JS string and inject it as the Main scene's
 * sole JsCode event.
 *
 * Source / destination strategy (shadow file workflow):
 *   - Output is always `Project/game-current.json` — never `Project/game.json`.
 *     `game.json` is the file the GDevelop IDE has loaded; writing it while
 *     the IDE is open causes the IDE save to race with our edits.
 *   - Source: prefer `game-current.json` when it exists; if `game.json` is
 *     newer (user saved in the IDE), pick up their changes from there
 *     instead. Falls back to `game.json` on first run.
 *
 * Use `pnpm promote` to copy `game-current.json` → `game.json` once you
 * want the IDE to see the latest. Browser preview (`pnpm preview`) uses
 * `dist/` which is built from `game-current.json`, so it always reflects
 * the latest without needing promotion.
 */

import {build} from "esbuild";
import {promises as fs} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(HERE, "..");
const GAME_SRC_ENTRY = path.join(PROJECT_ROOT, "game-src", "main.ts");
const PROJECT_DIR = path.join(PROJECT_ROOT, "Project");
const GAME_JSON = path.join(PROJECT_DIR, "game.json");
const GAME_CURRENT_JSON = path.join(PROJECT_DIR, "game-current.json");
const TARGET_SCENE = "Main";

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function pickSource(): Promise<string> {
  if (!(await exists(GAME_CURRENT_JSON))) return GAME_JSON;
  const [g, c] = await Promise.all([fs.stat(GAME_JSON), fs.stat(GAME_CURRENT_JSON)]);
  return g.mtimeMs > c.mtimeMs ? GAME_JSON : GAME_CURRENT_JSON;
}

async function bundle(): Promise<string> {
  const result = await build({
    entryPoints: [GAME_SRC_ENTRY],
    bundle: true,
    format: "iife",
    platform: "browser",
    target: "es2020",
    minify: false,
    write: false,
    logLevel: "warning",
  });
  const out = result.outputFiles?.[0];
  if (!out) throw new Error("esbuild produced no output");
  return out.text;
}

async function inject(code: string): Promise<void> {
  const source = await pickSource();
  const raw = await fs.readFile(source, "utf8");
  const g = JSON.parse(raw) as {
    layouts?: Array<{ name?: string; events?: Array<{ type?: string }> }>;
  };
  const scene = (g.layouts ?? []).find((l) => l.name === TARGET_SCENE);
  if (!scene) {
    throw new Error(`Scene "${TARGET_SCENE}" not found in ${source}`);
  }
  const existing = scene.events ?? [];
  const kept = existing.filter((e) => e.type !== "BuiltinCommonInstructions::JsCode");
  const jsEvent = {
    type: "BuiltinCommonInstructions::JsCode",
    inlineCode: code,
    parameterObjects: "",
    useStrict: true,
    eventsSheetExpanded: true,
  };
  scene.events = [jsEvent, ...kept];
  await fs.writeFile(GAME_CURRENT_JSON, JSON.stringify(g, null, 2) + "\n", "utf8");
  console.log(
    `Source: ${path.relative(PROJECT_ROOT, source)}  →  ` +
    `Wrote: ${path.relative(PROJECT_ROOT, GAME_CURRENT_JSON)}`,
  );
}

const code = await bundle();
await inject(code);
console.log(`Injected ${code.length} chars of bundled JS into "${TARGET_SCENE}" scene.`);
