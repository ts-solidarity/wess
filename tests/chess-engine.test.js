import test from "node:test";
import assert from "node:assert/strict";

import { ChessGame } from "../src/chess-engine.js";

test("initial position exposes 20 legal moves", () => {
  const game = new ChessGame();
  assert.equal(game.getAllLegalMoves().length, 20);
});

test("fool's mate ends in checkmate for black", () => {
  const game = new ChessGame();

  game.makeMove("f2", "f3");
  game.makeMove("e7", "e5");
  game.makeMove("g2", "g4");
  const move = game.makeMove("d8", "h4");

  assert.ok(move);
  assert.equal(game.snapshot().result.over, true);
  assert.equal(game.snapshot().result.reason, "checkmate");
  assert.equal(game.snapshot().result.winner, "b");
});

test("castling repositions both king and rook", () => {
  const game = new ChessGame("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
  const move = game.makeMove("e1", "g1");

  assert.ok(move?.isCastling);
  assert.deepEqual(game.getPiece("g1"), { type: "k", color: "w" });
  assert.deepEqual(game.getPiece("f1"), { type: "r", color: "w" });
  assert.equal(game.getPiece("h1"), null);
});

test("castling is disallowed through check", () => {
  const game = new ChessGame("r3k2r/8/8/8/2b5/8/8/R3K2R w KQkq - 0 1");
  const kingMoves = game.getLegalMoves("e1");

  assert.equal(kingMoves.some((move) => move.to === "g1"), false);
});

test("en passant capture is available on the immediate reply", () => {
  const game = new ChessGame("4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1");
  const pawnMoves = game.getLegalMoves("e5");

  assert.equal(pawnMoves.some((move) => move.to === "d6" && move.isEnPassant), true);

  game.makeMove("e5", "d6");
  assert.deepEqual(game.getPiece("d6"), { type: "p", color: "w" });
  assert.equal(game.getPiece("d5"), null);
});

test("promotion defaults to a queen and can be customized", () => {
  const queenPromotion = new ChessGame("k7/6P1/8/8/8/8/8/4K3 w - - 0 1");
  queenPromotion.makeMove("g7", "g8");
  assert.deepEqual(queenPromotion.getPiece("g8"), { type: "q", color: "w" });

  const knightPromotion = new ChessGame("k7/6P1/8/8/8/8/8/4K3 w - - 0 1");
  knightPromotion.makeMove("g7", "g8", "n");
  assert.deepEqual(knightPromotion.getPiece("g8"), { type: "n", color: "w" });
});

test("stalemate is detected from a loaded position", () => {
  const game = new ChessGame("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1");

  assert.equal(game.snapshot().result.over, true);
  assert.equal(game.snapshot().result.reason, "stalemate");
});

test("threefold repetition ends the game as a draw", () => {
  const game = new ChessGame();

  game.makeMove("g1", "f3");
  game.makeMove("g8", "f6");
  game.makeMove("f3", "g1");
  game.makeMove("f6", "g8");
  game.makeMove("g1", "f3");
  game.makeMove("g8", "f6");
  game.makeMove("f3", "g1");
  game.makeMove("f6", "g8");

  assert.equal(game.snapshot().result.over, true);
  assert.equal(game.snapshot().result.reason, "threefold repetition");
});
