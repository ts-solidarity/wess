export type PieceColor = "w" | "b";
export type PieceType = "p" | "n" | "b" | "r" | "q" | "k";
export type CastleSide = "k" | "q";

export interface Piece {
  type: PieceType;
  color: PieceColor;
}

export type Board = (Piece | null)[][];

export interface CastlingRights {
  k: boolean;
  q: boolean;
}

export interface Castling {
  w: CastlingRights;
  b: CastlingRights;
}

export interface EnPassant {
  row: number;
  col: number;
  pawnRow: number;
  pawnCol: number;
  color: PieceColor;
}

export interface GameResult {
  over: boolean;
  winner: PieceColor | null;
  reason: string | null;
}

export interface Move {
  from: string;
  to: string;
  fromRow: number;
  fromCol: number;
  toRow: number;
  toCol: number;
  piece: PieceType;
  color: PieceColor;
  capture: boolean;
  capturedPiece: PieceType | null;
  promotionRequired?: boolean;
  promotion?: string;
  isDoublePawnPush?: boolean;
  isEnPassant?: boolean;
  capturedRow?: number;
  capturedCol?: number;
  isCastling?: boolean;
  castleSide?: CastleSide;
  notation?: string;
  ply?: number;
  fen?: string;
}

export interface GameState {
  board: Board;
  turn: PieceColor;
  castling: Castling;
  enPassant: EnPassant | null;
  halfmoveClock: number;
  fullmoveNumber: number;
  moveHistory: Move[];
  positionCounts: Map<string, number>;
  check: boolean;
  legalMoves: Move[];
  result: GameResult;
}

export interface PublicSnapshot {
  board: Board;
  turn: PieceColor;
  castling: Castling;
  enPassant: EnPassant | null;
  halfmoveClock: number;
  fullmoveNumber: number;
  moveHistory: Move[];
  check: boolean;
  result: GameResult;
  fen: string;
}

const FILES: string[] = ["a", "b", "c", "d", "e", "f", "g", "h"];
const BACK_RANK: PieceType[] = ["r", "n", "b", "q", "k", "b", "n", "r"];
const PROMOTION_PIECES = new Set<string>(["q", "r", "b", "n"]);

function createPiece(type: PieceType, color: PieceColor): Piece {
  return { type, color };
}

function clonePiece(piece: Piece | null): Piece | null {
  return piece ? { ...piece } : null;
}

function cloneBoard(board: Board): Board {
  return board.map((row) => row.map((piece) => clonePiece(piece)));
}

function cloneCastling(castling: Castling): Castling {
  return {
    w: { ...castling.w },
    b: { ...castling.b },
  };
}

function cloneMove(move: Move): Move {
  return { ...move };
}

function cloneEnPassant(enPassant: EnPassant | null): EnPassant | null {
  return enPassant ? { ...enPassant } : null;
}

function oppositeColor(color: PieceColor): PieceColor {
  return color === "w" ? "b" : "w";
}

function pawnDirection(color: PieceColor): number {
  return color === "w" ? -1 : 1;
}

function homeRank(color: PieceColor): number {
  return color === "w" ? 7 : 0;
}

function isInBounds(row: number, col: number): boolean {
  return row >= 0 && row < 8 && col >= 0 && col < 8;
}

export function coordsToSquare(row: number, col: number): string {
  return `${FILES[col]}${8 - row}`;
}

