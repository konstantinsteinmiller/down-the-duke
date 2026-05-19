# Down the Duke — TODO

Working notes for the GDevelop Big Game Jam #9 entry. Code-first workflow:
TS in `game-src/` → esbuild IIFE → injected as the Main scene's `JsCode` event
→ `gdexport` to HTML5. 5-day jam window from 2026-05-18, deadline ~2026-05-23.

For architecture, hard rules, build commands, and Claude session context, see
[`CLAUDE.md`](./CLAUDE.md). This file is the live task list.

## Shadow-file workflow (avoids GDevelop IDE save collisions)

The GDevelop IDE keeps the loaded project in memory and rewrites
`Project/game.json` on every save, which used to overwrite our external
edits (added objects, resources, injected JS). The fix:

- **`Project/game-current.json`** = the working copy. `pnpm build:game`
  writes here. `pnpm build:web` exports from here to `dist/`. Manual
  structural edits (new resources / objects) go here.
- **`Project/game.json`** = the file the IDE has open. Only touched by
  `pnpm promote`, which copies `game-current.json` → `game.json`. After
  promoting, **close and reopen the project in the IDE** so it re-reads
  from disk.
- Browser preview (`pnpm preview` → `localhost:3000`) reflects the
  working copy immediately; no promote required.
- If you've made edits in the IDE and want them as the new base,
  `build-game.ts` automatically picks `game.json` over `game-current.json`
  when `game.json` has the newer mtime.

---

## Outstanding questions

### Game design

- [x] **Genre lock-in.** Hypercasual first-person arcade cannon shooter. Player
  controls a ship's cannon at the bottom of the screen; enemy ships enter
  from left/right and stop near the sides; player aims and fires to sink
  them; ships also fire back and the player can parry. See `game-design.md`
  for the full spec.
- [x] **Player avatar.** Cannon barrel at bottom-centre. First-person behind it.
- [x] **Camera.** **Static** for Level 1. (Levels 2 and 3 deferred — would
  introduce vertical scrolling later but are out of scope for the mock.)
- [x] **Controls (dev placeholder).** Mouse-X aim + left-click / Space to fire.
  Mobile touch maps to cursor automatically via GDevelop's InputManager.
  Design target: finger-drag to rotate cannon, tap to fire — same logical
  input, just touch-driven.
- [x] **Win / lose conditions.** Mock keeps **3 ships → WON** for now (user
  confirmed 2026-05-19). Player HP=0 → LOST. Bump to the design-doc
  5-ship sequence later if the mock plays well.
- [x] **Jam theme constraint.** Theme is **"To the Top"** (confirmed
  2026-05-19). The game interprets it as the player ship climbing up
  toward the Duke's Castle of Verticality and destroying it from the top —
  Level 1 is the sea voyage, Level 2 ascends the fortress, Level 3 is the
  castle finale. Level 1 mock alone doesn't visibly express the theme;
  revisit when Level 2/3 work resumes or add a parallax of the castle
  silhouette in the distance even during Level 1.

### Out of scope for the mock (deferred)

