export interface GameRecord {
  id: string;
  date: number;
  white: string;
  black: string;
  result: string;
  reason: string;
  moves: number;
  pgn: string;
  clockInitialMs: number;
  isMultiplayer: boolean;
}

const HISTORY_KEY = "wess-game-history";
const MAX_GAMES = 100;

export function saveGame(record: GameRecord): void {
  try {
    const history = getHistory();
    history.unshift(record);
    if (history.length > MAX_GAMES) history.length = MAX_GAMES;
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch {
    // localStorage unavailable or full
  }
}

export function getHistory(): GameRecord[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function clearHistory(): void {
  try {
    localStorage.removeItem(HISTORY_KEY);
  } catch {
    // ignore
  }
}

export function generateGameId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
