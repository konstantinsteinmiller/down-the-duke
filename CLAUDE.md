# Down the Duke — Claude session anchor

GDevelop Big Game Jam #9 entry. 2D side-scrolling shooter — concept is pirate-ship killing + tower climbing/ascending (
design firming up with the team). 5-day jam window from 2026-05-18, deadline ~2026-05-23. Dual submission required:
itch.io + gd.games.

Package name `down-the-duke`. Working directory is still `hex-game/` — left as-is; rename is a chore for later, not a
blocker.

## Workflow architecture

**Code-first.** The user prefers writing TypeScript over GDevelop's visual editor. Architecture is built to make IDE use
almost entirely optional.

```
game-src/*.ts ── esbuild IIFE ──▶ Project/game.json (Main scene JsCode event)
                                                  │
                                                  ▼
                                         gdexport ──▶ dist/ HTML5
                                                  │
                                                  ▼
                                         serve ──▶ localhost:3000
                                                  │
                                                  ▼
                                  chrome-devtools MCP (--isolated profile)
```

All in-scene game logic lives in `game-src/main.ts` (and modules it imports). `scripts/build-game.ts` bundles to a
single IIFE string and replaces the Main scene's sole `JsCode` event in `Project/game.json`. The IIFE runs every frame;
runtime globals available inside it: `runtimeScene`, `eventsFunctionContext`.

## Hard rules

1. **Never hand-edit `Project/game.json`'s `events` array.** It is overwritten every `pnpm build:game`. All in-scene JS
   goes in `game-src/`.
2. **Object definitions, resources, scene properties, layers** in `game.json` are safe to edit by hand or via MCP write
   tools — just not `events`.
3. **Always run `pnpm build:game` before `pnpm build:web`** (or just `pnpm build` for both).
4. **No Three.js or non-GDevelop renderers.** Jam rule requires "made with GDevelop"; we satisfy that by using real
   GDevelop Sprites + JsCode events that drive the engine API, never by wrapping a foreign canvas.
5. **Don't suggest "open the GDevelop IDE to do X"** unless it is genuinely IDE-only (final gd.games upload). The user
   works in code.

## Commands

| Command           | Purpose                                                                 |
|-------------------|-------------------------------------------------------------------------|
| `pnpm build:game` | Bundle `game-src/` → inject IIFE into Main scene `JsCode` event         |
| `pnpm build:web`  | `gdexport` HTML5 → `dist/`                                              |
| `pnpm build`      | Both, chained                                                           |
| `pnpm preview`    | `serve ./dist` at `http://localhost:3000`                               |
| `pnpm typecheck`  | `tsc --noEmit` across `mcp/`, `scripts/`, `game-src/`                   |
| `pnpm mcp:run`    | Run the local MCP server stdio (normally auto-launched via `.mcp.json`) |
| `pnpm clean`      | Remove `dist/` and `Exported/`                                          |

## Local MCP — `gdevelop`

Auto-registered via `.mcp.json`. Reads + writes `Project/game.json`:

| Read | `get_project_info`, `list_scenes`, `get_scene`, `list_objects`, `list_resources`, `list_extensions` |
| Write | `set_event_js(scene, code)`, `add_object(scene, name, type, spriteResources?)`,
`add_resource(name, file, kind)` |
| Action | `export_web(outDir?, verbose?)` |

`set_event_js` is largely redundant with `pnpm build:game` — prefer the build script for the Main scene's JS. Use the
MCP write tools for one-off operations: registering a new resource, adding a scene object, etc.

Schema notes (GDevelop 5.6):

- `JsCode` event shape:
  `{ type: "BuiltinCommonInstructions::JsCode", inlineCode, parameterObjects: "", useStrict: true, eventsSheetExpanded: true }`
- Sprite object minimum fields: `assetStoreId`, `name`, `persistentUuid` (use `crypto.randomUUID()`), `type: "Sprite"`,
  `adaptCollisionMaskAutomatically: true`, `animations: []`, plus the capability arrays (`variables`, `effects`,
  `behaviors`).
- Image resource minimum:
  `{ alwaysLoaded: false, file, kind: "image", metadata: "", name, smoothed: true, userAdded: true }`.

## Autonomous verify loop

Chrome DevTools MCP is configured with `--isolated` in `~/.claude.json`, so it spawns its own browser profile and never
conflicts with the user's normal Chrome. Cycle:

1. `pnpm build` (bundle + gdexport)
2. `pnpm preview` in background → `http://localhost:3000`
3. `mcp__chrome-devtools__navigate_page` → that URL
4. `mcp__chrome-devtools__list_console_messages` for errors
5. `mcp__chrome-devtools__take_screenshot` for visual confirmation
6. `mcp__chrome-devtools__evaluate_script` to poke runtime state if needed

This is the per-change verification routine. If a build error or a console error fires, fix and re-run.

## What still requires the GDevelop IDE

- Final `.gdgame` export for gd.games submission (only at jam end).
- Anything discovered during dev that genuinely can't be expressed in `game.json` — add it here when it happens.

Currently: nothing else during dev. Stay in code.

## Live task & question state

See `game-todo.md` at the repo root for the running list of outstanding design questions, bootstrap-remaining items, and
the gameplay scaffold backlog.

## Jam rules cheat-sheet (GDevelop Big Game Jam #9)

- Must use GDevelop engine. ← Satisfied by real Sprites + JsCode events driving `gdjs.RuntimeScene` API.
- Submit to itch.io AND gd.games.
- Browser-playable, no extra hardware.
- No NSFW / offensive content.
- Game itself must be made within the jam window. The TS/build pipeline scaffolding is tooling and predates the jam; the
  actual gameplay code in `game-src/` is jam-window work.
- Pre-existing extensions and assets are OK with credit. Don't write events specifically for this jam ahead of time.
