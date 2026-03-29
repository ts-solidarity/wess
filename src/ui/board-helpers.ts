import { PIECE_NAMES } from "../app/constants";
import { coordsToSquare, squareToCoords } from "../domain/chess-game";
import type { PieceColor, PieceType, Piece, Board, PublicSnapshot } from "../domain/chess-game";
import { getDefinition } from "../domain/piece-movement";
export { coordsToSquare, squareToCoords };

export function colorName(color: PieceColor): string {
  return color === "w" ? "White" : "Black";
}

export function findKingSquare(board: Board, color: PieceColor): string | null {
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const piece = board[row][col];
      if (piece && getDefinition(piece.type).royal && piece.color === color) {
        return coordsToSquare(row, col);
      }
    }
  }

  return null;
}

export function describePosition(state: PublicSnapshot): string {
  if (state.result.over) {
    switch (state.result.reason) {
      case "checkmate":
        return `Checkmate. ${colorName(state.result.winner!)} wins.`;
      case "stalemate":
        return "Draw by stalemate.";
      case "insufficient material":
        return "Draw by insufficient material.";
      case "threefold repetition":
        return "Draw by threefold repetition.";
      case "fifty-move rule":
        return "Draw by the fifty-move rule.";
      default:
        return "Game over.";
    }
  }

  if (state.check) {
    return `${colorName(state.turn)} to move. King is in check.`;
  }

  return `${colorName(state.turn)} to move.`;
}

export function getVisualCellForCoords(row: number, col: number, orientation: PieceColor): { row: number; col: number } {
  if (orientation === "w") {
    return { row, col };
  }

  return {
    row: 7 - row,
    col: 7 - col,
  };
}

export function getVisualCellForSquare(square: string, orientation: PieceColor): { row: number; col: number } | null {
  const coords = squareToCoords(square);
  return coords ? getVisualCellForCoords(coords.row, coords.col, orientation) : null;
}

export function getBoardCoordsForVisualCell(visualRow: number, visualCol: number, orientation: PieceColor): { row: number; col: number } {
  if (orientation === "w") {
    return { row: visualRow, col: visualCol };
  }

  return {
    row: 7 - visualRow,
    col: 7 - visualCol,
  };
}

export function buildSquareAria(piece: Piece | null, square: string, state: PublicSnapshot): string {
  const location = `${square[0].toUpperCase()}${square[1]}`;
  if (!piece) {
    return `Empty square ${location}`;
  }

  const turnHint = piece.color === state.turn ? ", selectable" : "";
  return `${colorName(piece.color)} ${PIECE_NAMES[piece.type] ?? piece.type} on ${location}${turnHint}`;
}

export function pieceAriaLabel(piece: { color: PieceColor; type: PieceType; square: string }): string {
  const location = `${piece.square[0].toUpperCase()}${piece.square[1]}`;
  return `${colorName(piece.color)} ${PIECE_NAMES[piece.type] ?? piece.type} on ${location}`;
}