export function squareToCoords(square: string): { row: number; col: number } | null {
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

function pieceLetter(type: PieceType): string {
  return type === "p" ? "" : type.toUpperCase();
}

function pieceToFenChar(piece: Piece | null): string {
  if (!piece) {
    return "";
  }

  return piece.color === "w" ? piece.type.toUpperCase() : piece.type;
}

function fenCharToPiece(char: string): Piece {
  const color: PieceColor = char === char.toUpperCase() ? "w" : "b";
  return createPiece(char.toLowerCase() as PieceType, color);
}

function normalizePromotionChoice(choice: string | undefined): PieceType {
  const normalized = String(choice ?? "q").toLowerCase();
  return PROMOTION_PIECES.has(normalized) ? normalized as PieceType : "q";
}

function buildInitialBoard(): Board {
  const board = Array.from({ length: 8 }, () => Array(8).fill(null));

  for (let col = 0; col < 8; col += 1) {
    board[0][col] = createPiece(BACK_RANK[col], "b");
    board[1][col] = createPiece("p", "b");
    board[6][col] = createPiece("p", "w");
    board[7][col] = createPiece(BACK_RANK[col], "w");
  }

  return board;
}

function boardToPlacement(board: Board): string {
  return board
    .map((row) => {
      let emptyCount = 0;
      let fenRow = "";

      for (const piece of row) {
        if (!piece) {
          emptyCount += 1;
          continue;
        }

        if (emptyCount > 0) {
          fenRow += String(emptyCount);
          emptyCount = 0;
        }

        fenRow += pieceToFenChar(piece);
      }

      if (emptyCount > 0) {
        fenRow += String(emptyCount);
      }

      return fenRow;
    })
    .join("/");
}

function castlingToString(castling: Castling): string {
  let text = "";

  if (castling.w.k) {
    text += "K";
  }
  if (castling.w.q) {
    text += "Q";
  }
  if (castling.b.k) {
    text += "k";
  }
  if (castling.b.q) {
    text += "q";
  }

  return text || "-";
}

function buildEnPassantSquare(state: GameState): string {
  return state.enPassant ? coordsToSquare(state.enPassant.row, state.enPassant.col) : "-";
}

function buildRepetitionEnPassantSquare(state: GameState): string {
  if (!state.enPassant) {
    return "-";
  }

  const { pawnRow, pawnCol } = state.enPassant;
  const candidateCols = [pawnCol - 1, pawnCol + 1];

  for (const col of candidateCols) {
    if (!isInBounds(pawnRow, col)) {
      continue;
    }

    const piece = state.board[pawnRow][col];
    if (piece?.type === "p" && piece.color === state.turn) {
      return coordsToSquare(state.enPassant.row, state.enPassant.col);
    }
  }

  return "-";
}

function positionKey(state: GameState): string {
  return [
    boardToPlacement(state.board),
    state.turn,
    castlingToString(state.castling),
    buildRepetitionEnPassantSquare(state),
  ].join(" ");
}

function fullFen(state: GameState): string {
  return [
    boardToPlacement(state.board),
    state.turn,
    castlingToString(state.castling),
    buildEnPassantSquare(state),
    state.halfmoveClock,
    state.fullmoveNumber,
  ].join(" ");
}

function makeEmptyState(): GameState {
  return {
    board: Array.from({ length: 8 }, () => Array(8).fill(null)),
    turn: "w",
    castling: {
      w: { k: false, q: false },
      b: { k: false, q: false },
    },
    enPassant: null,
    halfmoveClock: 0,
    fullmoveNumber: 1,
    moveHistory: [],
    positionCounts: new Map(),
    check: false,
    legalMoves: [],
    result: {
      over: false,
      winner: null,
      reason: null,
    },
  };
}

function createInitialState(): GameState {
  const state = makeEmptyState();
  state.board = buildInitialBoard();
  state.castling = {
    w: { k: true, q: true },
    b: { k: true, q: true },
  };
  state.positionCounts.set(positionKey(state), 1);
  evaluateState(state);
  return state;
}

function parseFen(fen: string): GameState {
  const fields = String(fen).trim().split(/\s+/);
  if (fields.length < 4) {
    throw new Error("Invalid FEN: expected at least 4 fields.");
  }

  const [
    placement,
    activeColor,
    castlingField,
    enPassantField,
    halfmoveField = "0",
    fullmoveField = "1",
  ] = fields;
  const rows = placement.split("/");
  if (rows.length !== 8) {
    throw new Error("Invalid FEN: expected 8 ranks.");
  }

  const state = makeEmptyState();

  rows.forEach((rowText, rowIndex) => {
    let col = 0;

    for (const char of rowText) {
      if (/\d/.test(char)) {
        col += Number(char);
        continue;
      }

      if (!/[prnbqkPRNBQK]/.test(char)) {
        throw new Error(`Invalid FEN piece: ${char}`);
      }

      if (col >= 8) {
        throw new Error("Invalid FEN: rank overflow.");
      }

      state.board[rowIndex][col] = fenCharToPiece(char);
      col += 1;
    }

    if (col !== 8) {
      throw new Error("Invalid FEN: rank underflow.");
    }
  });

  const kings = { w: 0, b: 0 };
  for (const row of state.board) {
    for (const piece of row) {
      if (piece?.type === "k") kings[piece.color] += 1;
    }
  }
  if (kings.w !== 1 || kings.b !== 1) {
    throw new Error("Invalid FEN: each side must have exactly one king.");
  }

  if (activeColor !== "w" && activeColor !== "b") {
    throw new Error("Invalid FEN: active color must be 'w' or 'b'.");
  }
  state.turn = activeColor as PieceColor;

  state.castling = {
    w: {
      k: castlingField.includes("K"),
      q: castlingField.includes("Q"),
    },
    b: {
      k: castlingField.includes("k"),
      q: castlingField.includes("q"),
    },
  };

  if (enPassantField !== "-") {
    const coords = squareToCoords(enPassantField);
    if (!coords) {
      throw new Error("Invalid FEN: en passant square is malformed.");
    }

    const pawnColor = oppositeColor(activeColor);
    const pawnRow = coords.row + pawnDirection(pawnColor);
    state.enPassant = {
      row: coords.row,
      col: coords.col,
      pawnRow,
      pawnCol: coords.col,
      color: pawnColor,
    };
  }

  state.halfmoveClock = Number.parseInt(halfmoveField, 10);
  state.fullmoveNumber = Number.parseInt(fullmoveField, 10);
  state.positionCounts.set(positionKey(state), 1);
  evaluateState(state);
  return state;
}

function cloneState(state: GameState): GameState {
  return {
    board: cloneBoard(state.board),
    turn: state.turn,
    castling: cloneCastling(state.castling),
    enPassant: cloneEnPassant(state.enPassant),
    halfmoveClock: state.halfmoveClock,
    fullmoveNumber: state.fullmoveNumber,
    moveHistory: state.moveHistory.map((move) => cloneMove(move)),
    positionCounts: new Map(state.positionCounts),
    check: state.check,
    legalMoves: state.legalMoves.map((move) => cloneMove(move)),
    result: { ...state.result },
  };
}

interface SimulationState {
  board: Board;
  turn: PieceColor;
  castling: Castling;
  enPassant: EnPassant | null;
  halfmoveClock: number;
  fullmoveNumber: number;
}

function cloneStateForSimulation(state: GameState): SimulationState {
  return {
    board: cloneBoard(state.board),
    turn: state.turn,
    castling: cloneCastling(state.castling),
    enPassant: cloneEnPassant(state.enPassant),
    halfmoveClock: state.halfmoveClock,
    fullmoveNumber: state.fullmoveNumber,
  };
}

function publicSnapshot(state: GameState): PublicSnapshot {
  return {
    board: cloneBoard(state.board),
    turn: state.turn,
    castling: cloneCastling(state.castling),
    enPassant: cloneEnPassant(state.enPassant),
    halfmoveClock: state.halfmoveClock,
    fullmoveNumber: state.fullmoveNumber,
    moveHistory: state.moveHistory.map((move) => cloneMove(move)),
    check: state.check,
    result: { ...state.result },
    fen: fullFen(state),
  };
}

function findKing(state: GameState | SimulationState, color: PieceColor): { row: number; col: number } | null {
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const piece = state.board[row][col];
      if (piece?.type === "k" && piece.color === color) {
        return { row, col };
      }
    }
  }

  return null;
}

