import { DurableObject } from 'cloudflare:workers';

const reply=(socket,data)=>{try{socket.send(JSON.stringify(data))}catch{}};
const cleanName=v=>String(v||'Spieler').trim().slice(0,20)||'Spieler';
const cleanCode=v=>String(v||'').trim().toUpperCase();
export class GameRoom extends DurableObject {
  constructor(ctx,env){super(ctx,env);this.players=new Map();this.started=false;this.code='';for(const ws of ctx.getWebSockets()){const meta=ws.deserializeAttachment()||{};this.players.set(ws,meta)}}
  async fetch(req){if(req.headers.get('Upgrade')!=='websocket')return new Response('WebSocket required',{status:426});if(this.players.size>=2)return new Response('Raum voll',{status:409});const pair=new WebSocketPair();const client=pair[0],server=pair[1];this.ctx.acceptWebSocket(server);this.players.set(server,{name:'Spieler',ready:false});return new Response(null,{status:101,webSocket:client})}
  broadcast(data,except){for(const s of this.players.keys())if(s!==except)reply(s,data)}
  async webSocketMessage(socket,raw){let m;try{m=JSON.parse(raw)}catch{return}const player=this.players.get(socket);if(!player)return;
    if(m.type==='hello'){player.name=cleanName(m.name);player.ready=true;socket.serializeAttachment(player);this.code=cleanCode(m.code);reply(socket,{type:'room',code:this.code});if(this.players.size===2){const arr=[...this.players.entries()];for(const [s,p] of arr)reply(s,{type:'start',code:this.code,opponent:arr.find(([other])=>other!==s)?.[1]?.name||'Gegner'});this.started=true;}else reply(socket,{type:'waiting'});return}
    if(!this.started)return;
    if(m.type==='state'&&Array.isArray(m.grid)){this.broadcast({type:'state',grid:m.grid.slice(0,20).map(r=>Array.isArray(r)?r.slice(0,10).map(v=>v?1:0):[]),score:Number(m.score)||0,lines:Number(m.lines)||0},socket)}
    if(m.type==='attack'){this.broadcast({type:'attack',count:Math.max(0,Math.min(8,Math.floor(Number(m.count)||0)))},socket)}
    if(m.type==='lose'){this.broadcast({type:'win'},socket);this.started=false}
    if(m.type==='leave'){this.remove(socket);try{socket.close(1000,'left')}catch{}}
  }
  remove(socket){if(!this.players.has(socket))return;this.players.delete(socket);this.started=false;this.broadcast({type:'left'});}
  async webSocketClose(s){this.remove(s)}
  async webSocketError(s){this.remove(s)}
}
export default {async fetch(request,env){const url=new URL(request.url);if(url.pathname==='/health')return Response.json({ok:true,app:'STACK POT',version:'154'});if(request.headers.get('Upgrade')!=='websocket')return new Response('STACK POT server online. WebSocket endpoint: /room/CODE',{headers:{'content-type':'text/plain;charset=utf-8'}});const match=url.pathname.match(/^\/room\/([A-Z0-9]{6})$/i);if(!match)return new Response('Use /room/ABC123',{status:400});const code=match[1].toUpperCase();const id=env.GAME_ROOMS.idFromName(code);return env.GAME_ROOMS.get(id).fetch(request)}};
