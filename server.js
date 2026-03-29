import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const PORT = Number(process.env.PORT) || 3000;
const __dirname = fileURLToPath(new URL(".", import.meta.url));
const DIST_DIR = join(__dirname, "dist");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
};

/** @type {Map<string, GameRoom>} */
const rooms = new Map();

function generateId() {
  return randomBytes(4).toString("hex");
}

function generateToken() {
  return randomBytes(16).toString("hex");
}

const GRACE_PERIOD_MS = 15000;

function createRoom(clockInitialMs, draftTimeMs = 120000) {
  const id = generateId();
  const whiteToken = generateToken();

  /** @type {GameRoom} */
  const room = {
    id,
    createdAt: Date.now(),
    players: {
      w: { token: whiteToken },
      b: null,
    },
    phase: "drafting",
    drafts: { w: null, b: null },
    draftTimeMs,
    initialFen: null,
    moves: [],
    clockInitialMs,
    clockSnapshots: [{ whiteMs: clockInitialMs, blackMs: clockInitialMs, activeColor: null }],
    liveClockStartedAt: null,
    firstMoveDeadline: null,
    timeoutWinner: null,
    cancelledReason: null,
    drawOffer: null,
    rematchOffer: null,
    rematchGameId: null,
    playerNames: { w: null, b: null },
    sseClients: new Set(),
  };

  rooms.set(id, room);
  return { room, whiteToken };
}

function getPlayerColor(room, token) {
  if (token && room.players.w?.token === token) return "w";
  if (token && room.players.b?.token === token) return "b";
  return null;
}

function getCurrentTurn(room) {
  // Standard chess: white starts, alternates each move
  return room.moves.length % 2 === 0 ? "w" : "b";
}

function isGameOver(room) {
  return room.timeoutWinner !== null || room.cancelledReason !== null;
}

function deductClock(room) {
  if (isGameOver(room) || room.moves.length === 0 || !room.liveClockStartedAt) return;

  const now = Date.now();
  const elapsed = now - room.liveClockStartedAt;
  const latest = room.clockSnapshots[room.clockSnapshots.length - 1];
  const activeColor = latest.activeColor;

  if (!activeColor) return;

  const key = activeColor === "w" ? "whiteMs" : "blackMs";
  const remaining = latest[key] - elapsed;

  if (remaining <= 0) {
    latest[key] = 0;
    latest.activeColor = null;
    room.timeoutWinner = activeColor === "w" ? "b" : "w";
    broadcast(room, {
      type: "timeout",
      winner: room.timeoutWinner,
      clock: { ...latest },
    });
  }
}

function broadcast(room, data) {
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  for (const res of room.sseClients) {
    try {
      res.write(payload);
    } catch {
      room.sseClients.delete(res);
    }
  }
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString()));
      } catch {
        resolve({});
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Access-Control-Allow-Origin": "*",
  });
  res.end(body);
}

function getToken(req) {
  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) return auth.slice(7);
  return null;
}

function matchRoute(method, pathname) {
  if (method === "POST" && pathname === "/api/games") {
    return { handler: "createGame" };
  }

  const joinMatch = pathname.match(/^\/api\/games\/([a-f0-9]+)\/join$/);
  if (method === "POST" && joinMatch) {
    return { handler: "joinGame", gameId: joinMatch[1] };
  }

  const stateMatch = pathname.match(/^\/api\/games\/([a-f0-9]+)$/);
  if (method === "GET" && stateMatch) {
    return { handler: "getGame", gameId: stateMatch[1] };
  }

  const draftMatch = pathname.match(/^\/api\/games\/([a-f0-9]+)\/draft$/);
  if (method === "POST" && draftMatch) {
    return { handler: "submitDraft", gameId: draftMatch[1] };
  }

  const moveMatch = pathname.match(/^\/api\/games\/([a-f0-9]+)\/move$/);
  if (method === "POST" && moveMatch) {
    return { handler: "submitMove", gameId: moveMatch[1] };
  }

  const resignMatch = pathname.match(/^\/api\/games\/([a-f0-9]+)\/resign$/);
  if (method === "POST" && resignMatch) {
    return { handler: "resign", gameId: resignMatch[1] };
  }

  const drawMatch = pathname.match(/^\/api\/games\/([a-f0-9]+)\/draw$/);
  if (method === "POST" && drawMatch) {
    return { handler: "draw", gameId: drawMatch[1] };
  }

  const addTimeMatch = pathname.match(/^\/api\/games\/([a-f0-9]+)\/add-time$/);
  if (method === "POST" && addTimeMatch) {
    return { handler: "addTime", gameId: addTimeMatch[1] };
  }

  const rematchMatch = pathname.match(/^\/api\/games\/([a-f0-9]+)\/rematch$/);
  if (method === "POST" && rematchMatch) {
    return { handler: "rematch", gameId: rematchMatch[1] };
  }

  const eventsMatch = pathname.match(/^\/api\/games\/([a-f0-9]+)\/events$/);
  if (method === "GET" && eventsMatch) {
    return { handler: "events", gameId: eventsMatch[1] };
  }

  return null;
}