function isSquareAttacked(state: GameState | SimulationState, targetRow: number, targetCol: number, attackerColor: PieceColor): boolean {
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const piece = state.board[row][col];
      if (!piece || piece.color !== attackerColor) {
        continue;
      }

      switch (piece.type) {
        case "p": {
          const attackRow = row + pawnDirection(piece.color);
          if (
            attackRow === targetRow &&
            (col - 1 === targetCol || col + 1 === targetCol)
          ) {
            return true;
          }
          break;
        }
        case "n": {
          const offsets = [
            [-2, -1],
            [-2, 1],
            [-1, -2],
            [-1, 2],
            [1, -2],
            [1, 2],
            [2, -1],
            [2, 1],
          ];

          if (offsets.some(([dr, dc]) => row + dr === targetRow && col + dc === targetCol)) {
            return true;
          }
          break;
        }
        case "b":
        case "r":
        case "q": {
          const directions = [];

          if (piece.type === "b" || piece.type === "q") {
            directions.push(
              [-1, -1],
              [-1, 1],
              [1, -1],
              [1, 1],
            );
          }

          if (piece.type === "r" || piece.type === "q") {
            directions.push(
              [-1, 0],
              [1, 0],
              [0, -1],
              [0, 1],
            );
          }

          for (const [dr, dc] of directions) {
            let scanRow = row + dr;
            let scanCol = col + dc;

            while (isInBounds(scanRow, scanCol)) {
              if (scanRow === targetRow && scanCol === targetCol) {
                return true;
              }

              if (state.board[scanRow][scanCol]) {
                break;
              }

              scanRow += dr;
              scanCol += dc;
            }
          }
          break;
        }
        case "k": {
          if (Math.max(Math.abs(row - targetRow), Math.abs(col - targetCol)) === 1) {
            return true;
          }
          break;
        }
        default:
          break;
      }
    }
  }

  return false;
}

