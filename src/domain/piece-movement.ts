export type PieceColor = "w" | "b";

export type MoveMode = "move" | "capture" | "both";

export interface MovementRule {
  directions: [number, number][];
  range: number;
  sliding: boolean;
  leap: boolean;
  mode: MoveMode;
  initial: boolean;
  relative: boolean;
}

export interface PieceDefinition {
  rules: MovementRule[];
  initialRanks: { w: number; b: number } | null;
  promotionRanks: { w: number; b: number } | null;
  enPassant: boolean;
  castles: boolean;
  royal: boolean;
  sanLetter: string;
  fenLetter: string;
  displayName: string;
  promotable: boolean;
  promotionTarget: boolean;
  resetsHalfmoveClock: boolean;
  sufficientMaterial: boolean;
  sameColorInsufficient: boolean;
  highValueTarget: boolean;
  animationProfile: "leaper" | "slider";
}

export interface CastlingConfig {
  kingHomeCol: number;
  kingSide: { rookFromCol: number; rookToCol: number; kingToCol: number; clearCols: number[]; safeCols: number[] };
  queenSide: { rookFromCol: number; rookToCol: number; kingToCol: number; clearCols: number[]; safeCols: number[] };
}

export const STANDARD_CASTLING: CastlingConfig = {
  kingHomeCol: 4,
  kingSide: { rookFromCol: 7, rookToCol: 5, kingToCol: 6, clearCols: [5, 6], safeCols: [5, 6] },
  queenSide: { rookFromCol: 0, rookToCol: 3, kingToCol: 2, clearCols: [1, 2, 3], safeCols: [2, 3] },
};

export const ORTHOGONAL: [number, number][] = [
  [-1, 0], [1, 0], [0, -1], [0, 1],
];

export const DIAGONAL: [number, number][] = [
  [-1, -1], [-1, 1], [1, -1], [1, 1],
];

export const ALL_DIRECTIONS: [number, number][] = [...ORTHOGONAL, ...DIAGONAL];

export const KNIGHT_JUMPS: [number, number][] = [
  [-2, -1], [-2, 1], [-1, -2], [-1, 2],
  [1, -2], [1, 2], [2, -1], [2, 1],
];

export const FORWARD: [number, number][] = [[1, 0]];

export const FORWARD_DIAGONAL: [number, number][] = [[1, -1], [1, 1]];

function rule(
  directions: [number, number][],
  range: number,
  options: Partial<Pick<MovementRule, "sliding" | "leap" | "mode" | "initial" | "relative">> = {},
): MovementRule {
  return {
    directions,
    range,
    sliding: options.sliding ?? false,
    leap: options.leap ?? false,
    mode: options.mode ?? "both",
    initial: options.initial ?? false,
    relative: options.relative ?? false,
  };
}

