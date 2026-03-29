import type { PieceColor } from "../domain/chess-game";
import type { TimelineMove, ClockSnapshot } from "../domain/session";
import type { DraftPlacement } from "../domain/draft";

export interface GameState {
  phase: "drafting" | "playing";
  initialFen: string | null;
  draftTimeMs: number;
  incrementMs: number;
  firstMoveDeadline: number | null;
  moves: TimelineMove[];
  clockInitialMs: number;
  clockSnapshots: ClockSnapshot[];
  liveClock: ClockSnapshot;
  timeoutWinner: PieceColor | null;
  cancelledReason: string | null;
  yourColor: PieceColor | null;
  playerNames: { w: string | null; b: string | null };
  whiteJoined: boolean;
  blackJoined: boolean;
}

export interface MultiplayerHandlers {
  onMove: (move: TimelineMove, clock: ClockSnapshot) => void;
  onJoin: (name?: string) => void;
  onTimeout: (winner: PieceColor, clock: ClockSnapshot) => void;
  onSync: (state: {
    moves: TimelineMove[];
    clockInitialMs: number;
    clockSnapshots: ClockSnapshot[];
    timeoutWinner: PieceColor | null;
  }) => void;
  onDraftComplete: (fen: string) => void;
  onGameCancelled: (reason: string) => void;
  onResign: (loser: PieceColor, winner: PieceColor) => void;
  onDrawOffer: (from: PieceColor) => void;
  onDrawAccepted: () => void;
  onAddTime: (from: PieceColor, to: PieceColor, addedMs: number, clock: ClockSnapshot) => void;
  onRematchOffer: (from: PieceColor) => void;
  onRematchAccepted: (newGameId: string) => void;
}

let gameId: string | null = null;
let playerToken: string | null = null;
let playerColor: PieceColor | null = null;
let eventSource: EventSource | null = null;
let active = false;
let gameIncrementMs = 0;

function tokenKey(id: string): string {
  return `wess-game-${id}`;
}

function storeToken(id: string, token: string): void {
  try {
    sessionStorage.setItem(tokenKey(id), token);
  } catch {
    // sessionStorage unavailable
  }
}

function loadToken(id: string): string | null {
  try {
    return sessionStorage.getItem(tokenKey(id));
  } catch {
    return null;
  }
}

function authHeaders(): Record<string, string> {
  if (!playerToken) return {};
  return { Authorization: `Bearer ${playerToken}` };
}

export function detectMultiplayerRoute(): { gameId: string } | null {
  const match = window.location.pathname.match(/^\/game\/([a-f0-9]+)$/i);
  return match ? { gameId: match[1] } : null;
}

export async function createGame(clockInitialMs: number, draftTimeMs: number = 120000, incrementMs: number = 0, playerName: string = "Player"): Promise<{ gameId: string }> {
  const res = await fetch("/api/games", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clockInitialMs, draftTimeMs, incrementMs, playerName }),
  });

  if (!res.ok) throw new Error("Failed to create game");

  const data = await res.json();
  gameId = data.gameId;
  playerToken = data.playerToken;
  playerColor = data.color;
  active = true;

  storeToken(data.gameId, data.playerToken);
  return { gameId: data.gameId };
}

export async function joinGame(id: string, playerName: string = "Player"): Promise<{ color: PieceColor | "spectator"; state: GameState }> {
  gameId = id;
  active = true;

  // Check for existing token
  const existingToken = loadToken(id);

  // Fetch current game state
  const stateRes = await fetch(`/api/games/${id}`, {
    headers: existingToken ? { Authorization: `Bearer ${existingToken}` } : {},
  });

  if (!stateRes.ok) throw new Error("Game not found");
  const state: GameState = await stateRes.json();
  gameIncrementMs = state.incrementMs || 0;

  // If we already have a token and it matched a player
  if (existingToken && state.yourColor) {
    playerToken = existingToken;
    playerColor = state.yourColor;
    return { color: state.yourColor, state };
  }

  // Try to join as a player
  const joinRes = await fetch(`/api/games/${id}/join`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(existingToken ? { Authorization: `Bearer ${existingToken}` } : {}),
    },
    body: JSON.stringify({ playerName }),
  });

  if (!joinRes.ok) throw new Error("Failed to join game");
  const joinData = await joinRes.json();

  if (joinData.color === "w" || joinData.color === "b") {
    playerToken = joinData.playerToken;
    playerColor = joinData.color;
    storeToken(id, joinData.playerToken);

    // Re-fetch state with new token to get yourColor
    const freshRes = await fetch(`/api/games/${id}`, {
      headers: { Authorization: `Bearer ${joinData.playerToken}` },
    });
    if (freshRes.ok) {
      const freshState: GameState = await freshRes.json();
      return { color: joinData.color, state: freshState };
    }

    return { color: joinData.color, state };
  }

  // Spectator
  playerColor = null;
  return { color: "spectator", state };
}

