import type { PieceColor } from "./piece-movement";
import { PIECE_DEFINITIONS, STANDARD_CASTLING } from "./piece-movement";

export interface DraftPlacement {
  type: string;
  row: number;
  col: number;
}

export interface DraftValidation {
  valid: boolean;
  errors: string[];
  pointsUsed: number;
  pointsBudget: number;
  pawnCount: number;
  kingCount: number;
}

export const DRAFT_BUDGET = 42;
export const MIN_PAWNS = 4;

export const PIECE_COSTS: Record<string, number> = {
  p: 1,
  s: 2,
  n: 3,
  b: 3,
  d: 3,
  l: 4,
  r: 5,
  v: 6,
  a: 7,
  c: 8,
  q: 9,
  k: 0,
};

const WHITE_ROWS = [5, 6, 7];
const BLACK_ROWS = [0, 1, 2];

function allowedRows(color: PieceColor): number[] {
  return color === "w" ? WHITE_ROWS : BLACK_ROWS;
}

export function validateDraft(placements: DraftPlacement[], color: PieceColor): DraftValidation {
  const errors: string[] = [];
  const rows = allowedRows(color);

  let pointsUsed = 0;
  let pawnCount = 0;
  let kingCount = 0;
  const occupied = new Set<string>();

  for (const p of placements) {
    if (!(p.type in PIECE_COSTS)) {
      errors.push(`Unknown piece type: ${p.type}`);
      continue;
    }

    if (!rows.includes(p.row)) {
      errors.push(`Piece at row ${p.row} is outside allowed rows`);
    }

    if (p.col < 0 || p.col > 7) {
      errors.push(`Piece at col ${p.col} is out of bounds`);
    }

    const key = `${p.row},${p.col}`;
    if (occupied.has(key)) {
      errors.push(`Duplicate placement at ${key}`);
    }
    occupied.add(key);

    pointsUsed += PIECE_COSTS[p.type];

    if (p.type === "p" || PIECE_DEFINITIONS[p.type]?.promotable) pawnCount++;
    if (PIECE_DEFINITIONS[p.type]?.royal) kingCount++;
  }

  if (kingCount !== 1) {
    errors.push(kingCount === 0 ? "Must place a king" : "Only one king allowed");
  }

  if (pawnCount < MIN_PAWNS) {
    errors.push(`Need at least ${MIN_PAWNS} pawns (have ${pawnCount})`);
  }

  if (pointsUsed > DRAFT_BUDGET) {
    errors.push(`Over budget: ${pointsUsed} / ${DRAFT_BUDGET}`);
  }

  if (placements.length > 24) {
    errors.push("Maximum 24 pieces (3 rows)");
  }

  return {
    valid: errors.length === 0,
    errors,
    pointsUsed,
    pointsBudget: DRAFT_BUDGET,
    pawnCount,
    kingCount,
  };
}

export function classicDraft(color: PieceColor): DraftPlacement[] {
  const backRow = color === "w" ? 7 : 0;
  const pawnRow = color === "w" ? 6 : 1;
  const backRank = ["r", "n", "b", "q", "k", "b", "n", "r"];

  const placements: DraftPlacement[] = [];

  for (let col = 0; col < 8; col++) {
    placements.push({ type: backRank[col], row: backRow, col });
    placements.push({ type: "p", row: pawnRow, col });
  }

  return placements;
}

export function draftsToFen(white: DraftPlacement[], black: DraftPlacement[]): string {
  const board: (string | null)[][] = Array.from({ length: 8 }, () => Array(8).fill(null));

  for (const p of white) {
    board[p.row][p.col] = p.type.toUpperCase();
  }
  for (const p of black) {
    board[p.row][p.col] = p.type;
  }

  // Board placement
  const ranks = board.map((row) => {
    let rank = "";
    let empty = 0;
    for (const cell of row) {
      if (cell === null) {
        empty++;
      } else {
        if (empty > 0) { rank += empty; empty = 0; }
        rank += cell;
      }
    }
    if (empty > 0) rank += empty;
    return rank;
  });
  const placement = ranks.join("/");

  // Castling rights — only if king on e-file back rank and rooks on a/h
  const castling = STANDARD_CASTLING;
  let castlingStr = "";

  const wKing = white.find((p) => PIECE_DEFINITIONS[p.type]?.royal);
  if (wKing && wKing.row === 7 && wKing.col === castling.kingHomeCol) {
    if (white.some((p) => p.row === 7 && p.col === castling.kingSide.rookFromCol && p.type === "r")) {
      castlingStr += "K";
    }
    if (white.some((p) => p.row === 7 && p.col === castling.queenSide.rookFromCol && p.type === "r")) {
      castlingStr += "Q";
    }
  }

  const bKing = black.find((p) => PIECE_DEFINITIONS[p.type]?.royal);
  if (bKing && bKing.row === 0 && bKing.col === castling.kingHomeCol) {
    if (black.some((p) => p.row === 0 && p.col === castling.kingSide.rookFromCol && p.type === "r")) {
      castlingStr += "k";
    }
    if (black.some((p) => p.row === 0 && p.col === castling.queenSide.rookFromCol && p.type === "r")) {
      castlingStr += "q";
    }
  }

  if (!castlingStr) castlingStr = "-";

  return `${placement} w ${castlingStr} - 0 1`;
}

export function draftablePieces(): { type: string; displayName: string; cost: number }[] {
  return Object.entries(PIECE_COSTS)
    .map(([type, cost]) => ({
      type,
      displayName: PIECE_DEFINITIONS[type]?.displayName ?? type,
      cost,
    }))
    .sort((a, b) => a.cost - b.cost || a.displayName.localeCompare(b.displayName));
}
