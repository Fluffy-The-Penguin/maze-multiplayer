const DEFAULT_API_BASE_URL = "";
const POLL_MS = 180;

const els = {
  canvas: document.getElementById("mazeCanvas"),
  connection: document.querySelector("[data-connection]"),
  lobby: document.querySelector("[data-lobby]"),
  playPanel: document.querySelector("[data-play-panel]"),
  playerName: document.querySelector("[data-player-name]"),
  roomSize: document.querySelector("[data-room-size]"),
  roomCode: document.querySelector("[data-room-code]"),
  createRoom: document.querySelector("[data-create-room]"),
  joinRoom: document.querySelector("[data-join-room]"),
  leaveRoom: document.querySelector("[data-leave-room]"),
  copyCode: document.querySelector("[data-copy-code]"),
  roomLabel: document.querySelector("[data-room-label]"),
  gridColor: document.querySelector("[data-grid-color]"),
  status: document.querySelector("[data-status]"),
  players: document.querySelector("[data-players]"),
};

const ctx = els.canvas.getContext("2d");
const state = {
  room: null,
  playerId: "",
  pollTimer: null,
  pendingMove: false,
};

function apiBaseUrl() {
  return localStorage.getItem("maze-api-base-url") || DEFAULT_API_BASE_URL;
}