function isKingInCheck(state: GameState | SimulationState, color: PieceColor): boolean {
  const king = findKing(state, color);
  if (!king) {
    return false;
  }

  return isSquareAttacked(state, king.row, king.col, oppositeColor(color));
}

function createMove(state: GameState, row: number, col: number, toRow: number, toCol: number, extra: Partial<Move> = {}): Move {
  const movingPiece = state.board[row][col]!;
  const capturedPiece = extra.isEnPassant
    ? state.board[extra.capturedRow!][extra.capturedCol!]
    : state.board[toRow][toCol];

  return {
    from: coordsToSquare(row, col),
    to: coordsToSquare(toRow, toCol),
    fromRow: row,
    fromCol: col,
    toRow,
    toCol,
    piece: movingPiece.type,
    color: movingPiece.color,
    capture: Boolean(capturedPiece),
    capturedPiece: capturedPiece?.type ?? null,
    ...extra,
  };
}

function generatePseudoMovesForPiece(state: GameState, row: number, col: number): Move[] {
  const piece = state.board[row][col];
  if (!piece) {
    return [];
  }

  const moves = [];

  switch (piece.type) {
    case "p": {
      const direction = pawnDirection(piece.color);
      const startRow = piece.color === "w" ? 6 : 1;
      const promotionRow = piece.color === "w" ? 0 : 7;
      const nextRow = row + direction;

      if (isInBounds(nextRow, col) && !state.board[nextRow][col]) {
        moves.push(
          createMove(state, row, col, nextRow, col, {
            promotionRequired: nextRow === promotionRow,
          }),
        );

        const doubleRow = row + (2 * direction);
        if (
          row === startRow &&
          isInBounds(doubleRow, col) &&
          !state.board[doubleRow][col]
        ) {
          moves.push(
            createMove(state, row, col, doubleRow, col, {
              isDoublePawnPush: true,
            }),
          );
        }
      }

      for (const targetCol of [col - 1, col + 1]) {
        if (!isInBounds(nextRow, targetCol)) {
          continue;
        }

        const targetPiece = state.board[nextRow][targetCol];
        if (targetPiece && targetPiece.color !== piece.color) {
          moves.push(
            createMove(state, row, col, nextRow, targetCol, {
              promotionRequired: nextRow === promotionRow,
            }),
          );
          continue;
        }

        if (
          state.enPassant &&
          state.enPassant.row === nextRow &&
          state.enPassant.col === targetCol
        ) {
          const capturedPawn = state.board[state.enPassant.pawnRow]?.[state.enPassant.pawnCol];
          if (capturedPawn?.type === "p" && capturedPawn.color !== piece.color) {
            moves.push(
              createMove(state, row, col, nextRow, targetCol, {
                isEnPassant: true,
                capturedRow: state.enPassant.pawnRow,
                capturedCol: state.enPassant.pawnCol,
              }),
            );
          }
        }
      }

      break;
    }
    case "n": {
      const offsets = [
        [-2, -1],
        [-2, 1],
        [-1, -2],
        [-1, 2],
        [1, -2],
        [1, 2],
        [2, -1],
        [2, 1],
      ];

      for (const [dr, dc] of offsets) {
        const targetRow = row + dr;
        const targetCol = col + dc;
        if (!isInBounds(targetRow, targetCol)) {
          continue;
        }

        const targetPiece = state.board[targetRow][targetCol];
        if (!targetPiece || targetPiece.color !== piece.color) {
          moves.push(createMove(state, row, col, targetRow, targetCol));
        }
      }
      break;
    }
    case "b":
    case "r":
    case "q": {
      const directions = [];

      if (piece.type === "b" || piece.type === "q") {
        directions.push(
          [-1, -1],
          [-1, 1],
          [1, -1],
          [1, 1],
        );
      }

      if (piece.type === "r" || piece.type === "q") {
        directions.push(
          [-1, 0],
          [1, 0],
          [0, -1],
          [0, 1],
        );
      }

      for (const [dr, dc] of directions) {
        let targetRow = row + dr;
        let targetCol = col + dc;

        while (isInBounds(targetRow, targetCol)) {
          const targetPiece = state.board[targetRow][targetCol];
          if (!targetPiece) {
            moves.push(createMove(state, row, col, targetRow, targetCol));
          } else {
            if (targetPiece.color !== piece.color) {
              moves.push(createMove(state, row, col, targetRow, targetCol));
            }
            break;
          }

          targetRow += dr;
          targetCol += dc;
        }
      }
      break;
    }
    case "k": {
      for (let dr = -1; dr <= 1; dr += 1) {
        for (let dc = -1; dc <= 1; dc += 1) {
          if (dr === 0 && dc === 0) {
            continue;
          }

          const targetRow = row + dr;
          const targetCol = col + dc;
          if (!isInBounds(targetRow, targetCol)) {
            continue;
          }

          const targetPiece = state.board[targetRow][targetCol];
          if (!targetPiece || targetPiece.color !== piece.color) {
            moves.push(createMove(state, row, col, targetRow, targetCol));
          }
        }
      }

      const opponent = oppositeColor(piece.color);
      const isHomeSquare = row === homeRank(piece.color) && col === 4;
      if (!isHomeSquare || isSquareAttacked(state, row, col, opponent)) {
        break;
      }

      const rights = state.castling[piece.color];

      if (rights.k) {
        const rook = state.board[row][7];
        if (
          rook?.type === "r" &&
          rook.color === piece.color &&
          !state.board[row][5] &&
          !state.board[row][6] &&
          !isSquareAttacked(state, row, 5, opponent) &&
          !isSquareAttacked(state, row, 6, opponent)
        ) {
          moves.push(
            createMove(state, row, col, row, 6, {
              isCastling: true,
              castleSide: "k",
            }),
          );
        }
      }

      if (rights.q) {
        const rook = state.board[row][0];
        if (
          rook?.type === "r" &&
          rook.color === piece.color &&
          !state.board[row][1] &&
          !state.board[row][2] &&
          !state.board[row][3] &&
          !isSquareAttacked(state, row, 3, opponent) &&
          !isSquareAttacked(state, row, 2, opponent)
        ) {
          moves.push(
            createMove(state, row, col, row, 2, {
              isCastling: true,
              castleSide: "q",
            }),
          );
        }
      }

      break;
    }
    default:
      break;
  }

  return moves;
}