async function handleCreateGame(req, res) {
  const body = await parseBody(req);
  const clockInitialMs = Number(body.clockInitialMs) > 0 ? Number(body.clockInitialMs) : 300000;
  const incrementMs = Number(body.incrementMs) >= 0 ? Number(body.incrementMs) : 0;
  const draftTimeMs = Number(body.draftTimeMs) > 0 ? Math.min(300000, Math.max(30000, Number(body.draftTimeMs))) : 120000;

  const playerName = String(body.playerName || "Player").slice(0, 20);
  let preferred = body.preferredColor;
  if (preferred === "random") preferred = Math.random() < 0.5 ? "w" : "b";
  const creatorColor = preferred === "b" ? "b" : "w";

  const { room, whiteToken } = createRoom(clockInitialMs, draftTimeMs);
  room.incrementMs = incrementMs;

  if (creatorColor === "w") {
    room.playerNames.w = playerName;
    sendJson(res, 201, { gameId: room.id, playerToken: whiteToken, color: "w", draftTimeMs, clockInitialMs, incrementMs });
  } else {
    // Creator wants black — leave white slot empty, put creator in black
    room.players.w = null;
    const blackToken = generateToken();
    room.players.b = { token: blackToken };
    room.playerNames.b = playerName;
    sendJson(res, 201, { gameId: room.id, playerToken: blackToken, color: "b", draftTimeMs, clockInitialMs, incrementMs });
  }
}

async function handleJoinGame(req, res, gameId) {
  const room = rooms.get(gameId);
  if (!room) return sendJson(res, 404, { error: "Game not found" });

  const existingToken = getToken(req);
  const existingColor = getPlayerColor(room, existingToken);
  if (existingColor) {
    return sendJson(res, 200, { playerToken: existingToken, color: existingColor });
  }

  const body = await parseBody(req);
  const joinName = String(body.playerName || "Player").slice(0, 20);

  if (!room.players.w) {
    const whiteToken = generateToken();
    room.players.w = { token: whiteToken };
    if (!room.playerNames.w) room.playerNames.w = joinName;
    broadcast(room, { type: "join", color: "w", name: room.playerNames.w });
    return sendJson(res, 200, { playerToken: whiteToken, color: "w" });
  }

  if (!room.players.b) {
    const blackToken = generateToken();
    room.players.b = { token: blackToken };
    if (!room.playerNames.b) room.playerNames.b = joinName;
    broadcast(room, { type: "join", color: "b", name: room.playerNames.b });
    return sendJson(res, 200, { playerToken: blackToken, color: "b" });
  }

  sendJson(res, 200, { color: "spectator" });
}

function handleGetGame(req, res, gameId) {
  const room = rooms.get(gameId);
  if (!room) return sendJson(res, 404, { error: "Game not found" });

  const token = getToken(req);
  const yourColor = getPlayerColor(room, token);

  // Calculate live clock values
  const latest = { ...room.clockSnapshots[room.clockSnapshots.length - 1] };
  if (latest.activeColor && !isGameOver(room) && room.liveClockStartedAt) {
    const elapsed = Date.now() - room.liveClockStartedAt;
    const key = latest.activeColor === "w" ? "whiteMs" : "blackMs";
    latest[key] = Math.max(0, latest[key] - elapsed);
  }

  sendJson(res, 200, {
    phase: room.phase,
    initialFen: room.initialFen,
    draftTimeMs: room.draftTimeMs,
    incrementMs: room.incrementMs || 0,
    firstMoveDeadline: room.firstMoveDeadline,
    moves: room.moves,
    clockInitialMs: room.clockInitialMs,
    clockSnapshots: room.clockSnapshots,
    liveClock: latest,
    timeoutWinner: room.timeoutWinner,
    cancelledReason: room.cancelledReason,
    yourColor,
    playerNames: room.playerNames,
    whiteJoined: Boolean(room.players.w),
    blackJoined: Boolean(room.players.b),
  });
}

