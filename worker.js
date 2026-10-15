import { DurableObject } from 'cloudflare:workers';

function send(socket, message) {
  try { socket.send(JSON.stringify(message)); } catch (_) {}
}
function cleanName(value) { return String(value || 'Spieler').trim().slice(0, 24); }
function cleanCode(value) { return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 40); }

export class GameRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.players = new Map();
    for (const socket of ctx.getWebSockets()) {
      this.players.set(socket, socket.deserializeAttachment() || { name: 'Spieler', ready: false, peer: null });
    }
  }
  save(socket) {
    const player = this.players.get(socket);
    if (player) socket.serializeAttachment(player);
  }
  async fetch(request) {
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('WebSocket required', { status: 426 });
    }
    const pair = new WebSocketPair();
    const server = pair[1];
    this.ctx.acceptWebSocket(server);
    this.players.set(server, { id: crypto.randomUUID(), name: 'Spieler', ready: false, peer: null });
    this.save(server);
    send(server, { type: 'connected' });
    return new Response(null, { status: 101, webSocket: pair[0] });
  }
  peer(socket) {
    const peerId = this.players.get(socket)?.peer;
    if (!peerId) return null;
    for (const [candidate, player] of this.players) {
      if (player.id === peerId) return candidate;
    }
    return null;
  }
  pair(socket) {
    const player = this.players.get(socket);
    if (!player || player.peer) return;
    for (const [otherSocket, other] of this.players) {
      if (otherSocket === socket || !other.ready || other.peer) continue;
      player.peer = other.id;
      other.peer = player.id;
      player.ready = false;
      other.ready = false;
      this.save(socket);
      this.save(otherSocket);
      send(socket, { type: 'start', code: 'AUTO', opponent: other.name });
      send(otherSocket, { type: 'start', code: 'AUTO', opponent: player.name });
      return;
    }
    send(socket, { type: 'waiting' });
  }
  async webSocketMessage(socket, raw) {
    let message;
    try { message = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw)); }
    catch (_) { return; }
    const player = this.players.get(socket);
    if (!player || !message || typeof message !== 'object') return;
    if (message.type === 'hello') {
      player.name = cleanName(message.name);
      this.save(socket);
      send(socket, { type: 'hello', name: player.name });
      return;
    }
    if (message.type === 'match' || message.type === 'search') {
      player.name = cleanName(message.name || player.name);
      if (player.peer) { send(socket, { type: 'error', message: 'Already in match' }); return; }
      player.ready = true;
      this.save(socket);
      this.pair(socket);
      return;
    }
    if (message.type === 'cancel') {
      player.ready = false;
      this.save(socket);
      send(socket, { type: 'cancelled' });
      return;
    }
    if (message.type === 'leave') {
      this.remove(socket);
      try { socket.close(1000, 'left'); } catch (_) {}
      return;
    }
    const other = this.peer(socket);
    if (!other) return;
    if (message.type === 'state' && Array.isArray(message.grid)) {
      send(other, { type: 'state', grid: message.grid, score: message.score, lines: message.lines });
    } else if (message.type === 'attack') {
      send(other, { type: 'attack', count: message.count });
    } else if (message.type === 'lose') {
      send(other, { type: 'win' });
    }
  }
  remove(socket) {
    const other = this.peer(socket);
    if (other) {
      const opponent = this.players.get(other);
      if (opponent) {
        opponent.peer = null;
        opponent.ready = false;
        this.save(other);
        send(other, { type: 'left' });
      }
    }
    this.players.delete(socket);
  }
  async webSocketClose(socket) { this.remove(socket); }
  async webSocketError(socket) { this.remove(socket); }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/health') {
      return Response.json({ ok: true, app: 'STACK POT', matchmaking: true });
    }
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('STACK POT server online. WebSocket endpoint: /match or /room/CODE');
    }
    if (!env.GAME_ROOMS) return new Response('Missing GAME_ROOMS binding', { status: 500 });
    let room;
    if (url.pathname === '/match') {
      room = 'PUBLIC_MATCHMAKING_V155';
    } else if (url.pathname.startsWith('/room/')) {
      const code = cleanCode(url.pathname.slice('/room/'.length));
      if (!code) return new Response('Room code required', { status: 400 });
      room = `PRIVATE_${code}`;
    } else {
      return new Response('Use /match or /room/CODE', { status: 404 });
    }
    const id = env.GAME_ROOMS.idFromName(room);
    return env.GAME_ROOMS.get(id).fetch(request);
  }
};
