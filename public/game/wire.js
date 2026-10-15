// Compact frames carry every field the simulation reads, at full precision, so clients can predict from them.
const kinds=['spawn','poof','heal','bolt','hit'],types=['Fire','Electric','Nature','Ice','Shadow','Earth','Water','Metal','Light'],states=['live','no-baseline','stale'],actions=['idle','move','attack'];
const n=x=>Number.isFinite(x)?Math.round(x*100)/100:0,v=x=>Number.isFinite(x)?x:0;
export function packPacket(packet){
 if(!packet.state)return packet;const {state:g,...rest}=packet;
 return {...rest,wire:1,frame:{t:g.time,s:g.status,w:g.winner,n:g.names,e:g.elixir,l:g.levels,h:g.hand,q:g.queue,d:g.decks,c:g.score,i:g.nextId,x:g.fxSeq||0,
  u:g.units.map(u=>[u.id,u.card,u.p,v(u.x),v(u.y),v(u.hp),u.maxHp,actions.indexOf(u.action),u.baby?1:0,v(u.slow),v(u.stun),v(u.facingX),v(u.facingY),v(u.cd),v(u.healCd),v(u.age),u.charged?1:0]),
  v:g.towers.map(t=>[t.id,t.p,t.x,t.y,v(t.hp),t.maxHp,t.king?1:0,v(t.cd),t.range]),
  f:g.effects.map(e=>[e.id,kinds.indexOf(e.kind),n(e.x),n(e.y),e.tx==null?null:n(e.tx),e.ty==null?null:n(e.ty),e.attacker??null,e.victim??null,e.card??null,e.p??null,e.power==null?null:n(e.power),e.splash||0,e.attackerAir?1:0,e.targetAir?1:0,e.color,n(e.ttl),types.indexOf(e.type)]),
  m:g.market?[g.market.multipliers,g.market.status.map(s=>states.indexOf(s)),g.market.nextUpdate,g.market.startedAt,g.market.sequence||0,g.market.source||null]:null}};
}
export function unpackPacket(packet){
 if(packet?.wire!==1)return packet;const {wire,frame:f,...rest}=packet;if(!f||!Array.isArray(f.u)||f.u.length>120||!Array.isArray(f.v)||f.v.length!==6||!Array.isArray(f.f)||f.f.length>120)throw new Error('Invalid room frame');
 return {...rest,state:{time:f.t,status:f.s,winner:f.w,names:f.n,elixir:f.e,levels:f.l,hand:f.h,queue:f.q,decks:f.d,score:f.c,nextId:f.i,fxSeq:f.x,
  units:f.u.map(u=>({id:u[0],card:u[1],p:u[2],x:u[3],y:u[4],hp:u[5],maxHp:u[6],action:actions[u[7]]||'idle',baby:!!u[8],slow:u[9],stun:u[10],facingX:u[11],facingY:u[12],cd:u[13],healCd:u[14],age:u[15],charged:!!u[16]})),
  towers:f.v.map(t=>({id:t[0],p:t[1],x:t[2],y:t[3],hp:t[4],maxHp:t[5],king:!!t[6],cd:t[7],range:t[8]})),
  effects:f.f.map(e=>({id:e[0],kind:kinds[e[1]],x:e[2],y:e[3],tx:e[4]??undefined,ty:e[5]??undefined,attacker:e[6]??undefined,victim:e[7]??undefined,card:e[8]??undefined,p:e[9]??undefined,power:e[10]??undefined,splash:e[11],attackerAir:!!e[12],targetAir:!!e[13],color:e[14],ttl:e[15],type:types[e[16]]})),
  market:f.m?{multipliers:f.m[0],status:f.m[1].map(i=>states[i]||'stale'),nextUpdate:f.m[2],startedAt:f.m[3],sequence:f.m[4]||0,source:f.m[5]||undefined}:null}};
}