function applyMoveToState(state: GameState | SimulationState, move: Move): void {
  const piece = state.board[move.fromRow][move.fromCol]!;
  const targetPiece = move.isEnPassant
    ? state.board[move.capturedRow!][move.capturedCol!]
    : state.board[move.toRow][move.toCol];

  state.board[move.fromRow][move.fromCol] = null;

  if (move.isEnPassant) {
    state.board[move.capturedRow!][move.capturedCol!] = null;
  }

  if (move.isCastling) {
    if (move.castleSide === "k") {
      const rook = state.board[move.fromRow][7];
      state.board[move.fromRow][7] = null;
      state.board[move.fromRow][5] = clonePiece(rook);
    } else {
      const rook = state.board[move.fromRow][0];
      state.board[move.fromRow][0] = null;
      state.board[move.fromRow][3] = clonePiece(rook);
    }
  }

  const promotionType = move.promotionRequired
    ? normalizePromotionChoice(move.promotion)
    : piece.type;

  state.board[move.toRow][move.toCol] = createPiece(promotionType, piece.color);

  if (piece.type === "k") {
    state.castling[piece.color].k = false;
    state.castling[piece.color].q = false;
  }

  if (piece.type === "r") {
    const rookHomeRow = homeRank(piece.color);
    if (move.fromRow === rookHomeRow && move.fromCol === 0) {
      state.castling[piece.color].q = false;
    }
    if (move.fromRow === rookHomeRow && move.fromCol === 7) {
      state.castling[piece.color].k = false;
    }
  }

  if (targetPiece?.type === "r") {
    const rookHomeRow = homeRank(targetPiece.color);
    const captureRow = move.isEnPassant ? move.capturedRow : move.toRow;
    const captureCol = move.isEnPassant ? move.capturedCol : move.toCol;
    if (captureRow === rookHomeRow && captureCol === 0) {
      state.castling[targetPiece.color].q = false;
    }
    if (captureRow === rookHomeRow && captureCol === 7) {
      state.castling[targetPiece.color].k = false;
    }
  }

  if (piece.type === "p" && Math.abs(move.toRow - move.fromRow) === 2) {
    state.enPassant = {
      row: move.fromRow + pawnDirection(piece.color),
      col: move.fromCol,
      pawnRow: move.toRow,
      pawnCol: move.toCol,
      color: piece.color,
    };
  } else {
    state.enPassant = null;
  }

  if (piece.type === "p" || move.capture) {
    state.halfmoveClock = 0;
  } else {
    state.halfmoveClock += 1;
  }

  if (piece.color === "b") {
    state.fullmoveNumber += 1;
  }

  state.turn = oppositeColor(piece.color);
}

