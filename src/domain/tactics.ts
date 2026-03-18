import type { PieceColor, Board, Move, PublicSnapshot } from "./chess-game";

const FILES: string[] = ["a", "b", "c", "d", "e", "f", "g", "h"];
const KNIGHT_ATTACK_OFFSETS: number[][] = [
  [-2, -1],
  [-2, 1],
  [-1, -2],
  [-1, 2],
  [1, -2],
  [1, 2],
  [2, -1],
  [2, 1],
];

export interface ForkResult {
  knightSquare: string;
  kingSquare: string;
  queenSquares: string[];
}

function squareToCoords(square: string): { row: number; col: number } | null {
  if (typeof square !== "string" || !/^[a-h][1-8]$/i.test(square)) {
    return null;
  }

  const file = square[0].toLowerCase();
  const rank = Number(square[1]);
  return {
    row: 8 - rank,
    col: FILES.indexOf(file),
  };
}

function coordsToSquare(row: number, col: number): string {
  return `${FILES[col]}${8 - row}`;
}

function isInBounds(row: number, col: number): boolean {
  return row >= 0 && row < 8 && col >= 0 && col < 8;
}

function getDefenderColor(record: Move, afterState: PublicSnapshot | null): PieceColor {
  if (afterState?.turn === "w" || afterState?.turn === "b") {
    return afterState.turn;
  }

  return record?.color === "w" ? "b" : "w";
}

export function detectKnightKingQueenFork(record: Move | null, afterState: PublicSnapshot | null): ForkResult | null {
  if (!record || record.piece !== "n" || !Array.isArray(afterState?.board)) {
    return null;
  }

  const knightSquare = record.to;
  const knightCoords = squareToCoords(knightSquare);
  if (!knightCoords) {
    return null;
  }

  const knight = afterState.board[knightCoords.row]?.[knightCoords.col];
  if (!knight || knight.type !== "n" || knight.color !== record.color) {
    return null;
  }

  const defenderColor = getDefenderColor(record, afterState);
  let kingSquare = null;
  const queenSquares = [];

  for (const [rowOffset, colOffset] of KNIGHT_ATTACK_OFFSETS) {
    const targetRow = knightCoords.row + rowOffset;
    const targetCol = knightCoords.col + colOffset;
    if (!isInBounds(targetRow, targetCol)) {
      continue;
    }

    const targetPiece = afterState.board[targetRow]?.[targetCol];
    if (!targetPiece || targetPiece.color !== defenderColor) {
      continue;
    }

    if (targetPiece.type === "k") {
      kingSquare = coordsToSquare(targetRow, targetCol);
      continue;
    }

    if (targetPiece.type === "q") {
      queenSquares.push(coordsToSquare(targetRow, targetCol));
    }
  }

  if (!kingSquare || queenSquares.length === 0) {
    return null;
  }

  return {
    knightSquare,
    kingSquare,
    queenSquares,
  };
}
