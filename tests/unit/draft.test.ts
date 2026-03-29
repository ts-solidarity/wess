import { expect, test } from "vitest";
import { validateDraft, classicDraft, draftsToFen, DRAFT_BUDGET, PIECE_COSTS } from "../../src/domain/draft";
import { ChessGame } from "../../src/domain/chess-game";

test("classic draft is valid for both colors", () => {
  const white = validateDraft(classicDraft("w"), "w");
  const black = validateDraft(classicDraft("b"), "b");

  expect(white.valid).toBe(true);
  expect(white.pointsUsed).toBe(39);
  expect(white.kingCount).toBe(1);
  expect(white.pawnCount).toBe(8);

  expect(black.valid).toBe(true);
  expect(black.pointsUsed).toBe(39);
});

test("classic draft produces a valid FEN that the engine accepts", () => {
  const fen = draftsToFen(classicDraft("w"), classicDraft("b"));
  const game = new ChessGame(fen);
  const snap = game.snapshot();

  expect(snap.turn).toBe("w");
  expect(snap.result.over).toBe(false);
  expect(game.getAllLegalMoves().length).toBeGreaterThan(0);
});

test("classic draft FEN includes full castling rights", () => {
  const fen = draftsToFen(classicDraft("w"), classicDraft("b"));
  expect(fen).toContain(" KQkq ");
});

test("rejects draft with no king", () => {
  const placements = classicDraft("w").filter((p) => p.type !== "k");
  const result = validateDraft(placements, "w");

  expect(result.valid).toBe(false);
  expect(result.errors.some((e) => /king/i.test(e))).toBe(true);
});

test("rejects draft with fewer than 4 pawns", () => {
  const placements = classicDraft("w").filter((p) => p.type !== "p");
  placements.push({ type: "p", row: 6, col: 0 });
  placements.push({ type: "p", row: 6, col: 1 });

  const result = validateDraft(placements, "w");
  expect(result.valid).toBe(false);
  expect(result.errors.some((e) => /pawn/i.test(e))).toBe(true);
});

test("rejects draft over budget", () => {
  const placements = [
    { type: "k", row: 7, col: 4 },
    { type: "p", row: 6, col: 0 },
    { type: "p", row: 6, col: 1 },
    { type: "p", row: 6, col: 2 },
    { type: "p", row: 6, col: 3 },
    { type: "q", row: 7, col: 0 },
    { type: "q", row: 7, col: 1 },
    { type: "q", row: 7, col: 2 },
    { type: "q", row: 7, col: 3 },
    { type: "q", row: 7, col: 5 },
  ];

  const result = validateDraft(placements, "w");
  expect(result.pointsUsed).toBe(49);
  expect(result.valid).toBe(false);
  expect(result.errors.some((e) => /budget/i.test(e))).toBe(true);
});

test("rejects placement on wrong rows", () => {
  const placements = [
    { type: "k", row: 7, col: 4 },
    { type: "p", row: 6, col: 0 },
    { type: "p", row: 6, col: 1 },
    { type: "p", row: 6, col: 2 },
    { type: "p", row: 6, col: 3 },
    { type: "n", row: 3, col: 0 },
  ];

  const result = validateDraft(placements, "w");
  expect(result.valid).toBe(false);
  expect(result.errors.some((e) => /row/i.test(e))).toBe(true);
});

test("castling rights are absent when king is not on e-file", () => {
  const white = classicDraft("w").map((p) =>
    p.type === "k" ? { ...p, col: 3 } : p.type === "q" ? { ...p, col: 4 } : p,
  );
  const fen = draftsToFen(white, classicDraft("b"));
  expect(fen).toMatch(/ kq /);
});

test("new pieces have correct costs", () => {
  expect(PIECE_COSTS.s).toBe(2);
  expect(PIECE_COSTS.d).toBe(3);
  expect(PIECE_COSTS.l).toBe(4);
  expect(PIECE_COSTS.v).toBe(6);
  expect(PIECE_COSTS.c).toBe(8);
  expect(PIECE_COSTS.a).toBe(7);
});

test("budget allows upgrading beyond classic army", () => {
  expect(DRAFT_BUDGET).toBeGreaterThan(39);
  expect(DRAFT_BUDGET).toBe(42);
});
