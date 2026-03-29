# Wess

Browser chess application — zero runtime dependencies.

## Commands

```bash
npm run start          # Vite dev server on 127.0.0.1:4173
npm run server         # Multiplayer server on port 3000
npm run dev            # Both servers concurrently
npm run build          # Production build to dist/
npm run test           # All tests (unit + browser)
npm run test:unit      # Vitest unit tests
npm run test:browser   # Playwright browser tests
npm run typecheck      # tsc --noEmit
```

## Architecture

Three-layer structure: domain (pure logic) → app (orchestration) → ui (rendering).

- `src/domain/chess-game.ts` — Chess engine: move generation, validation, FEN, SAN notation. Exports `ChessGame` class. No browser APIs.
- `src/domain/session.ts` — Game timeline, clock management, PGN import/export. Depends on chess-game.
- `src/domain/tactics.ts` — Tactical pattern detection (knight forks).
- `src/app/controller.ts` — Main controller. Wires domain, UI, multiplayer, and DOM together. Single-module design, not component-based.
- `src/app/multiplayer.ts` — Multiplayer client: REST calls + SSE event stream.
- `src/app/settings.ts` — User preferences (sound, FX intensity, reduced motion).
- `src/app/constants.ts` — Animation timings, storage keys, clock presets, FX profiles.
- `src/ui/animation-controller.ts` — Move arcs, capture fades, check pulses, fork visualizations.
- `src/ui/board-scene.ts` — Board DOM rendering, square layout, piece positioning.
- `src/ui/board-input.ts` — Click, drag-and-drop, and touch input handling.
- `src/ui/audio-controller.ts` — Web Audio API sound synthesis.
- `src/ui/piece-set.ts` — SVG piece rendering.
- `src/ui/board-helpers.ts` — Coordinate projection, orientation helpers, ARIA labels.
- `server.js` — Vanilla Node.js HTTP server for multiplayer. In-memory rooms, token auth, SSE broadcast.
- `index.html` — Single HTML shell with all UI structure.
- `src/styles.css` — All styles in one file.

## Conventions

- TypeScript strict mode. Target ES2022, module ESNext with Bundler resolution.
- Domain layer must stay free of browser/DOM APIs — keeps it unit-testable.
- Board uses 0-indexed `[row][col]` internally; row 0 = rank 8 (black's back rank).
- Moves use algebraic square names (`e2`, `e4`) at the public API boundary.
- `ChessGame.snapshot()` returns an immutable `PublicSnapshot` — internal `GameState` is never exposed.
- Session tracks moves as `TimelineMove` objects (`{from, to, promotion?}`) for replay/undo.
- Clock snapshots are stored per-ply for timeline navigation.
- Multiplayer routes live under `/game/:id`; Vite proxies `/api` to the Node server on port 3000.
- No external runtime dependencies. Dev dependencies: vite, vitest, playwright, typescript.

## Testing

- Unit tests in `tests/unit/` — run with vitest against domain layer.
- Browser tests in `tests/browser/` — Playwright, auto-starts vite dev server.
- Playwright config: sequential (not parallel), headless, traces on failure.
