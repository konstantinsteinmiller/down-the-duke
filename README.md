# down-the-duke

GDevelop Big Game Jam #9 entry, working title **Down the Duke** — 2D side-scrolling shooter, code-first authored.

For architecture, hard rules, and Claude session context see [`CLAUDE.md`](./CLAUDE.md).
For outstanding design questions and the active task list see [`game-todo.md`](./game-todo.md).

## Stack

- **Authoring:** TypeScript + esbuild — game logic in `game-src/`, bundled to an IIFE and injected as the Main scene's
  sole `JsCode` event.
- **Engine:** [GDevelop 5](https://gdevelop.io/) runtime (`gdjs`), driven from injected JS.
- **Web export:** [`gdexporter`](https://github.com/arthuro555/gdexporter) — headless CLI, no GDevelop IDE needed for
  dev builds.
- **AI integration:** custom MCP server at `mcp/server.ts` exposing read + write tools over `game.json`.
- **Package manager:** pnpm.

## One-time setup

```
pnpm install
```

The GDevelop desktop IDE is only required at the very end of the jam, for the gd.games upload step. Daily development
does not need it.

## Daily workflow

```
pnpm build         # bundle game-src + gdexport → dist/
pnpm preview       # serve dist/ at http://localhost:3000
```

Edit `game-src/main.ts` (and submodules), run `pnpm build`, refresh the browser.

## Scripts

| Command                  | What it does                                                                 |
|--------------------------|------------------------------------------------------------------------------|
| `pnpm build:game`        | Bundle `game-src/` → inject IIFE into `Project/game.json` Main scene         |
| `pnpm build:web`         | Export to HTML5 via `gdexport` → `dist/`                                     |
| `pnpm build`             | Both, chained                                                                |
| `pnpm build:web:verbose` | `build:web` with GDCore logging                                              |
| `pnpm preview`           | Serve `dist/` at `http://localhost:3000`                                     |
| `pnpm typecheck`         | `tsc --noEmit` across `mcp/`, `scripts/`, `game-src/`                        |
| `pnpm clean`             | Remove `dist/` and `Exported/`                                               |
| `pnpm mcp:run`           | Run the MCP server manually (stdio) — normally auto-launched via `.mcp.json` |
| `pnpm mcp:typecheck`     | Type-check `mcp/server.ts` only                                              |

## Project layout

```
down-the-duke/  (directory still 'hex-game/' for now)
├── Project/
│   └── game.json          # GDevelop project. Main scene events injected by build:game — don't hand-edit.
├── game-src/              # TS sources bundled into the Main scene JsCode event
│   └── main.ts            # Entry point
├── scripts/
│   └── build-game.ts      # esbuild → inject pipeline
├── mcp/
│   ├── server.ts          # Custom MCP server (read + write tools over game.json)
│   └── smoke.mjs          # `pnpm exec node mcp/smoke.mjs` to sanity-check the server
├── dist/                  # Web export. gitignored.
├── CLAUDE.md              # Claude session anchor — read first before working in the repo
├── game-todo.md           # Outstanding questions + bootstrap state
├── .mcp.json              # Claude Code MCP registration
├── tsconfig.json
├── package.json
└── README.md
```

## MCP server (Claude Code integration)

`.mcp.json` registers a local MCP server named `gdevelop`. The next time you open this folder in Claude Code, it will
prompt you to approve the server, then expose these tools:

| Kind   | Tools                                                                                               |
|--------|-----------------------------------------------------------------------------------------------------|
| Read   | `get_project_info`, `list_scenes`, `get_scene`, `list_objects`, `list_resources`, `list_extensions` |
| Write  | `set_event_js`, `add_object`, `add_resource`                                                        |
| Action | `export_web`                                                                                        |

Override the project root with `GDEVELOP_PROJECT_ROOT` if you want the MCP server to point somewhere other than this
folder.

## Pinning the GDJS runtime version

By default `gdexport` downloads the latest GDJS runtime at export time. To pin it for reproducibility, add
`--version v5.6.269` to the `build:web` script in `package.json`.