async function handleSubmitDraft(req, res, gameId) {
  const room = rooms.get(gameId);
  if (!room) return sendJson(res, 404, { error: "Game not found" });
  if (room.phase !== "drafting") return sendJson(res, 400, { error: "Draft phase is over" });

  const token = getToken(req);
  const color = getPlayerColor(room, token);
  if (!color) return sendJson(res, 403, { error: "Not a player" });

  const body = await parseBody(req);
  if (!Array.isArray(body.placements)) return sendJson(res, 400, { error: "Invalid draft" });

  room.drafts[color] = body.placements;
  sendJson(res, 200, { ok: true, waiting: !room.drafts.w || !room.drafts.b });

  // Check if both drafts are in
  if (room.drafts.w && room.drafts.b) {
    room.phase = "playing";

    // Build FEN from both drafts (server-side, simple approach)
    const board = Array.from({ length: 8 }, () => Array(8).fill(null));
    for (const p of room.drafts.w) board[p.row][p.col] = p.type.toUpperCase();
    for (const p of room.drafts.b) board[p.row][p.col] = p.type;

    const placement = board.map((row) => {
      let rank = "";
      let empty = 0;
      for (const cell of row) {
        if (cell === null) { empty++; } else {
          if (empty > 0) { rank += empty; empty = 0; }
          rank += cell;
        }
      }
      if (empty > 0) rank += empty;
      return rank;
    }).join("/");

    // Castling: check king at e-file and rooks at a/h on back ranks
    let castling = "";
    const wKing = room.drafts.w.find((p) => p.type === "k");
    if (wKing && wKing.row === 7 && wKing.col === 4) {
      if (room.drafts.w.some((p) => p.row === 7 && p.col === 7 && p.type === "r")) castling += "K";
      if (room.drafts.w.some((p) => p.row === 7 && p.col === 0 && p.type === "r")) castling += "Q";
    }
    const bKing = room.drafts.b.find((p) => p.type === "k");
    if (bKing && bKing.row === 0 && bKing.col === 4) {
      if (room.drafts.b.some((p) => p.row === 0 && p.col === 7 && p.type === "r")) castling += "k";
      if (room.drafts.b.some((p) => p.row === 0 && p.col === 0 && p.type === "r")) castling += "q";
    }
    if (!castling) castling = "-";

    room.initialFen = `${placement} w ${castling} - 0 1`;
    room.firstMoveDeadline = Date.now() + GRACE_PERIOD_MS;

    broadcast(room, {
      type: "draft-complete",
      fen: room.initialFen,
      firstMoveDeadline: room.firstMoveDeadline,
    });
  }
}

async function handleSubmitMove(req, res, gameId) {
  const room = rooms.get(gameId);
  if (!room) return sendJson(res, 404, { error: "Game not found" });
  if (room.phase === "drafting") return sendJson(res, 400, { error: "Draft phase — game has not started" });
  if (isGameOver(room)) return sendJson(res, 400, { error: "Game is over" });

  const token = getToken(req);
  const color = getPlayerColor(room, token);
  if (!color) return sendJson(res, 403, { error: "Not a player" });

  const turn = getCurrentTurn(room);
  if (color !== turn) return sendJson(res, 400, { error: "Not your turn" });

  const body = await parseBody(req);
  if (!body.from || !body.to) return sendJson(res, 400, { error: "Invalid move" });

  const move = { from: body.from, to: body.to };
  if (body.promotion) move.promotion = body.promotion;

  const now = Date.now();

  // Moves 0 and 1 are grace period (first move per side) — no clock deduction
  // Clock deduction starts from move 2 onwards
  if (room.moves.length >= 2 && room.liveClockStartedAt) {
    const elapsed = now - room.liveClockStartedAt;
    const latest = room.clockSnapshots[room.clockSnapshots.length - 1];
    const key = color === "w" ? "whiteMs" : "blackMs";
    latest[key] = Math.max(0, latest[key] - elapsed);

    if (latest[key] <= 0) {
      latest.activeColor = null;
      room.timeoutWinner = color === "w" ? "b" : "w";
      broadcast(room, { type: "timeout", winner: room.timeoutWinner, clock: { ...latest } });
      return sendJson(res, 400, { error: "Time expired" });
    }
  }

  room.moves.push(move);
  room.drawOffer = null;
  const moveCount = room.moves.length;

  const prevClock = room.clockSnapshots[room.clockSnapshots.length - 1];
  const nextTurn = getCurrentTurn(room);

  // First 2 moves (one per side) are free — activeColor stays null
  // Clock only becomes active from move 3 onwards
  // Add increment to the mover's clock (only after grace period)
  const moverKey = color === "w" ? "whiteMs" : "blackMs";
  const increment = moveCount >= 3 ? (room.incrementMs || 0) : 0;

  const clockActive = moveCount >= 2 ? nextTurn : null;
  room.clockSnapshots.push({
    whiteMs: prevClock.whiteMs + (color === "w" ? increment : 0),
    blackMs: prevClock.blackMs + (color === "b" ? increment : 0),
    activeColor: clockActive,
  });

  if (moveCount === 1) {
    // White moved — give black 15s grace to make their first move
    room.firstMoveDeadline = now + GRACE_PERIOD_MS;
  } else if (moveCount === 2) {
    // Both sides moved — clear grace, start real clock
    room.firstMoveDeadline = null;
    room.liveClockStartedAt = now;
  } else {
    room.liveClockStartedAt = now;
  }

  const ply = room.moves.length;
  const clock = { ...room.clockSnapshots[room.clockSnapshots.length - 1] };

  broadcast(room, { type: "move", move, ply, clock, timestamp: now, firstMoveDeadline: room.firstMoveDeadline });
  sendJson(res, 200, { ok: true, ply });
}