function moveLeavesKingInCheck(state: GameState, move: Move): boolean {
  const simulated = cloneStateForSimulation(state);
  applyMoveToState(simulated, move);
  return isKingInCheck(simulated, move.color);
}

function generateLegalMovesForSquare(state: GameState, row: number, col: number, color: PieceColor = state.turn): Move[] {
  const piece = state.board[row][col];
  if (!piece || piece.color !== color) {
    return [];
  }

  const pseudoMoves = generatePseudoMovesForPiece(state, row, col);
  return pseudoMoves.filter((move) => !moveLeavesKingInCheck(state, move));
}

function generateAllLegalMoves(state: GameState, color: PieceColor = state.turn): Move[] {
  const moves = [];

  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      moves.push(...generateLegalMovesForSquare(state, row, col, color));
    }
  }

  return moves;
}

function squareColor(row: number, col: number): string {
  return (row + col) % 2 === 0 ? "light" : "dark";
}

function isInsufficientMaterial(state: GameState): boolean {
  const pieces = [];

  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const piece = state.board[row][col];
      if (!piece || piece.type === "k") {
        continue;
      }

      pieces.push({
        ...piece,
        squareColor: squareColor(row, col),
      });
    }
  }

  if (pieces.length === 0) {
    return true;
  }

  if (pieces.some((piece) => piece.type === "p" || piece.type === "r" || piece.type === "q")) {
    return false;
  }

  if (pieces.length === 1) {
    return true;
  }

  if (pieces.every((piece) => piece.type === "b")) {
    return new Set(pieces.map((piece) => piece.squareColor)).size === 1;
  }

  return false;
}

function evaluateState(state: GameState): void {
  state.check = isKingInCheck(state, state.turn);
  state.legalMoves = generateAllLegalMoves(state, state.turn);

  let result: GameResult = {
    over: false,
    winner: null,
    reason: null,
  };

  if (state.legalMoves.length === 0) {
    result = state.check
      ? {
          over: true,
          winner: oppositeColor(state.turn),
          reason: "checkmate",
        }
      : {
          over: true,
          winner: null,
          reason: "stalemate",
        };
  } else if (isInsufficientMaterial(state)) {
    result = {
      over: true,
      winner: null,
      reason: "insufficient material",
    };
  } else if (state.halfmoveClock >= 100) {
    result = {
      over: true,
      winner: null,
      reason: "fifty-move rule",
    };
  } else if ((state.positionCounts.get(positionKey(state)) ?? 0) >= 3) {
    result = {
      over: true,
      winner: null,
      reason: "threefold repetition",
    };
  }

  state.result = result;
}

