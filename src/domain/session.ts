import { CLOCK_PRESETS, DEFAULT_CLOCK_MS } from "../app/constants";
import { ChessGame } from "./chess-game";
import type { PieceColor, PublicSnapshot, Move } from "./chess-game";
import { getPromotionTargets, getSanLetterMap, getDefinition, getPawnType } from "./piece-movement";

export interface ClockSnapshot {
  whiteMs: number;
  blackMs: number;
  activeColor: PieceColor | null;
}

export interface TimelineMove {
  from: string;
  to: string;
  promotion?: string;
}

export interface Session {
  initialFen: string | null;
  moves: TimelineMove[];
  currentPly: number;
  clockInitialMs: number;
  clockSnapshots: ClockSnapshot[];
  liveClockStartedAt: number;
  replayToken: number;
  replaying: boolean;
  timeoutWinner: PieceColor | null;
}

export interface StoredSession {
  initialFen: string | null;
  moves: TimelineMove[];
  currentPly: number;
  clockInitialMs: number;
  clockSnapshots: ClockSnapshot[];
  orientation: PieceColor;
  timeoutWinner: PieceColor | null;
}

export function normalizeClockPreset(value: unknown): number {
  const parsed = Number(value);
  return CLOCK_PRESETS.has(parsed) ? parsed : DEFAULT_CLOCK_MS;
}

function createGameForPosition(initialFen: string | null, startFen: string | null = null): ChessGame {
  return initialFen && initialFen !== startFen ? new ChessGame(initialFen) : new ChessGame();
}

function getInitialActiveColor(initialFen: string | null, startFen: string | null = null): PieceColor | null {
  const snapshot = createGameForPosition(initialFen, startFen).snapshot();
  return snapshot.result.over ? null : snapshot.turn;
}

export function createClockSnapshot(initialMs: number = DEFAULT_CLOCK_MS, activeColor: PieceColor | null = "w"): ClockSnapshot {
  return {
    whiteMs: initialMs,
    blackMs: initialMs,
    activeColor,
  };
}

