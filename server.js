// STACK POT – BLOCK PARTY · V76 multiplayer server (Best of 3)
const http = require('http');
const {WebSocketServer, WebSocket} = require('ws');
const PORT = process.env.PORT || 3000;
const clients = new Set(), waiting = [];
let sequence = 0;
const send = (ws, data) => {if(ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));};
const removeWaiting = ws => {let i=waiting.indexOf(ws);if(i>=0)waiting.splice(i,1);};
function unpair(ws, notify=true){
  removeWaiting(ws);
  const other=ws.opponent;
  ws.opponent=null;ws.playing=false;ws.match=null;
  if(other && other.opponent===ws){other.opponent=null;other.playing=false;other.match=null;if(notify)send(other,{type:'left'});}
}
function nextRound(m){
  m.round++;
  m.ended=false;
  m.at=Date.now()+3500;
  for(const p of m.players){p.playing=true;send(p,{type:'next_round',at:m.at,round:m.round,code:m.code});}
}
function finishRound(loser){
  const m=loser.match;
  if(!m || m.ended || !loser.playing || Date.now()<m.at) return;
  const winner=m.players.find(p=>p!==loser);
  m.ended=true;loser.playing=false;winner.playing=false;
  m.wins.set(winner,(m.wins.get(winner)||0)+1);
  for(const p of m.players){send(p,{type:'round_result',won:p===winner,wins:m.wins.get(p)||0,losses:m.wins.get(p===winner?loser:winner)||0});}
  if(m.wins.get(winner)>=2){
    for(const p of m.players){send(p,{type:'match_end',won:p===winner,wins:m.wins.get(p)||0,losses:m.wins.get(p===winner?loser:winner)||0});p.playing=false;p.match=null;p.opponent=null;}
  }else{setTimeout(()=>{if(m.players.every(p=>p.match===m&&p.readyState===WebSocket.OPEN))nextRound(m);},2200);}
}
function match(){
  while(waiting.length>=2){
    const a=waiting.shift(),b=waiting.shift();
    if(a.readyState!==WebSocket.OPEN||a.opponent){if(b.readyState===WebSocket.OPEN&&!b.opponent)waiting.unshift(b);continue;}
    if(b.readyState!==WebSocket.OPEN||b.opponent){waiting.unshift(a);continue;}
    const m={players:[a,b],wins:new Map([[a,0],[b,0]]),round:1,ended:false,code:`SP${String(++sequence).padStart(4,'0')}`,at:Date.now()+3500};
    a.opponent=b;b.opponent=a;a.match=b.match=m;a.playing=b.playing=true;
    send(a,{type:'start',code:m.code,at:m.at,opponent:b.playerName});
    send(b,{type:'start',code:m.code,at:m.at,opponent:a.playerName});
  }
}
const server=http.createServer((req,res)=>{
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.end(JSON.stringify({ok:true,game:'STACK POT – BLOCK PARTY',multiplayer:'online',players:clients.size,waiting:waiting.length}));
});
const wss=new WebSocketServer({server,path:'/match',maxPayload:16000});
wss.on('connection',ws=>{
  clients.add(ws);ws.playerName='Spieler';ws.opponent=null;ws.playing=false;ws.match=null;
  ws.on('message',raw=>{
    let msg;try{msg=JSON.parse(raw.toString());}catch{return;}
    if(!msg||typeof msg.type!=='string')return;
    if(msg.type==='match'){
      unpair(ws);ws.playerName=String(msg.name||'Spieler').trim().slice(0,20)||'Spieler';
      if(!waiting.includes(ws))waiting.push(ws);
      send(ws,{type:'waiting'});match();
    }else if(msg.type==='leave'){unpair(ws);send(ws,{type:'left'});}
    else if(ws.opponent&&ws.playing&&ws.match&&!ws.match.ended){
      if(msg.type==='state'){
        if(!Array.isArray(msg.grid))return;
        const grid=msg.grid.slice(0,20).map(row=>Array.isArray(row)?row.slice(0,10).map(v=>v?1:0):[]);
        send(ws.opponent,{type:'state',grid,score:Number(msg.score)||0,lines:Number(msg.lines)||0});
      }else if(msg.type==='attack'){
        if(Date.now()>=ws.match.at)send(ws.opponent,{type:'attack',count:Math.max(0,Math.min(8,Math.floor(Number(msg.count)||0)))});
      }else if(msg.type==='round_lost'||msg.type==='lose'||msg.type==='lost')finishRound(ws);
    }
  });
  ws.on('close',()=>{unpair(ws);clients.delete(ws);match();});
  ws.on('error',()=>{});
});
server.listen(PORT,'0.0.0.0',()=>console.log(`STACK POT multiplayer listening on ${PORT}`));
