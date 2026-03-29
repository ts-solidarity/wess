import type { PieceColor, Board, Move, PublicSnapshot } from "./chess-game";
import { KNIGHT_JUMPS, PIECE_DEFINITIONS, getDefinition } from "./piece-movement";

const FILES: string[] = ["a", "b", "c", "d", "e", "f", "g", "h"];

export interface ForkResult {
  forkingSquare: string;
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

function hasLeapRules(pieceType: string): boolean {
  const def = PIECE_DEFINITIONS[pieceType];
  return def ? def.rules.some((r) => r.leap) : false;
}

export function detectKnightKingQueenFork(record: Move | null, afterState: PublicSnapshot | null): ForkResult | null {
  if (!record || !hasLeapRules(record.piece) || !Array.isArray(afterState?.board)) {
    return null;
  }

  const forkingSquare = record.to;
  const forkingCoords = squareToCoords(forkingSquare);
  if (!forkingCoords) {
    return null;
  }

  const forkingPiece = afterState.board[forkingCoords.row]?.[forkingCoords.col];
  if (!forkingPiece || !hasLeapRules(forkingPiece.type) || forkingPiece.color !== record.color) {
    return null;
  }

  const defenderColor = getDefenderColor(record, afterState);
  let kingSquare = null;
  const queenSquares = [];

  for (const [rowOffset, colOffset] of KNIGHT_JUMPS) {
    const targetRow = forkingCoords.row + rowOffset;
    const targetCol = forkingCoords.col + colOffset;
    if (!isInBounds(targetRow, targetCol)) {
      continue;
    }

    const targetPiece = afterState.board[targetRow]?.[targetCol];
    if (!targetPiece || targetPiece.color !== defenderColor) {
      continue;
    }

    if (getDefinition(targetPiece.type).royal) {
      kingSquare = coordsToSquare(targetRow, targetCol);
      continue;
    }

    if (getDefinition(targetPiece.type).highValueTarget) {
      queenSquares.push(coordsToSquare(targetRow, targetCol));
    }
  }

  if (!kingSquare || queenSquares.length === 0) {
    return null;
  }

  return {
    forkingSquare,
    kingSquare,
    queenSquares,
  };
}