async function api(path, options = {}) {
  const response = await fetch(`${apiBaseUrl()}${path}`, {
    method: options.method || "GET",
    headers: { "Content-Type": "application/json" },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed: ${response.status}`);
  return data;
}

function setStatus(value) {
  els.status.textContent = value;
}

function setConnection(value) {
  els.connection.textContent = value;
}

function playerName() {
  return els.playerName.value.trim() || "Player";
}

async function createRoom() {
  try {
    setStatus("Creating room...");
    const size = Math.max(5, Math.min(60, Number(els.roomSize.value || 25)));
    const data = await api("/api/maze/rooms", { method: "POST", body: { size, name: playerName() } });
    enterRoom(data.room, data.playerId);
  } catch (error) {
    setStatus(error.message || "Could not create room.");
  }
}

async function joinRoom() {
  try {
    const code = els.roomCode.value.trim().toUpperCase();
    if (!code) return setStatus("Enter a room code.");
    setStatus("Joining room...");
    const data = await api(`/api/maze/rooms/${encodeURIComponent(code)}/join`, { method: "POST", body: { name: playerName() } });
    enterRoom(data.room, data.playerId);
  } catch (error) {
    setStatus(error.message || "Could not join room.");
  }
}

function enterRoom(room, playerId) {
  state.room = room;
  state.playerId = playerId;
  document.body.classList.add("in-room");
  els.lobby.hidden = true;
  els.playPanel.hidden = false;
  els.roomLabel.textContent = room.code;
  setConnection("Online");
  setStatus(`Room ${room.code}`);
  draw();
  startPolling();
}

function leaveRoom() {
  stopPolling();
  state.room = null;
  state.playerId = "";
  document.body.classList.remove("in-room");
  els.lobby.hidden = false;
  els.playPanel.hidden = true;
  setConnection("Offline");
  setStatus("Ready.");
  updatePlayers();
}

function startPolling() {
  stopPolling();
  state.pollTimer = window.setInterval(pollRoom, POLL_MS);
}

function stopPolling() {
  if (state.pollTimer) window.clearInterval(state.pollTimer);
  state.pollTimer = null;
}

async function pollRoom() {
  if (!state.room?.code) return;
  try {
    const data = await api(`/api/maze/rooms/${encodeURIComponent(state.room.code)}`);
    state.room = data.room;
    setConnection("Online");
    draw();
  } catch (error) {
    setConnection("Reconnecting");
  }
}

async function move(direction) {
  if (!state.room?.code || !state.playerId || state.pendingMove || state.room.winner) return;
  state.pendingMove = true;
  try {
    const data = await api(`/api/maze/rooms/${encodeURIComponent(state.room.code)}/move`, {
      method: "POST",
      body: { playerId: state.playerId, direction },
    });
    state.room = data.room;
    draw();
  } catch (error) {
    setStatus(error.message || "Move failed.");
  } finally {
    state.pendingMove = false;
  }
}

function resizeCanvas() {
  if (!state.room) return;
  const shell = document.querySelector(".game-shell");
  const topbar = document.querySelector(".topbar");
  const controls = document.querySelector(".controls");
  const styles = getComputedStyle(shell);
  const gap = parseFloat(styles.rowGap) || 0;
  const verticalPadding = parseFloat(styles.paddingTop) + parseFloat(styles.paddingBottom);
  const horizontalPadding = parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight);
  const availableHeight = window.innerHeight - topbar.offsetHeight - controls.offsetHeight - gap * 2 - verticalPadding;
  const availableWidth = window.innerWidth - horizontalPadding;
  const cell = Math.max(3, Math.floor(Math.min(availableHeight, availableWidth) / state.room.size));
  const logicalSize = cell * state.room.size;
  const dpr = window.devicePixelRatio || 1;
  els.canvas.style.width = `${logicalSize}px`;
  els.canvas.style.height = `${logicalSize}px`;
  els.canvas.width = Math.floor(logicalSize * dpr);
  els.canvas.height = Math.floor(logicalSize * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
  return { cell, logicalSize };
}

function draw() {
  if (!state.room) return;
  const sizes = resizeCanvas();
  if (!sizes) return;

  const { cell, logicalSize } = sizes;
  const wall = els.gridColor.value;
  const thickness = Math.max(1, Math.floor(cell * 0.18));
  const inset = Math.max(1, thickness);
  document.documentElement.style.setProperty("--grid", wall);
  ctx.clearRect(0, 0, logicalSize, logicalSize);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, logicalSize, logicalSize);

  for (const mazeCell of state.room.grid) {
    const x = mazeCell.c * cell;
    const y = mazeCell.r * cell;
    if (mazeCell.walls[0]) drawWall(x, y, cell, thickness, 0, wall);
    if (mazeCell.walls[1]) drawWall(x, y, cell, thickness, 1, wall);
    if (mazeCell.walls[2]) drawWall(x, y, cell, thickness, 2, wall);
    if (mazeCell.walls[3]) drawWall(x, y, cell, thickness, 3, wall);
  }

  ctx.fillStyle = "#e74c3c";
  ctx.fillRect(state.room.goal.c * cell + inset, state.room.goal.r * cell + inset, Math.max(1, cell - inset * 2), Math.max(1, cell - inset * 2));

  for (const player of state.room.players) {
    const isMe = player.id === state.playerId;
    const playerInset = isMe ? inset : Math.max(inset + 1, Math.floor(cell * 0.28));
    ctx.fillStyle = player.color || "#ffffff";
    ctx.fillRect(player.c * cell + playerInset, player.r * cell + playerInset, Math.max(1, cell - playerInset * 2), Math.max(1, cell - playerInset * 2));
  }

  updatePlayers();
}

function drawWall(x, y, cell, thickness, side, color) {
  ctx.fillStyle = color;
  if (side === 0) ctx.fillRect(x, y, cell, thickness);
  if (side === 1) ctx.fillRect(x + cell - thickness, y, thickness, cell);
  if (side === 2) ctx.fillRect(x, y + cell - thickness, cell, thickness);
  if (side === 3) ctx.fillRect(x, y, thickness, cell);
}

function updatePlayers() {
  if (!state.room) {
    els.players.textContent = "";
    return;
  }
  els.players.textContent = state.room.players.map((player) => player.name).join(" vs ");
  if (state.room.winner) setStatus(`${state.room.winner.name} won room ${state.room.code}`);
}

els.createRoom.addEventListener("click", createRoom);
els.joinRoom.addEventListener("click", joinRoom);
els.leaveRoom.addEventListener("click", leaveRoom);
els.copyCode.addEventListener("click", async () => {
  if (!state.room?.code) return;
  await navigator.clipboard?.writeText(state.room.code).catch(() => null);
  setStatus(`Copied room ${state.room.code}`);
});
els.gridColor.addEventListener("input", draw);
document.querySelectorAll("[data-move]").forEach((button) => button.addEventListener("click", () => move(button.dataset.move)));
window.addEventListener("resize", draw);
window.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  const direction = { arrowup: "up", w: "up", arrowright: "right", d: "right", arrowdown: "down", s: "down", arrowleft: "left", a: "left" }[key];
  if (!direction) return;
  event.preventDefault();
  move(direction);
});
