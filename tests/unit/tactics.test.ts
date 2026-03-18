import { expect, test } from "vitest";

import { ChessGame } from "../../src/domain/chess-game";
import { detectKnightKingQueenFork } from "../../src/domain/tactics";

function playMove(game: ChessGame, from: string, to: string, promotion?: string) {
  const record = game.makeMove(from, to, promotion);
  expect(record).toBeTruthy();
  return {
    record,
    state: game.snapshot(),
  };
}

test("detects a knight fork that attacks the enemy king and queen", () => {
  const game = new ChessGame("4k3/8/8/1N1q4/8/8/8/4K3 w - - 0 1");
  const { record, state } = playMove(game, "b5", "c7");

  expect(detectKnightKingQueenFork(record, state)).toEqual({
    knightSquare: "c7",
    kingSquare: "e8",
    queenSquares: ["d5"],
  });
});

test("returns null for a knight check that does not also attack a queen", () => {
  const game = new ChessGame("r3k3/8/8/1N6/8/8/8/4K3 w - - 0 1");
  const { record, state } = playMove(game, "b5", "c7");

  expect(detectKnightKingQueenFork(record, state)).toBeNull();
});

test("returns null when the move attacks a queen but not the enemy king", () => {
  const game = new ChessGame("7k/8/8/1N1q4/8/8/8/4K3 w - - 0 1");
  const { record, state } = playMove(game, "b5", "c7");

  expect(detectKnightKingQueenFork(record, state)).toBeNull();
});

test("returns all attacked queens in deterministic order", () => {
  const game = new ChessGame("q3k3/8/8/1N1q4/8/8/8/4K3 w - - 0 1");
  const { record, state } = playMove(game, "b5", "c7");

  expect(detectKnightKingQueenFork(record, state)).toEqual({
    knightSquare: "c7",
    kingSquare: "e8",
    queenSquares: ["a8", "d5"],
  });
});

test("returns null if the checking move captured the queen and no queen remains attacked", () => {
  const game = new ChessGame("4k3/2q5/8/1N6/8/8/8/4K3 w - - 0 1");
  const { record, state } = playMove(game, "b5", "c7");

  expect(detectKnightKingQueenFork(record, state)).toBeNull();
});
