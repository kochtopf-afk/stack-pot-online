import { DurableObject } from 'cloudflare:workers';

const send = (s, m) => {
  try { s.send(JSON.stringify(m)); } catch {}
};

export class GameRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.players = new Map();
    for (const s of ctx.getWebSockets()) {
      this.players.set(s, s.deserializeAttachment() || {});
    }
  }

  save(s) {
    s.serializeAttachment(this.players.get(s));
  }

  async fetch(req) {
    if (req.headers.get('Upgrade')?.toLowerCase() !== 'websocket')
      return new Response('WebSocket required', { status: 426 });

    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]);
    this.players.set(pair[1], { ready: false, peer: null });
    this.save(pair[1]);

    return new Response(null, {
      status: 101,
      webSocket: pair[0]
    });
  }

  peer(s) {
    const id = this.players.get(s)?.peer;
    return [...this.players.keys()].find(
      x => this.players.get(x)?.id === id
    );
  }

  async webSocketMessage(s, raw) {
    let m;
    try { m = JSON.parse(raw); } catch { return; }

    const p = this.players.get(s);
    if (!p) return;

    if (m.type === 'hello' || m.type === 'match') {
      p.name = String(m.name || 'Spieler').slice(0, 20);
      p.id ||= crypto.randomUUID();
      p.ready = true;
      this.save(s);

      const other = [...this.players.keys()].find(x =>
        x !== s &&
        this.players.get(x)?.ready &&
        !this.players.get(x)?.peer
      );

      if (other) {
        const op = this.players.get(other);
        p.peer = op.id;
        op.peer = p.id;
        this.save(s);
        this.save(other);

        send(s, {
          type: 'start',
          code: 'AUTO',
          opponent: op.name
        });

        send(other, {
          type: 'start',
          code: 'AUTO',
          opponent: p.name
        });
      } else {
        send(s, { type: 'waiting' });
      }
      return;
    }

    const other = this.peer(s);

    if (m.type === 'leave') {
      this.remove(s);
      s.close(1000, 'left');
      return;
    }

    if (!other) return;

    if (m.type === 'state' && Array.isArray(m.grid))
      send(other, {
        type: 'state',
        grid: m.grid,
        score: m.score,
        lines: m.lines
      });

    if (m.type === 'attack')
      send(other, {
        type: 'attack',
        count: m.count
      });

    if (m.type === 'lose')
      send(other, { type: 'win' });
  }

  remove(s) {
    const