function formatMove(previousState: GameState, move: Move, currentState: GameState): string {
  const suffix = currentState.result.reason === "checkmate"
    ? "#"
    : currentState.check
      ? "+"
      : "";

  if (move.isCastling) {
    return `${move.castleSide === "k" ? "O-O" : "O-O-O"}${suffix}`;
  }

  const captureToken = move.capture ? "x" : "";
  const promotionToken = move.promotion ? `=${move.promotion.toUpperCase()}` : "";
  const destination = move.to;

  if (move.piece === "p") {
    const pawnPrefix = move.capture ? `${move.from[0]}${captureToken}` : "";
    return `${pawnPrefix}${destination}${promotionToken}${suffix}`;
  }

  const competingMoves = generateAllLegalMoves(previousState, move.color).filter((candidate) => (
    candidate.from !== move.from
    && candidate.to === move.to
    && candidate.piece === move.piece
  ));

  let disambiguation = "";

  if (competingMoves.length > 0) {
    const sameFile = competingMoves.some((candidate) => candidate.from[0] === move.from[0]);
    const sameRank = competingMoves.some((candidate) => candidate.from[1] === move.from[1]);

    if (!sameFile) {
      disambiguation = move.from[0];
    } else if (!sameRank) {
      disambiguation = move.from[1];
    } else {
      disambiguation = move.from;
    }
  }

  return `${pieceLetter(move.piece)}${disambiguation}${captureToken}${destination}${promotionToken}${suffix}`;
}

export class ChessGame {
  state: GameState;

  constructor(fen: string | null = null) {
    this.state = fen ? parseFen(fen) : createInitialState();
  }

  reset(): PublicSnapshot {
    this.state = createInitialState();
    return this.snapshot();
  }

  loadFen(fen: string): PublicSnapshot {
    this.state = parseFen(fen);
    return this.snapshot();
  }

  toFen(): string {
    return fullFen(this.state);
  }

  snapshot(): PublicSnapshot {
    return publicSnapshot(this.state);
  }

  getPiece(square: string): Piece | null {
    const coords = squareToCoords(square);
    if (!coords) {
      return null;
    }

    return clonePiece(this.state.board[coords.row][coords.col]);
  }

  getLegalMoves(square: string): Move[] {
    if (this.state.result.over) {
      return [];
    }

    const coords = squareToCoords(square);
    if (!coords) {
      return [];
    }

    return generateLegalMovesForSquare(this.state, coords.row, coords.col, this.state.turn)
      .map((move) => cloneMove(move));
  }

  getAllLegalMoves(color: PieceColor = this.state.turn): Move[] {
    if (this.state.result.over && color === this.state.turn) {
      return [];
    }

    return generateAllLegalMoves(this.state, color).map((move) => cloneMove(move));
  }

  makeMove(from: string, to: string, promotion: string = "q"): Move | null {
    if (this.state.result.over) {
      return null;
    }

    const legalMoves = this.getLegalMoves(from);
    const chosenMove = legalMoves.find((move) => move.to === to);
    if (!chosenMove) {
      return null;
    }

    const move = {
      ...chosenMove,
      promotion: chosenMove.promotionRequired ? normalizePromotionChoice(promotion) : undefined,
    };

    const previousState = cloneState(this.state);
    applyMoveToState(this.state, move);

    const key = positionKey(this.state);
    this.state.positionCounts.set(key, (this.state.positionCounts.get(key) ?? 0) + 1);
    evaluateState(this.state);

    const record = {
      ...move,
      notation: formatMove(previousState, move, this.state),
      ply: this.state.moveHistory.length + 1,
      fen: fullFen(this.state),
    };
    this.state.moveHistory.push(record);

    return cloneMove(record);
  }
}
