import { ChessGame } from "./chess-game";
import type { PieceColor, Move, Board } from "./chess-game";
import { PIECE_DEFINITIONS } from "./piece-movement";
import { PIECE_COSTS } from "./draft";

export interface AIConfig {
  depth: number;
  color: PieceColor;
}

// Piece-square tables (bonus for piece positioning, 0-indexed from white's perspective)
// Values in centipawns (1 = 0.01 pawn)
const CENTER_BONUS = [
  [0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 5, 8, 8, 5, 0, 0],
  [0, 2, 8, 14, 14, 8, 2, 0],
  [0, 2, 8, 14, 14, 8, 2, 0],
  [0, 0, 5, 8, 8, 5, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0],
];

const PAWN_ADVANCE_BONUS = [
  [0, 0, 0, 0, 0, 0, 0, 0],
  [50, 50, 50, 50, 50, 50, 50, 50],
  [10, 10, 15, 25, 25, 15, 10, 10],
  [5, 5, 10, 20, 20, 10, 5, 5],
  [0, 0, 5, 15, 15, 5, 0, 0],
  [2, 3, 0, 5, 5, 0, 3, 2],
  [0, 0, 0, -5, -5, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0],
];

function materialValue(type: string): number {
  return (PIECE_COSTS[type] ?? 0) * 100; // Convert to centipawns
}

function evaluateBoard(board: Board): number {
  let score = 0;

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = board[row][col];
      if (!piece) continue;

      const sign = piece.color === "w" ? 1 : -1;
      const def = PIECE_DEFINITIONS[piece.type];

      // Material
      score += sign * materialValue(piece.type);

      // Positional bonus
      const evalRow = piece.color === "w" ? row : 7 - row;
      if (def?.promotable) {
        // Pawn advance bonus
        score += sign * PAWN_ADVANCE_BONUS[evalRow][col];
      } else if (!def?.royal) {
        // Non-king, non-pawn: center control bonus
        score += sign * CENTER_BONUS[row][col];
      }
    }
  }

  return score;
}

function evaluatePosition(game: ChessGame): number {
  const state = game.snapshot();

  if (state.result.over) {
    if (state.result.reason === "checkmate") {
      // The side that just moved won (it's opponent's turn and they're mated)
      return state.turn === "w" ? -90000 : 90000;
    }
    return 0; // Draw
  }

  let score = evaluateBoard(state.board);

  // Mobility bonus (small)
  const whiteMoves = game.getAllLegalMoves("w").length;
  const blackMoves = game.getAllLegalMoves("b").length;
  score += (whiteMoves - blackMoves) * 3;

  // Check bonus
  if (state.check) {
    score += state.turn === "w" ? -15 : 15;
  }

  return score;
}

function orderMoves(moves: Move[]): Move[] {
  return moves.sort((a, b) => {
    // Captures first (higher value captured = higher priority)
    const aCapVal = a.capture ? materialValue(a.capturedPiece ?? "p") : 0;
    const bCapVal = b.capture ? materialValue(b.capturedPiece ?? "p") : 0;
    if (aCapVal !== bCapVal) return bCapVal - aCapVal;
    // Promotions
    if (a.promotionRequired && !b.promotionRequired) return -1;
    if (!a.promotionRequired && b.promotionRequired) return 1;
    return 0;
  });
}

function minimax(
  game: ChessGame,
  depth: number,
  alpha: number,
  beta: number,
  maximizing: boolean,
): number {
  if (depth === 0) {
    return evaluatePosition(game);
  }

  const state = game.snapshot();
  if (state.result.over) {
    return evaluatePosition(game);
  }

  const moves = orderMoves(game.getAllLegalMoves());

  if (maximizing) {
    let best = -Infinity;
    for (const move of moves) {
      const child = new ChessGame(game.toFen());
      child.makeMove(move.from, move.to, move.promotion ?? "q");
      const val = minimax(child, depth - 1, alpha, beta, false);
      best = Math.max(best, val);
      alpha = Math.max(alpha, val);
      if (beta <= alpha) break;
    }
    return best;
  } else {
    let best = Infinity;
    for (const move of moves) {
      const child = new ChessGame(game.toFen());
      child.makeMove(move.from, move.to, move.promotion ?? "q");
      const val = minimax(child, depth - 1, alpha, beta, true);
      best = Math.min(best, val);
      beta = Math.min(beta, val);
      if (beta <= alpha) break;
    }
    return best;
  }
}

export function findBestMove(
  game: ChessGame,
  config: AIConfig,
): { from: string; to: string; promotion?: string } | null {
  const state = game.snapshot();
  if (state.result.over || state.turn !== config.color) {
    return null;
  }

  const moves = orderMoves(game.getAllLegalMoves());
  if (moves.length === 0) return null;

  // Easy mode: mostly random with slight preference for captures
  if (config.depth <= 1) {
    const captures = moves.filter((m) => m.capture);
    const pool = captures.length > 0 && Math.random() < 0.4 ? captures : moves;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    return { from: pick.from, to: pick.to, promotion: pick.promotion };
  }

  const maximizing = config.color === "w";
  let bestMove = moves[0];
  let bestScore = maximizing ? -Infinity : Infinity;

  for (const move of moves) {
    const child = new ChessGame(game.toFen());
    child.makeMove(move.from, move.to, move.promotion ?? "q");
    const score = minimax(child, config.depth - 1, -Infinity, Infinity, !maximizing);

    if (maximizing ? score > bestScore : score < bestScore) {
      bestScore = score;
      bestMove = move;
    }
  }

  // Add slight randomness to medium difficulty
  if (config.depth === 2 && Math.random() < 0.15) {
    const pick = moves[Math.floor(Math.random() * Math.min(3, moves.length))];
    return { from: pick.from, to: pick.to, promotion: pick.promotion };
  }

  return { from: bestMove.from, to: bestMove.to, promotion: bestMove.promotion };
}