function handleResign(req, res, gameId) {
  const room = rooms.get(gameId);
  if (!room) return sendJson(res, 404, { error: "Game not found" });
  if (isGameOver(room)) return sendJson(res, 400, { error: "Game is over" });

  const token = getToken(req);
  const color = getPlayerColor(room, token);
  if (!color) return sendJson(res, 403, { error: "Not a player" });

  const winner = color === "w" ? "b" : "w";
  room.timeoutWinner = winner; // reuse field for game-over state
  broadcast(room, { type: "resign", loser: color, winner });
  sendJson(res, 200, { ok: true, winner });
}

const ADD_TIME_MS = 15000;

function handleAddTime(req, res, gameId) {
  const room = rooms.get(gameId);
  if (!room) return sendJson(res, 404, { error: "Game not found" });
  if (isGameOver(room)) return sendJson(res, 400, { error: "Game is over" });
  if (room.phase !== "playing") return sendJson(res, 400, { error: "Game not started" });

  const token = getToken(req);
  const color = getPlayerColor(room, token);
  if (!color) return sendJson(res, 403, { error: "Not a player" });

  // Add time to opponent's clock
  const opponent = color === "w" ? "b" : "w";
  const latest = room.clockSnapshots[room.clockSnapshots.length - 1];
  const key = opponent === "w" ? "whiteMs" : "blackMs";
  latest[key] += ADD_TIME_MS;

  const clock = { ...latest };
  broadcast(room, { type: "add-time", from: color, to: opponent, addedMs: ADD_TIME_MS, clock });
  sendJson(res, 200, { ok: true, clock });
}

function handleDraw(req, res, gameId) {
  const room = rooms.get(gameId);
  if (!room) return sendJson(res, 404, { error: "Game not found" });
  if (isGameOver(room)) return sendJson(res, 400, { error: "Game is over" });

  const token = getToken(req);
  const color = getPlayerColor(room, token);
  if (!color) return sendJson(res, 403, { error: "Not a player" });

  if (!room.drawOffer) {
    // First player offers
    room.drawOffer = color;
    broadcast(room, { type: "draw-offer", from: color });
    sendJson(res, 200, { ok: true, status: "offered" });
  } else if (room.drawOffer !== color) {
    // Other player accepts
    room.drawOffer = null;
    room.timeoutWinner = "draw";
    broadcast(room, { type: "draw-accepted" });
    sendJson(res, 200, { ok: true, status: "accepted" });
  } else {
    // Same player — already offered
    sendJson(res, 400, { error: "Already offered draw" });
  }
}