export async function submitDraft(placements: DraftPlacement[]): Promise<boolean> {
  if (!gameId || !playerToken) return false;

  const res = await fetch(`/api/games/${gameId}/draft`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify({ placements }),
  });

  return res.ok;
}

export async function resign(): Promise<boolean> {
  if (!gameId || !playerToken) return false;
  const res = await fetch(`/api/games/${gameId}/resign`, { method: "POST", headers: authHeaders() });
  return res.ok;
}

export async function offerDraw(): Promise<boolean> {
  if (!gameId || !playerToken) return false;
  const res = await fetch(`/api/games/${gameId}/draw`, { method: "POST", headers: authHeaders() });
  return res.ok;
}

export async function addTimeToOpponent(): Promise<boolean> {
  if (!gameId || !playerToken) return false;
  const res = await fetch(`/api/games/${gameId}/add-time`, { method: "POST", headers: authHeaders() });
  return res.ok;
}

export async function offerRematch(): Promise<boolean> {
  if (!gameId || !playerToken) return false;
  const res = await fetch(`/api/games/${gameId}/rematch`, { method: "POST", headers: authHeaders() });
  return res.ok;
}

export async function sendMove(move: TimelineMove): Promise<boolean> {
  if (!gameId || !playerToken) return false;

  const res = await fetch(`/api/games/${gameId}/move`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify(move),
  });

  return res.ok;
}

export function connectEvents(id: string, handlers: MultiplayerHandlers): void {
  disconnectEvents();

  eventSource = new EventSource(`/api/games/${id}/events`);

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);

      switch (data.type) {
        case "move":
          handlers.onMove(data.move, data.clock);
          break;
        case "join":
          handlers.onJoin(data.name);
          break;
        case "timeout":
          handlers.onTimeout(data.winner, data.clock);
          break;
        case "sync":
          handlers.onSync(data);
          break;
        case "draft-complete":
          handlers.onDraftComplete(data.fen);
          break;
        case "game-cancelled":
          handlers.onGameCancelled(data.reason ?? "Game cancelled");
          break;
        case "resign":
          handlers.onResign(data.loser, data.winner);
          break;
        case "draw-offer":
          handlers.onDrawOffer(data.from);
          break;
        case "draw-accepted":
          handlers.onDrawAccepted();
          break;
        case "add-time":
          handlers.onAddTime(data.from, data.to, data.addedMs, data.clock);
          break;
        case "rematch-offer":
          handlers.onRematchOffer(data.from);
          break;
        case "rematch-accepted":
          handlers.onRematchAccepted(data.newGameId);
          break;
      }
    } catch {
      // Ignore malformed events
    }
  };

  eventSource.onerror = () => {
    // EventSource reconnects automatically
  };
}

export function disconnectEvents(): void {
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
}

export function resetState(): void {
  disconnectEvents();
  gameId = null;
  playerToken = null;
  playerColor = null;
  active = false;
  gameIncrementMs = 0;
}

export function isMultiplayer(): boolean {
  return active;
}

export function getIncrementMs(): number {
  return gameIncrementMs;
}

export function getPlayerColor(): PieceColor | null {
  return playerColor;
}

export function isMyTurn(currentTurn: PieceColor): boolean {
  return playerColor === currentTurn;
}

export function isSpectator(): boolean {
  return active && playerColor === null;
}

export function getGameId(): string | null {
  return gameId;
}