export function cloneClockSnapshot(snapshot: ClockSnapshot | null, initialMs: number = DEFAULT_CLOCK_MS, activeColor: PieceColor | null = "w"): ClockSnapshot {
  return snapshot ? { ...snapshot } : createClockSnapshot(initialMs, activeColor);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizeTimelineMove(move: any): TimelineMove | null {
  if (!move || typeof move.from !== "string" || typeof move.to !== "string") {
    return null;
  }

  return {
    from: move.from,
    to: move.to,
    promotion: move.promotion ? String(move.promotion).toLowerCase() : undefined,
  };
}

export function createEmptySession(initialFen: string | null, clockInitialMs: number = DEFAULT_CLOCK_MS, now: number = Date.now()): Session {
  const activeColor = getInitialActiveColor(initialFen);

  return {
    initialFen,
    moves: [],
    currentPly: 0,
    clockInitialMs,
    clockSnapshots: [createClockSnapshot(clockInitialMs, activeColor)],
    liveClockStartedAt: now,
    replayToken: 0,
    replaying: false,
    timeoutWinner: null,
  };
}

export function formatClockValue(milliseconds: number): string {
  const clamped = Math.max(Math.floor(milliseconds), 0);
  const totalSeconds = Math.floor(clamped / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (clamped < 60000) {
    const tenths = Math.floor((clamped % 1000) / 100);
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${tenths}`;
  }

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function buildClockSnapshotsForMoves(
  moves: TimelineMove[],
  initialFen: string | null,
  startFen: string | null,
  clockInitialMs: number = DEFAULT_CLOCK_MS,
): ClockSnapshot[] {
  const tempGame = createGameForPosition(initialFen, startFen);
  const snapshots = [createClockSnapshot(
    clockInitialMs,
    getInitialActiveColor(initialFen, startFen),
  )];

  for (const move of moves) {
    const record = tempGame.makeMove(move.from, move.to, move.promotion);
    if (!record) {
      throw new Error(`Invalid move in session timeline: ${move.from}-${move.to}`);
    }

    const state = tempGame.snapshot();
    snapshots.push({
      whiteMs: snapshots[0].whiteMs,
      blackMs: snapshots[0].blackMs,
      activeColor: state.result.over ? null : state.turn,
    });
  }

  return snapshots;
}

function normalizeClockValue(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(parsed, 0) : fallback;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizeStoredSession(data: any, { startFen }: { startFen: string }): StoredSession | null {
  if (!data || typeof data !== "object") {
    return null;
  }

  const moves = Array.isArray(data.moves)
    ? data.moves.map(normalizeTimelineMove).filter(Boolean)
    : [];

  const currentPlyRaw = Number(data.currentPly);
  const currentPly = Math.min(
    Math.max(Number.isFinite(currentPlyRaw) ? currentPlyRaw : moves.length, 0),
    moves.length,
  );
  const clockInitialMs = normalizeClockPreset(data.clockInitialMs);
  const initialFen = typeof data.initialFen === "string" ? data.initialFen : startFen;
  const initialActiveColor = getInitialActiveColor(initialFen, startFen);
  let clockSnapshots: ClockSnapshot[] = Array.isArray(data.clockSnapshots)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ? data.clockSnapshots.map((snapshot: any): ClockSnapshot => ({
        whiteMs: normalizeClockValue(snapshot?.whiteMs, clockInitialMs),
        blackMs: normalizeClockValue(snapshot?.blackMs, clockInitialMs),
        activeColor: snapshot?.activeColor === "w" || snapshot?.activeColor === "b"
          ? snapshot.activeColor
          : null,
      }))
    : [];

  if (clockSnapshots.length !== moves.length + 1) {
    clockSnapshots = buildClockSnapshotsForMoves(moves, initialFen, startFen, clockInitialMs);
  } else if (clockSnapshots.length > 0) {
    clockSnapshots[0] = {
      ...clockSnapshots[0],
      activeColor: initialActiveColor,
    };
  }

  return {
    initialFen,
    moves,
    currentPly,
    clockInitialMs,
    clockSnapshots,
    orientation: data.orientation === "b" ? "b" : "w",
    timeoutWinner: data.timeoutWinner === "w" || data.timeoutWinner === "b"
      ? data.timeoutWinner
      : null,
  };
}

function getGameResult(timeoutWinner: PieceColor | null, finalState: PublicSnapshot): string {
  if (timeoutWinner) {
    return timeoutWinner === "w" ? "1-0" : "0-1";
  }

  if (finalState.result.winner === "w") {
    return "1-0";
  }

  if (finalState.result.winner === "b") {
    return "0-1";
  }

  return finalState.result.over ? "1/2-1/2" : "*";
}

export function buildPgnText({
  moves,
  initialFen,
  startFen,
  timeoutWinner,
  finalState,
  now = new Date(),
}: {
  moves: TimelineMove[];
  initialFen: string | null;
  startFen: string | null;
  timeoutWinner?: PieceColor | null;
  finalState?: PublicSnapshot | null;
  now?: Date;
}): string {
  const exportGame = createGameForPosition(initialFen, startFen);
  const turns: string[] = [];

  for (const move of moves) {
    const beforeState = exportGame.snapshot();
    const record = exportGame.makeMove(move.from, move.to, move.promotion);
    if (!record) {
      throw new Error(`Could not export move ${move.from}-${move.to}.`);
    }

    if (beforeState.turn === "w") {
      turns.push(`${beforeState.fullmoveNumber}. ${record.notation}`);
      continue;
    }

    const whiteTurnPrefix = `${beforeState.fullmoveNumber}. `;
    const lastTurn = turns[turns.length - 1];
    if (lastTurn?.startsWith(whiteTurnPrefix)) {
      turns[turns.length - 1] = `${lastTurn} ${record.notation}`;
      continue;
    }

    turns.push(`${beforeState.fullmoveNumber}... ${record.notation}`);
  }

  const resolvedFinalState = finalState ?? exportGame.snapshot();
  const result = getGameResult(timeoutWinner ?? null, resolvedFinalState);
  const dateTag = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, "0")}.${String(now.getDate()).padStart(2, "0")}`;
  const tags = [
    `[Event "Wess Local Game"]`,
    `[Site "Local"]`,
    `[Date "${dateTag}"]`,
    `[Round "-"]`,
    `[White "White"]`,
    `[Black "Black"]`,
    `[Result "${result}"]`,
  ];

  if (initialFen !== startFen) {
    tags.push(`[SetUp "1"]`);
    tags.push(`[FEN "${initialFen}"]`);
  }

  if (timeoutWinner) {
    tags.push(`[Termination "Time forfeit"]`);
  }

  return `${tags.join("\n")}\n\n${turns.join(" ")} ${result}`.trim();
}

function normalizeSanToken(token: string): string {
  return String(token)
    .replace(/0/g, "O")
    .replace(/\s+/g, "")
    .replace(/e\.p\./gi, "")
    .replace(/[!?]+/g, "")
    .replace(/[+#]+$/g, "");
}

function stripPgnMetadata(pgnText: string): string {
  let text = String(pgnText);
  text = text.replace(/\r/g, "\n");
  text = text.replace(/^\s*\[[^\]]*]\s*$/gm, " ");
  text = text.replace(/\{[^}]*\}/g, " ");
  text = text.replace(/;[^\n]*/g, " ");

  while (/\([^()]*\)/.test(text)) {
    text = text.replace(/\([^()]*\)/g, " ");
  }

  text = text.replace(/\$\d+/g, " ");
  text = text.replace(/\d+\.(\.\.)?/g, " ");
  return text;
}

interface SanParts {
  castleSide?: string;
  pieceType?: string;
  dest?: string;
  disambiguation?: string;
  promotion?: string;
}

function parseSanParts(normalizedToken: string): SanParts | null {
  if (normalizedToken === "O-O") {
    return { castleSide: "k" };
  }
  if (normalizedToken === "O-O-O") {
    return { castleSide: "q" };
  }

  let token = normalizedToken;
  let promotion: string | undefined;
  const promoLetters = getPromotionTargets().map((t) => getDefinition(t).sanLetter).join("");
  const promoRegex = new RegExp(`=([${promoLetters}])`, "i");
  const promoMatch = token.match(promoRegex);
  if (promoMatch) {
    const promoSanLetter = promoMatch[1].toUpperCase();
    promotion = getSanLetterMap().get(promoSanLetter) ?? promoMatch[1].toLowerCase();
    token = token.replace(promoRegex, "");
  }

  const dest = token.slice(-2);
  if (!/^[a-h][1-8]$/.test(dest)) {
    return null;
  }

  const cleanPrefix = token.slice(0, -2).replace("x", "");
  let pieceType: string;
  let disambiguation: string;

  const sanMap = getSanLetterMap();
  if (cleanPrefix.length > 0 && sanMap.has(cleanPrefix[0])) {
    pieceType = sanMap.get(cleanPrefix[0])!;
    disambiguation = cleanPrefix.slice(1);
  } else {
    pieceType = getPawnType();
    disambiguation = cleanPrefix;
  }

  return { pieceType, dest, disambiguation, promotion };
}

function matchSanToMove(parsed: SanParts, candidates: Move[]): Move | null {
  if (parsed.castleSide) {
    return candidates.find((m) => m.isCastling && m.castleSide === parsed.castleSide) ?? null;
  }

  const matches = candidates.filter((m) => {
    if (m.piece !== parsed.pieceType || m.to !== parsed.dest) {
      return false;
    }

    if (parsed.disambiguation) {
      if (parsed.disambiguation.length === 2) {
        return m.from === parsed.disambiguation;
      }
      if (/[a-h]/.test(parsed.disambiguation)) {
        return m.from[0] === parsed.disambiguation;
      }
      if (/[1-8]/.test(parsed.disambiguation)) {
        return m.from[1] === parsed.disambiguation;
      }
    }

    return true;
  });

  return matches.length === 1 ? matches[0] : matches[0] ?? null;
}

export function parsePgnMoves(pgnText: string, startFen: string): { initialFen: string; moves: TimelineMove[] } {
  const tagMatches = [...String(pgnText).matchAll(/^\s*\[(\w+)\s+"([^"]*)"\]\s*$/gm)];
  const tags = Object.fromEntries(tagMatches.map((match) => [match[1], match[2]]));
  const initialFen = tags.FEN || startFen;
  const workingGame = initialFen === startFen ? new ChessGame() : new ChessGame(initialFen);
  const moveTokens = stripPgnMetadata(pgnText)
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token) => !/^(1-0|0-1|1\/2-1\/2|\*)$/.test(token));
  const moves = [];

  for (const token of moveTokens) {
    const normalizedToken = normalizeSanToken(token);
    const parsed = parseSanParts(normalizedToken);
    if (!parsed) {
      throw new Error(`Could not parse PGN token: ${token}`);
    }

    const candidates = workingGame.getAllLegalMoves();
    const matchedCandidate = matchSanToMove(parsed, candidates);
    if (!matchedCandidate) {
      throw new Error(`Could not parse PGN token: ${token}`);
    }

    const promotion = parsed.promotion ?? (matchedCandidate.promotionRequired ? "q" : undefined);
    const applied = workingGame.makeMove(matchedCandidate.from, matchedCandidate.to, promotion);
    if (!applied) {
      throw new Error(`Could not apply PGN token: ${token}`);
    }

    moves.push({
      from: matchedCandidate.from,
      to: matchedCandidate.to,
      promotion: applied.promotion,
    });
  }

  return {
    initialFen,
    moves,
  };
}