export const PIECE_DEFINITIONS: Record<string, PieceDefinition> = {
  r: {
    rules: [rule(ORTHOGONAL, 7, { sliding: true })],
    initialRanks: null,
    promotionRanks: null,
    enPassant: false,
    castles: false,
    royal: false,
    sanLetter: "R",
    fenLetter: "r",
    displayName: "rook",
    promotable: false,
    promotionTarget: true,
    resetsHalfmoveClock: false,
    sufficientMaterial: true,
    sameColorInsufficient: false,
    highValueTarget: false,
    animationProfile: "slider",
  },
  n: {
    rules: [rule(KNIGHT_JUMPS, 1, { leap: true })],
    initialRanks: null,
    promotionRanks: null,
    enPassant: false,
    castles: false,
    royal: false,
    sanLetter: "N",
    fenLetter: "n",
    displayName: "knight",
    promotable: false,
    promotionTarget: true,
    resetsHalfmoveClock: false,
    sufficientMaterial: false,
    sameColorInsufficient: false,
    highValueTarget: false,
    animationProfile: "leaper",
  },
  b: {
    rules: [rule(DIAGONAL, 7, { sliding: true })],
    initialRanks: null,
    promotionRanks: null,
    enPassant: false,
    castles: false,
    royal: false,
    sanLetter: "B",
    fenLetter: "b",
    displayName: "bishop",
    promotable: false,
    promotionTarget: true,
    resetsHalfmoveClock: false,
    sufficientMaterial: false,
    sameColorInsufficient: true,
    highValueTarget: false,
    animationProfile: "slider",
  },
  q: {
    rules: [rule(ALL_DIRECTIONS, 7, { sliding: true })],
    initialRanks: null,
    promotionRanks: null,
    enPassant: false,
    castles: false,
    royal: false,
    sanLetter: "Q",
    fenLetter: "q",
    displayName: "queen",
    promotable: false,
    promotionTarget: true,
    resetsHalfmoveClock: false,
    sufficientMaterial: true,
    sameColorInsufficient: false,
    highValueTarget: true,
    animationProfile: "slider",
  },
  k: {
    rules: [rule(ALL_DIRECTIONS, 1)],
    initialRanks: null,
    promotionRanks: null,
    enPassant: false,
    castles: true,
    royal: true,
    sanLetter: "K",
    fenLetter: "k",
    displayName: "king",
    promotable: false,
    promotionTarget: false,
    resetsHalfmoveClock: false,
    sufficientMaterial: false,
    sameColorInsufficient: false,
    highValueTarget: false,
    animationProfile: "slider",
  },
  p: {
    rules: [
      rule(FORWARD, 1, { mode: "move", relative: true }),
      rule(FORWARD, 2, { mode: "move", initial: true, relative: true }),
      rule(FORWARD_DIAGONAL, 1, { mode: "capture", relative: true }),
    ],
    initialRanks: { w: 6, b: 1 },
    promotionRanks: { w: 0, b: 7 },
    enPassant: true,
    castles: false,
    royal: false,
    sanLetter: "",
    fenLetter: "p",
    displayName: "pawn",
    promotable: true,
    promotionTarget: false,
    resetsHalfmoveClock: true,
    sufficientMaterial: true,
    sameColorInsufficient: false,
    highValueTarget: false,
    animationProfile: "slider",
  },
  a: {
    rules: [
      rule(DIAGONAL, 7, { sliding: true }),
      rule(KNIGHT_JUMPS, 1, { leap: true }),
    ],
    initialRanks: null,
    promotionRanks: null,
    enPassant: false,
    castles: false,
    royal: false,
    sanLetter: "A",
    fenLetter: "a",
    displayName: "archbishop",
    promotable: false,
    promotionTarget: true,
    resetsHalfmoveClock: false,
    sufficientMaterial: true,
    sameColorInsufficient: false,
    highValueTarget: true,
    animationProfile: "leaper",
  },
  s: {
    rules: [
      rule(ORTHOGONAL, 1, { mode: "move" }),
      rule(DIAGONAL, 1, { mode: "capture" }),
    ],
    initialRanks: null,
    promotionRanks: null,
    enPassant: false,
    castles: false,
    royal: false,
    sanLetter: "S",
    fenLetter: "s",
    displayName: "sentinel",
    promotable: false,
    promotionTarget: false,
    resetsHalfmoveClock: false,
    sufficientMaterial: false,
    sameColorInsufficient: false,
    highValueTarget: false,
    animationProfile: "leaper",
  },
  d: {
    rules: [
      rule(ALL_DIRECTIONS, 2, { leap: true }),
    ],
    initialRanks: null,
    promotionRanks: null,
    enPassant: false,
    castles: false,
    royal: false,
    sanLetter: "D",
    fenLetter: "d",
    displayName: "warden",
    promotable: false,
    promotionTarget: true,
    resetsHalfmoveClock: false,
    sufficientMaterial: false,
    sameColorInsufficient: false,
    highValueTarget: false,
    animationProfile: "leaper",
  },
  l: {
    rules: [
      rule([[1, 0]], 3, { sliding: true, relative: true }),
      rule([[1, -1], [1, 1]], 3, { sliding: true, relative: true }),
      rule([[-1, 0], [0, -1], [0, 1]], 1, { relative: true }),
    ],
    initialRanks: null,
    promotionRanks: null,
    enPassant: false,
    castles: false,
    royal: false,
    sanLetter: "L",
    fenLetter: "l",
    displayName: "lancer",
    promotable: false,
    promotionTarget: true,
    resetsHalfmoveClock: false,
    sufficientMaterial: true,
    sameColorInsufficient: false,
    highValueTarget: false,
    animationProfile: "slider",
  },
  v: {
    rules: [
      rule(DIAGONAL, 7, { sliding: true }),
      rule(ORTHOGONAL, 2, { sliding: true, mode: "move" }),
    ],
    initialRanks: null,
    promotionRanks: null,
    enPassant: false,
    castles: false,
    royal: false,
    sanLetter: "V",
    fenLetter: "v",
    displayName: "vanguard",
    promotable: false,
    promotionTarget: true,
    resetsHalfmoveClock: false,
    sufficientMaterial: true,
    sameColorInsufficient: false,
    highValueTarget: true,
    animationProfile: "slider",
  },
  c: {
    rules: [
      rule(ORTHOGONAL, 7, { sliding: true }),
      rule(KNIGHT_JUMPS, 1, { leap: true }),
    ],
    initialRanks: null,
    promotionRanks: null,
    enPassant: false,
    castles: false,
    royal: false,
    sanLetter: "C",
    fenLetter: "c",
    displayName: "chancellor",
    promotable: false,
    promotionTarget: true,
    resetsHalfmoveClock: false,
    sufficientMaterial: true,
    sameColorInsufficient: false,
    highValueTarget: true,
    animationProfile: "leaper",
  },
};

