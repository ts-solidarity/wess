import { expect, test } from "vitest";

import { ChessGame } from "../../src/domain/chess-game";

const CLASSIC_START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

test("initial position exposes 20 legal moves", () => {
  const game = new ChessGame();
  expect(game.getAllLegalMoves().length).toBe(20);
});

test("fool's mate ends in checkmate for black", () => {
  const game = new ChessGame(CLASSIC_START_FEN);

  game.makeMove("f2", "f3");
  game.makeMove("e7", "e5");
  game.makeMove("g2", "g4");
  const move = game.makeMove("d8", "h4");

  expect(move).toBeTruthy();
  expect(game.snapshot().result.over).toBe(true);
  expect(game.snapshot().result.reason).toBe("checkmate");
  expect(game.snapshot().result.winner).toBe("b");
});

test("castling repositions both king and rook", () => {
  const game = new ChessGame("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
  const move = game.makeMove("e1", "g1");

  expect(move?.isCastling).toBe(true);
  expect(game.getPiece("g1")).toEqual({ type: "k", color: "w" });
  expect(game.getPiece("f1")).toEqual({ type: "r", color: "w" });
  expect(game.getPiece("h1")).toBeNull();
});

test("castling is disallowed through check", () => {
  const game = new ChessGame("r3k2r/8/8/8/2b5/8/8/R3K2R w KQkq - 0 1");
  const kingMoves = game.getLegalMoves("e1");

  expect(kingMoves.some((move) => move.to === "g1")).toBe(false);
});

test("en passant capture is available on the immediate reply", () => {
  const game = new ChessGame("4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1");
  const pawnMoves = game.getLegalMoves("e5");

  expect(pawnMoves.some((move) => move.to === "d6" && move.isEnPassant)).toBe(true);

  game.makeMove("e5", "d6");
  expect(game.getPiece("d6")).toEqual({ type: "p", color: "w" });
  expect(game.getPiece("d5")).toBeNull();
});

test("promotion defaults to a queen and can be customized", () => {
  const queenPromotion = new ChessGame("k7/6P1/8/8/8/8/8/4K3 w - - 0 1");
  queenPromotion.makeMove("g7", "g8");
  expect(queenPromotion.getPiece("g8")).toEqual({ type: "q", color: "w" });

  const knightPromotion = new ChessGame("k7/6P1/8/8/8/8/8/4K3 w - - 0 1");
  knightPromotion.makeMove("g7", "g8", "n");
  expect(knightPromotion.getPiece("g8")).toEqual({ type: "n", color: "w" });
});

test("stalemate is detected from a loaded position", () => {
  const game = new ChessGame("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1");

  expect(game.snapshot().result.over).toBe(true);
  expect(game.snapshot().result.reason).toBe("stalemate");
});

test("threefold repetition ends the game as a draw", () => {
  const game = new ChessGame(CLASSIC_START_FEN);

  game.makeMove("g1", "f3");
  game.makeMove("g8", "f6");
  game.makeMove("f3", "g1");
  game.makeMove("f6", "g8");
  game.makeMove("g1", "f3");
  game.makeMove("g8", "f6");
  game.makeMove("f3", "g1");
  game.makeMove("f6", "g8");

  expect(game.snapshot().result.over).toBe(true);
  expect(game.snapshot().result.reason).toBe("threefold repetition");
});

test("move notation uses SAN-style output", () => {
  const opening = new ChessGame(CLASSIC_START_FEN);
  const e4 = opening.makeMove("e2", "e4");
  const e5 = opening.makeMove("e7", "e5");
  const nf3 = opening.makeMove("g1", "f3");

  expect(e4?.notation).toBe("e4");
  expect(e5?.notation).toBe("e5");
  expect(nf3?.notation).toBe("Nf3");

  const mateGame = new ChessGame(CLASSIC_START_FEN);
  mateGame.makeMove("f2", "f3");
  mateGame.makeMove("e7", "e5");
  mateGame.makeMove("g2", "g4");
  const mate = mateGame.makeMove("d8", "h4");

  expect(mate?.notation).toBe("Qh4#");
});
