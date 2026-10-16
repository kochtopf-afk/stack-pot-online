// STACK POT – BLOCK PARTY | Render multiplayer server
const http = require('http');
const { WebSocketServer, WebSocket } = require('ws');
const PORT = process.env.PORT || 3000;
const clients = new Set();
const waiting = [];
let sequence = 0;
const send = (ws, data) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data)); };
const removeWaiting = ws => { const i = waiting.indexOf(ws); if (i !== -1) waiting.splice(i, 1); };
const validGrid = grid => Array.isArray(grid) && grid.slice(0,20).map(row => Array.isArray(row) ? row.slice(0,10).map(v => v ? 1 : 0) : []);
function unpair(ws, notify = true) {
  removeWaiting(ws);
  const opponent = ws.opponent;
  ws.opponent = null;
  ws.playing = false;
  if (opponent && opponent.opponent === ws) {
    opponent.opponent = null;
    opponent.playing = false;
    if (notify) send(opponent, { type: 'left' });
  }
}
function match() {
  while (waiting.length >= 2) {
    const a = waiting.shift(), b = waiting.shift();
    if (a.readyState !== WebSocket.OPEN || a.opponent) { if (b.readyState === WebSocket.OPEN) waiting.unshift(b); continue; }
    if (b.readyState !== WebSocket.OPEN || b.opponent) { waiting.unshift(a); continue; }
    a.opponent = b; b.opponent = a; a.playing = b.playing = true;
    const code = `SP${String(++sequence).padStart(4,'0')}`;
    send(a, { type: 'start', code, opponent: b.playerName });
    send(b, { type: 'start', code, opponent: a.playerName });
  }
}
const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify({ ok: true, game: 'STACK POT – BLOCK PARTY', multiplayer: 'online', players: clients.size, waiting: waiting.length }));
});
const wss = new WebSocketServer({ server, path: '/match', maxPayload: 16000 });
wss.on('connection', ws => {
  clients.add(ws); ws.playerName = 'Spieler'; ws.opponent = null; ws.playing = false;
  ws.on('message', raw => {
    let msg; try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (!msg || typeof msg.type !== 'string') return;
    if (msg.type === 'match') {
      unpair(ws);
      ws.playerName = String(msg.name || 'Spieler').trim().slice(0,20) || 'Spieler';
      if (!waiting.includes(ws)) waiting.push(ws);
      send(ws, { type: 'waiting' }); match();
    } else if (msg.type === 'leave') {
      unpair(ws); send(ws, { type: 'left' });
    } else if (ws.opponent && ws.playing) {
      if (msg.type === 'state') {
        const grid = validGrid(msg.grid);
        if (grid) send(ws.opponent, { type:'state', grid, score:Number(msg.score)||0, lines:Number(msg.lines)||0 });
      } else if (msg.type === 'attack') {
        send(ws.opponent, { type:'attack', count:Math.max(0,Math.min(8,Math.floor(Number(msg.count)||0))) });
      } else if (msg.type === 'lose') {
        send(ws.opponent, { type:'win' }); ws.playing = false; ws.opponent.playing = false;
      }
    }
  });
  ws.on('close', () => { unpair(ws); clients.delete(ws); match(); });
  ws.on('error', () => {});
});
server.listen(PORT, '0.0.0.0', () => console.log(`STACK POT multiplayer listening on ${PORT}`));
