import { expect, test } from "vitest";

import {
  buildClockSnapshotsForMoves,
  buildPgnText,
  createEmptySession,
  normalizeStoredSession,
} from "../../src/domain/session";

const CLASSIC_START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const BLACK_TO_MOVE_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1";
const BLACK_TO_MOVE_FULLMOVE_FIVE_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 5";

test("PGN export uses ellipsis when the initial position is black to move", () => {
  const pgn = buildPgnText({
    moves: [{ from: "e7", to: "e5" }],
    initialFen: BLACK_TO_MOVE_FEN,
    startFen: CLASSIC_START_FEN,
  });

  expect(pgn).toContain("1... e5 *");
});

test("PGN export respects a non-default fullmove number", () => {
  const pgn = buildPgnText({
    moves: [
      { from: "e7", to: "e5" },
      { from: "g1", to: "f3" },
    ],
    initialFen: BLACK_TO_MOVE_FULLMOVE_FIVE_FEN,
    startFen: CLASSIC_START_FEN,
  });

  expect(pgn).toContain("5... e5 6. Nf3 *");
});

test("new sessions inherit the active clock side from the initial position", () => {
  const session = createEmptySession(BLACK_TO_MOVE_FEN);

  expect(session.clockSnapshots[0]?.activeColor).toBe("b");
});

test("clock snapshot rebuilding seeds the initial active side from the initial position", () => {
  const snapshots = buildClockSnapshotsForMoves([], BLACK_TO_MOVE_FEN, CLASSIC_START_FEN);

  expect(snapshots[0]?.activeColor).toBe("b");
});

test("stored session normalization corrects the initial active side without resetting clock values", () => {
  const normalized = normalizeStoredSession({
    initialFen: BLACK_TO_MOVE_FEN,
    moves: [],
    currentPly: 0,
    clockInitialMs: 300000,
    clockSnapshots: [{
      whiteMs: 123456,
      blackMs: 234567,
      activeColor: "w",
    }],
  }, {
    startFen: CLASSIC_START_FEN,
  });

  expect(normalized?.clockSnapshots[0]).toEqual({
    whiteMs: 123456,
    blackMs: 234567,
    activeColor: "b",
  });
});