- Level 2 (Fortress Ascent, vertical scrolling) and Level 3 (Duke's Castle).
- Charge shots, ammo / reload counter, wind resistance, red wobbling balls,
  parry-via-charged-shot, Catch-Can, target zones on ships, multiple ship
  types (Caravel / Armored / Galley), parallax background, art, audio.

### Production

- [ ] **Asset spec for the artist.** Commit to sprite dimensions before they
  start: e.g. Player 32×32, Bullet 8×8, Enemy ship 48×24, Tile 32×32.
  Decide pixel art vs. clean vector. Power-of-two textures help GPU perf.
- [ ] **Audio.** SFX placeholders during dev (silence or generated beeps)?
  Music — artist-supplied or licensed free pack?
- [ ] **Team size & roles.** Only Konstantin coding? Anyone else touching
  `Project/game.json` directly? If yes, agree: nobody hand-edits the
  `events` array — always go through `game-src/` + `pnpm build:game`,
  otherwise the next `build:game` overwrites their changes.
- [ ] **Directory rename.** Working dir is still `hex-game/`. Rename to
  `down-the-duke/` once convenient — not a blocker.

### Tooling

- [ ] **gd.games submission flow.** Jam requires dual upload to itch.io **and**
  gd.games. Confirm the upload steps before the final day — gd.games may
  want a specific export format beyond the `dist/` zip.
- [ ] **Cross-machine reproducibility.** `pnpm-lock.yaml` is committed; verify
  a fresh `pnpm install && pnpm build` on a clean checkout produces a
  working `dist/`.

---

## Bootstrap — done

- [x] Cleaned `game.json` metadata: `firstLayout="Main"`, scene renamed
  `"Unbenannte Szene"` → `"Main"`, 3D lighting effects stripped from the
  layer, placeholder `NewSprite` removed, `properties.name = "Down the Duke"`.
- [x] Extended MCP server (`mcp/server.ts`) with write tools:
  `set_event_js`, `add_object`, `add_resource`.
- [x] TS bundling pipeline: `game-src/main.ts` → esbuild IIFE → injected as the
  Main scene's sole `JsCode` event via `scripts/build-game.ts`.
- [x] Scripts wired in `package.json`:
  - `pnpm build:game` — bundle + inject
  - `pnpm build:web` — gdexport HTML5
  - `pnpm build` — both, chained
  - `pnpm preview` — `serve ./dist` at `http://localhost:3000`
  - `pnpm typecheck` — `tsc --noEmit` across `mcp/`, `scripts/`, `game-src/`
- [x] Heartbeat bootstrap: `game-src/main.ts` increments a scene variable
  each frame and logs `[game] heartbeat: frame N` every 60 frames. Builds,
  exports, and serves cleanly. **Not yet visually verified in browser.**
- [x] Chrome DevTools MCP reconfigured with `--isolated` in `~/.claude.json`
  so it spawns its own browser profile, no conflict with the user's normal
  Chrome. *Takes effect on next Claude Code session.*
- [x] Repo docs: `CLAUDE.md` written, `README.md` updated to reflect code-first
  workflow.

## Bootstrap — remaining

- [x] **Generate placeholder PNGs.** `scripts/gen-placeholders.ts` writes
  `Project/assets/placeholders/{player,enemy,bullet}.png` via a hand-rolled
  minimal RGBA PNG encoder (no deps). Player 32×32 cyan, Enemy 48×24 red,
  Bullet 8×8 yellow.
- [x] **Register placeholder resources** in `game.json` via MCP `add_resource`
  (`player`, `enemy`, `bullet`).
- [x] **Add Sprite objects** (`Player`, `Enemy`, `Bullet`) to the Main scene via
  MCP `add_object`, each referencing its placeholder resource.
- [x] **Replace heartbeat with visible player.** `game-src/main.ts` spawns a
  `Player` at the scene centre on first frame and moves it with WASD/arrows
  (240 px/s, normalised diagonals, frame-rate-independent via
  `getElapsedTime()`). Build + export + serve are all clean; smoke-tested
  with curl (GDevelop runtime scripts + canvas div present, all three PNGs
  bundled into `dist/`).
- [x] **Pin preview port.** `package.json` `preview` script now uses
  `serve ./dist -l 3000`.
- [ ] **Verify visible output in browser.** Still blocked on chrome-devtools
  MCP not surfacing in this Claude Code session. Needs a full restart of
  Claude Code, then: `pnpm build`, `pnpm preview` in background,
  `mcp__chrome-devtools__navigate_page` → `http://localhost:3000`,
  `list_console_messages` for `[game] spawned Player at 400,300` and no
  errors, `take_screenshot` to confirm cyan player, red enemy on the right,
  and yellow bullets when Space is held while pressing arrow / WASD.

## Level 1 mocked gameplay — landed

- [x] **Portrait resolution.** `windowWidth=540`, `windowHeight=1170`,
  `orientation="portrait"`. `adaptWidth` scaling means the game fits to
  browser width and the canvas grows tall on phones.
- [x] **New placeholders.** `cannon.png` (16×56 dark vertical bar),
  `enemyball.png` (12×12 dark dot). `gen-placeholders.ts` regenerates all
  five PNGs deterministically.
- [x] **New scene objects.** `Cannon` and `EnemyBall` Sprite objects registered
  in `Project/game.json` referencing their resources. `Player` object kept
  around but unused — fine for placeholder phase, can drop later.
- [x] **Cannon module** (`game-src/cannon.ts`). Spawns the cannon at
  `(w/2, h-80)`. Aim from cursor X clamped to ±15° of straight up
  (200 px from cannon = full deflection). `fire()` emits a Bullet from
  the muzzle along the aim vector at 720 px/s.
- [x] **Enemy wave system** (`game-src/enemy.ts`). Alternates spawning ships
  from the left (`x=-60`) and right (`x=w+60`) edge at `y=360`, drifts
  them at 220 px/s to their stop position (`x=110` or `x=w-110`), then
  switches each to a fighting state where it fires an EnemyBall at the
  cannon every 2 s. After a ship sinks, a 1-s gap then the next spawns
  from the opposite side. **Three ships** = level complete for now.
- [x] **Projectile pool** (`game-src/projectiles.ts`). Generalised pool that
  handles both `Bullet` and `EnemyBall` — velocity on object variables
  `vx`/`vy`, cull when past `±OFFSCREEN_PAD`.
- [x] **Collisions** (`game-src/collisions.ts`).
  - Bullet ↔ Enemy → 1 damage to ship's `hp`; bullet consumed.
  - Bullet ↔ EnemyBall → both destroyed (parry).
  - EnemyBall ↔ Cannon → 1 damage to player HP; ball destroyed.
- [x] **Game state** (`game-src/state.ts`). Player HP starts at 5; logs
  transitions; `markWon`/`damagePlayer` flip the `gameState` scene
  variable so subsequent frames freeze game logic.
- [x] **Orchestration** (`game-src/main.ts`). Reads input, drives cannon,
  ticks enemy waves, updates projectiles, resolves collisions, checks
  level-complete every frame.
- [x] **Background — castle silhouette + sea band** (`game-src/background.ts`,
  `castle.png` 96×220 with crenellation pattern at the top,
  `sea.png` 540×270). Castle centred at the top (z=-10), sea band along
  the bottom (z=-20) so gameplay sits in front. Statically positioned
  for now — design doc calls for a slow parallax drift; TODO note left
  in the module.
- [x] **Programmatic placeholder art.** `scripts/gen-placeholders.ts`
  refactored to support per-pixel functions. Ship is now an 80×40 hull
  silhouette with mast + deck + tapered hull. Cannon is 28×72 with
  barrel + collar + base. Bullet (player's black shot) and EnemyBall
  are 14×14 black circles (enemy ball has a red rim to read as hostile
  at a glance). Target is a 20×20 red/white concentric bullseye.
- [x] **Weak-point hit zone** (`game-src/enemy.ts`). Each ship spawns with
  a unique `shipId` (scene-variable counter), and a `Target` sprite
  that stores the same id. `findTargetForShip` / `findShipForTarget`
  link them across frames without relying on pointer identity. Per
  frame, the target is glued to its parent ship's deck position. When
  the ship sinks, its target is despawned.
- [x] **Ships stop near the middle.** Stop position is now `w/2 ±
      STOP_OFFSET_FROM_CENTER` instead of near the edges, so the player
  always shoots inward into the middle of the screen.
- [x] **Collisions go through Target only.** `Bullet ↔ Target` deals 1
  damage to the parent ship; `Bullet ↔ Enemy` (body) intentionally
  does NOT count. Parry (`Bullet ↔ EnemyBall`) and
  `EnemyBall ↔ Cannon` (player damage) unchanged. Direct-hit /
  off-target partial damage from the design doc is deferred.
- [x] **Portrait reframe to 9:19 @ 800 tall.** Window 380×800.
  `adaptWidth` keeps the canvas scaled to browser width.
- [x] **Centred player + dead zones.** Player ship sprite (60×80 brown
  deck + railings) and cannon now sit at the upper-middle of the
  screen (y ≈ 42% of height). Two dashed dead-zone markers at
  x=56 and x=324 mark the playfield boundary. Ships spawn off-screen,
  sail through their dead zone (state=0, no fire), then stop just
  inside the playfield (state=1, fires). Cannon aims **freely** at
  the cursor — the design-doc 30° clamp doesn't cover enemies on
  both sides simultaneously, so we treat that constraint as
  ambiguous until clarified.

## Open design questions

- [x] **Layout overhaul to match the GDD Visual Mockups
  (2026-05-19).** The earlier "player in the middle, enemies on
  flanks" interpretation came from the dead-zone *diagram*, not the
  visual mockups. Corrected:
  - Cannon is the **big foreground element at the bottom** of the
  screen (120×200 sprite with carriage + wheels + barrel).
  Anchored at the screen bottom with a 10-px margin.
  - Player views the game from "behind the cannon" (no separate
  deck sprite needed — the cannon's carriage IS the player's
  presence on screen).
  - **±15° aim** from vertical, per the mockups' arrows. Cursor X
  relative to the cannon centre maps to the swing angle.
  - **Enemies at the top** (y=180 band) — they sail in from L/R,
  through the dead-zone strips, into the playfield.
  - **Castle silhouette** at the top of the sky band (y=30),
  peeking above the sea horizon at y=130.
  - **Sea** fills from y=130 to the bottom; the cannon sits in
  front of the sea band.
- [ ] **Cannonball arc trajectory.** Mockup 3 ("Ball Trajectory")
  shows the ball arcing in a parabola from the cannon up to the
  enemy. Current bullets travel in a straight line. Add a gravity
  term so projectiles fall back down — needed before the visuals
  match the doc and the design's 2.25 s hit time spec lands.

## User-provided WebP art wired in (2026-05-19)

- Copied `public/images/art/*.webp` into `Project/assets/art/` (the
  WebPs in `public/` remain the canonical source — `Project/assets/art/`
  is the gdexport-friendly copy).
- `scripts/sync-art-assets.ts` is the idempotent script that updates
  `game-current.json` resources + sprite objects. Re-run after
  dropping new art in.
- Resources re-pointed:
    - `cannon`  → `assets/art/cannon.webp`  (106×178)
    - `enemy`   → `assets/art/ship1.webp`   (221×181)
    - `bullet`  → `assets/art/cannonball-black.webp` (103×104)
    - `enemyball` → same `cannonball-black.webp` (both are "black shots")
- New sprite objects: `Island` (parallax silhouette on the horizon,
  z=-15), `Railing` (rendered IN FRONT of the cannon at z=10).
- New resource `cannonball-ui` (128×70) added but not yet placed —
  reserved for the ammo HUD.
- Code switched to runtime `getWidth()/getHeight()` for cannon,
  railing, island, enemy ship — so swapping the art for different
  sizes won't break positioning. `projectiles.ts` rescales bullets to
  28 px using `setScale`, since the source art is 103×104.

## Followup ideas now that art is in

- Ammo HUD: spawn `cannonball-ui` near a corner with 4 ammo dots that
  shrink/grey-out as the player fires; re-fill on reload.
- Tile sets: `public/images/art/tileset.png` (and `.webp`) are sitting
  there unused — likely for the level-2 fortress later.
- Castle silhouette is currently hidden behind the new island parallax
  (object still exists in game.json, just not spawned by
  `background.ts`). Re-introduce if a more distant landmark is wanted.

## Visible-output verification

- [ ] **Chrome DevTools MCP.** Still not surfaced in this Claude Code session
  (same blocker as the bootstrap-remaining note). User confirmed the
  GDevelop IDE preview launches the game ("ok seems to run"). To unblock
  automated visual checks: restart Claude Code; the `--isolated` config in
  `~/.claude.json` will then be loaded and `mcp__chrome-devtools__*` tools
  will be available.

## Genre-neutral scaffold

Build before locking the genre — works for either ship-shooter or tower-climb:

- [x] **Shared GDJS typings** (`game-src/gdjs.d.ts`): ambient declarations for
  `GdjsRuntimeScene`, `GdjsRuntimeObject`, `gdjs.RuntimeObject` etc., so
  every module sees them without per-file re-declaration.
- [x] **Input abstraction** (`game-src/input.ts`): `readInput(scene)` returns
  `{ axes: {x, y}, fire, firePressed }`. Edge-triggered "firePressed"
  tracks previous frame via scene variable `__inputPrevBits`.
- [x] **Entity registry** (`game-src/entities.ts`): `ObjectName` const,
  `spawn`, `all`, `firstOrNull` wrappers around `createObject` /
  `getObjects` — single place to fix typos and log nulls.
- [x] **Projectile pool** (`game-src/bullets.ts`): `fire(scene, x, y, dx, dy)`
  spawns a Bullet with `vx`/`vy` stashed on its object variables.
  `update(scene, dt)` moves each bullet and culls off-screen + pad.
- [x] **Hit detection** (`game-src/collisions.ts`): `resolveBulletEnemyHits`
  wraps `gdjs.RuntimeObject.collisionTest`, deletes both on hit, returns
  kill count. Score increments on `runtimeScene.getVariables().get("score")`.
- [x] **Fire button + smoke target.** Space fires a Bullet rightward from the
  Player. A single stationary Enemy spawns on first frame at `(w-80, h/2)`
  as a shooting-gallery target — **replace once spawn patterns land**.
- [ ] Fixed-timestep update loop with `getElapsedTime()` accumulator. Current
  code uses raw `dt` which is fine for now but can spike on tab-switch.

## Game-specific (after design lock)

- [ ] Tower as a tiled vertical structure (scrolling background or tilemap).
- [ ] Pirate ship spawn patterns / waves.
- [ ] Camera follow / auto-scroll behavior.
- [ ] Win condition (top reached) + lose condition (hp = 0 or fell off).
- [ ] HUD: score, lives, height progress.
- [ ] SFX hooks where artist audio drops in.

---

## Reference

Build & verify cycle:

```
pnpm build:game     # bundle game-src/ → inject into game.json
pnpm build:web      # gdexport HTML5 → dist/
pnpm build          # both, chained
pnpm preview        # serve dist/ at :3000
pnpm typecheck      # tsc --noEmit across all TS
```

`scripts/build-game.ts` is the only thing that should ever touch the
`events` array of the Main scene. Hand-editing `Project/game.json` events
will be silently overwritten on next `build:game`. See `CLAUDE.md` for the
full set of hard rules.