function handleRematch(req, res, gameId) {
  const room = rooms.get(gameId);
  if (!room) return sendJson(res, 404, { error: "Game not found" });
  if (!isGameOver(room)) return sendJson(res, 400, { error: "Game is not over" });

  const token = getToken(req);
  const color = getPlayerColor(room, token);
  if (!color) return sendJson(res, 403, { error: "Not a player" });

  if (room.rematchGameId) {
    return sendJson(res, 200, { ok: true, newGameId: room.rematchGameId });
  }

  if (!room.rematchOffer) {
    room.rematchOffer = color;
    broadcast(room, { type: "rematch-offer", from: color });
    sendJson(res, 200, { ok: true, status: "offered" });
  } else if (room.rematchOffer !== color) {
    // Both agreed — create new game with swapped colors
    const { room: newRoom } = createRoom(room.clockInitialMs, room.draftTimeMs);
    newRoom.incrementMs = room.incrementMs || 0;
    // Leave both player slots empty — players join naturally via /join
    newRoom.players.w = null;
    newRoom.players.b = null;
    // Randomly assign names to colors
    const swap = Math.random() < 0.5;
    newRoom.playerNames.w = swap ? (room.playerNames.w || "Player") : (room.playerNames.b || "Player");
    newRoom.playerNames.b = swap ? (room.playerNames.b || "Player") : (room.playerNames.w || "Player");

    room.rematchGameId = newRoom.id;

    broadcast(room, { type: "rematch-accepted", newGameId: newRoom.id });
    sendJson(res, 200, { ok: true, status: "accepted", newGameId: newRoom.id });
  } else {
    sendJson(res, 400, { error: "Already offered rematch" });
  }
}

function handleEvents(req, res, gameId) {
  const room = rooms.get(gameId);
  if (!room) {
    sendJson(res, 404, { error: "Game not found" });
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "Access-Control-Allow-Origin": "*",
    "X-Accel-Buffering": "no",
  });

  res.write(": connected\n\n");

  // Send current state as first event
  const syncData = {
    type: "sync",
    phase: room.phase,
    initialFen: room.initialFen,
    draftTimeMs: room.draftTimeMs,
    firstMoveDeadline: room.firstMoveDeadline,
    moves: room.moves,
    clockInitialMs: room.clockInitialMs,
    clockSnapshots: room.clockSnapshots,
    timeoutWinner: room.timeoutWinner,
    cancelledReason: room.cancelledReason,
    playerNames: room.playerNames,
  };
  res.write(`data: ${JSON.stringify(syncData)}\n\n`);

  room.sseClients.add(res);

  req.on("close", () => {
    room.sseClients.delete(res);
  });
}

async function serveStaticFile(res, pathname) {
  // Prevent directory traversal
  const safePath = pathname.replace(/\.\./g, "").replace(/\/\//g, "/");
  const filePath = join(DIST_DIR, safePath === "/" ? "index.html" : safePath);

  try {
    const content = await readFile(filePath);
    const ext = extname(filePath);
    const contentType = MIME_TYPES[ext] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": contentType });
    res.end(content);
  } catch {
    // SPA fallback for /game/* routes
    if (pathname.startsWith("/game/") || pathname === "/play" || pathname === "/about") {
      try {
        const indexContent = await readFile(join(DIST_DIR, "index.html"));
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(indexContent);
        return;
      } catch {
        // fall through to 404
      }
    }
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;
  const method = req.method;

  // CORS preflight
  if (method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    });
    res.end();
    return;
  }

  const route = matchRoute(method, pathname);

  try {
    if (route) {
      switch (route.handler) {
        case "createGame": return await handleCreateGame(req, res);
        case "joinGame": return await handleJoinGame(req, res, route.gameId);
        case "getGame": return handleGetGame(req, res, route.gameId);
        case "submitDraft": return await handleSubmitDraft(req, res, route.gameId);
        case "submitMove": return await handleSubmitMove(req, res, route.gameId);
        case "resign": return handleResign(req, res, route.gameId);
        case "draw": return handleDraw(req, res, route.gameId);
        case "addTime": return handleAddTime(req, res, route.gameId);
        case "rematch": return handleRematch(req, res, route.gameId);
        case "events": return handleEvents(req, res, route.gameId);
      }
    }

    await serveStaticFile(res, pathname);
  } catch (error) {
    console.error("Request error:", error);
    if (!res.headersSent) {
      sendJson(res, 500, { error: "Internal server error" });
    }
  }
});

// Periodic checks — clock timeouts and grace period cancellation
setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    if (isGameOver(room)) continue;

    // Grace period: cancel if first moves not made in time
    if (room.firstMoveDeadline && now > room.firstMoveDeadline && room.moves.length < 2) {
      room.cancelledReason = "First move timeout";
      room.firstMoveDeadline = null;
      broadcast(room, { type: "game-cancelled", reason: room.cancelledReason });
      continue;
    }

    deductClock(room);
  }
}, 500);

server.listen(PORT, () => {
  console.log(`Wess server listening on http://127.0.0.1:${PORT}`);
});