export const BACK_RANK: string[] = ["r", "n", "b", "q", "k", "b", "n", "r"];
export const FRONT_ROW: (string | null)[] = [null, null, null, null, "a", null, null, null];

// --- Lookup helpers (computed once at module load) ---

const fenCharToTypeMap = new Map<string, { type: string; color: PieceColor }>();
const validFenChars = new Set<string>();
const sanLetterToTypeMap = new Map<string, string>();
let promotionTargetsCache: string[] | null = null;
let pawnTypeCache: string | null = null;

for (const [type, def] of Object.entries(PIECE_DEFINITIONS)) {
  fenCharToTypeMap.set(def.fenLetter, { type, color: "b" });
  fenCharToTypeMap.set(def.fenLetter.toUpperCase(), { type, color: "w" });
  validFenChars.add(def.fenLetter);
  validFenChars.add(def.fenLetter.toUpperCase());
  if (def.sanLetter) {
    sanLetterToTypeMap.set(def.sanLetter, type);
  }
}

export function getDefinition(type: string): PieceDefinition {
  const def = PIECE_DEFINITIONS[type];
  if (!def) {
    throw new Error(`Unknown piece type: ${type}`);
  }
  return def;
}

export function isValidFenChar(char: string): boolean {
  return validFenChars.has(char);
}

export function getPieceByFenChar(char: string): { type: string; color: PieceColor } | null {
  return fenCharToTypeMap.get(char) ?? null;
}

export function getPromotionTargets(): string[] {
  if (!promotionTargetsCache) {
    promotionTargetsCache = Object.entries(PIECE_DEFINITIONS)
      .filter(([, def]) => def.promotionTarget)
      .map(([type]) => type);
  }
  return promotionTargetsCache;
}

export function getSanLetterMap(): Map<string, string> {
  return sanLetterToTypeMap;
}

export function getPawnType(): string {
  if (!pawnTypeCache) {
    const entry = Object.entries(PIECE_DEFINITIONS).find(([, def]) => def.promotable);
    pawnTypeCache = entry ? entry[0] : "p";
  }
  return pawnTypeCache;
}
