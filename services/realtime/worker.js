import {packPacket} from '../../public/game/wire.js';
import {verifyToken,verifyService,signedHeaders} from '../../lib/security.js';
import {advanceMatch,runCommand,envelope} from '../../lib/match-engine.js';
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
async function site(env,path,data){const body=JSON.stringify(data),options={method:'POST',headers:await signedHeaders(body,env.REALTIME_SHARED_SECRET),body,signal:AbortSignal.timeout(7000)},response=env.SITES?await env.SITES.fetch('https://sites.internal/api/internal/'+path,options):await fetch(new URL('/api/internal/'+path,env.SITE_ORIGIN),options);if(!response.ok)throw new Error('Account service unavailable');return response.json();}
export default {
 async fetch(request,env){
  try{
   const url=new URL(request.url);if(url.pathname==='/health')return json({ok:true,protocol:1});
   const match=url.pathname.match(/^\/matches\/([a-zA-Z0-9-]{1,64})\/(socket|snapshot|command)$/);if(!match)return json({error:'Not found.'},404);
   if(!env.REALTIME_SHARED_SECRET||!env.SITE_ORIGIN)return json({error:'Realtime service is not configured.'},503);
   if(match[2]==='socket'){
    if(request.headers.get('Upgrade')?.toLowerCase()!=='websocket')return json({error:'WebSocket upgrade required.'},426);
    const claims=await verifyToken(url.searchParams.get('ticket'),env.REALTIME_SHARED_SECRET,{aud:'arena-room'});
    if(!claims||claims.match!==match[1]||claims.origin!==env.SITE_ORIGIN||request.headers.get('Origin')!==env.SITE_ORIGIN)return json({error:'Connection ticket is invalid or expired.'},403);
   }else{if(request.method!=='POST')return json({error:'POST required.'},405);const raw=await request.clone().text();if(raw.length>4096||!await verifyService(request,raw,env.REALTIME_SHARED_SECRET))return json({error:'Service authentication required.'},401);}
   return env.MATCHES.getByName(match[1]).fetch(request);
  }catch(error){console.warn('Realtime gateway error');return json({error:'Match service is reconnecting.'},503);}
 }
};
export class MatchRoom {
 constructor(ctx,env){this.ctx=ctx;this.env=env;this.room=null;this.serial=Promise.resolve();this.timer=null;this.lastSaved=0;this.ready=ctx.blockConcurrencyWhile(async()=>{this.room=await ctx.storage.get('room')||null;if(this.room?.g.status==='playing')this.schedule();});}
 queue(fn){const next=this.serial.then(fn);this.serial=next.catch(()=>{});return next;}
 async bootstrap(id){
  if(this.room)return;
  const source=await site(this.env,'bootstrap',{id});if(source.row.transport!=='realtime'||!source.participants?.[0]||!source.participants?.[1])throw new Error('Invalid room bootstrap');
  const g=typeof source.row.state==='string'?JSON.parse(source.row.state):source.row.state;if(!g?.towers||!['playing','ended'].includes(g.status))throw new Error('Room is not ready');
  this.room={row:{id:source.row.id,stake:source.row.stake,asset:source.row.asset,transport:'realtime'},participants:source.participants,g,lastTick:source.row.last_tick,sequence:source.row.version||1,createdAt:Date.now()};
  await this.save();this.schedule();
 }
 async save(candidate=this.room){await this.ctx.storage.put('room',candidate);this.lastSaved=Date.now();await this.ctx.storage.setAlarm(Date.now()+(candidate.g.status==='playing'?5000:30000));}
 schedule(){if(this.timer||this.room?.g.status!=='playing')return;this.timer=setTimeout(()=>{this.timer=null;this.queue(async()=>{await this.advance();this.broadcast();}).catch(()=>{console.warn('Room tick will recover');}).finally(()=>this.schedule());},100);}
 async advance(){
  if(!this.room||this.room.g.status!=='playing')return;const now=Date.now(),r=this.room,elapsed=Math.max(0,(now-r.lastTick)/1000);let frame=null;
  if(r.g.market&&r.g.time+elapsed+1e-6>=r.g.market.nextUpdate){try{frame=await site(this.env,'market',{});}catch{frame=null;}}
  const ran=advanceMatch(r.g,elapsed,frame);if(ran){r.lastTick+=ran*1000;r.sequence++;}
  if(r.g.status==='ended'){
   await this.ctx.storage.put({room:r,outbox:{id:r.row.id,state:r.g,attempts:0}});await this.ctx.storage.setAlarm(now+1000);clearTimeout(this.timer);this.timer=null;
  }else if(now-this.lastSaved>=1000)await this.save();
 }
 packet(side,result={ok:true}){return envelope({...this.room.row,version:this.room.sequence},this.room.g,side,result);}
 broadcast(){if(!this.room)return;for(const ws of this.ctx.getWebSockets()){try{const a=ws.deserializeAttachment();ws.send(JSON.stringify(packPacket({type:'snapshot',...this.packet(a.side)})));}catch{try{ws.close(1011,'Reconnect to the room');}catch{}}}}
 async command(side,action){
  const prior=this.room.g.commands?.find(c=>c.id===side+':'+action.actionId);if(prior)return {...this.packet(side,prior.result),actionId:action.actionId};
  await this.advance();const candidate=structuredClone(this.room),result=runCommand(candidate.g,side,action);candidate.sequence++;
  // Persist the complete accepted/rejected command receipt before acknowledging.
  if(candidate.g.status==='ended'){await this.ctx.storage.put({room:candidate,outbox:{id:candidate.row.id,state:candidate.g,attempts:0}});await this.ctx.storage.setAlarm(Date.now()+1000);}
  else await this.save(candidate);
  this.room=candidate;this.broadcast();return {...this.packet(side,result),actionId:action.actionId};
 }
 async fetch(request){
  await this.ready;
  try{return await this.queue(async()=>{
   const url=new URL(request.url),id=url.pathname.split('/')[2],operation=url.pathname.split('/')[3];await this.bootstrap(id);
   if(operation==='socket'){
    const claims=await verifyToken(url.searchParams.get('ticket'),this.env.REALTIME_SHARED_SECRET,{aud:'arena-room'});
    if(!claims||claims.match!==this.room.row.id||claims.origin!==this.env.SITE_ORIGIN||request.headers.get('Origin')!==this.env.SITE_ORIGIN||![0,1].includes(claims.side)||this.room.participants[claims.side]!==claims.player||typeof claims.jti!=='string')return json({error:'Not a participant.'},403);
    if(await this.ctx.storage.get('ticket:'+claims.jti))return json({error:'Connection ticket was already used.'},409);
    await this.ctx.storage.put('ticket:'+claims.jti,claims.exp);this.room.connections??={};this.room.connections[claims.side]=claims.jti;await this.save();
    for(const old of this.ctx.getWebSockets('side:'+claims.side)){try{old.close(4001,'A new connection replaced this one');}catch{}}
    const [client,server]=Object.values(new WebSocketPair());this.ctx.acceptWebSocket(server,['side:'+claims.side]);server.serializeAttachment({side:claims.side,player:claims.player,jti:claims.jti,window:Date.now(),count:0});
    await this.advance();server.send(JSON.stringify(packPacket({type:'snapshot',...this.packet(claims.side)})));this.schedule();return new Response(null,{status:101,webSocket:client});
   }
   const raw=await request.text();if(!await verifyService(request,raw,this.env.REALTIME_SHARED_SECRET))return json({error:'Unauthorized.'},401);const data=JSON.parse(raw),side=this.room.participants.indexOf(data.player);if(side<0||side!==data.side)return json({error:'Not a participant.'},403);
   if(operation==='command')return json(await this.command(side,data.action));await this.advance();return json(this.packet(side));
  });}catch(error){console.warn('Room request failed');return json({error:'The room is reconnecting. Retry the same command ID.'},503);}
 }
 async webSocketMessage(ws,message){
  if(typeof message!=='string'||message.length>1024){ws.close(1009,'Message too large');return;}
  let data;try{data=JSON.parse(message);}catch{ws.close(1007,'Invalid JSON');return;}
  if(!data||typeof data!=='object'||Array.isArray(data)){ws.close(1007,'Invalid command object');return;}
  const a=ws.deserializeAttachment();if(!a){ws.close(1008,'Not a participant');return;}
  const now=Date.now();if(now-a.window>=1000){a.window=now;a.count=0;}a.count++;ws.serializeAttachment(a);if(a.count>12){ws.send(JSON.stringify({type:'error',actionId:data.actionId,error:'Too many commands. Wait a moment.',retry:true}));return;}
  // Answered outside the room queue so round-trip time measures the network, not queued ticks.
  if(data.type==='ping'){ws.send(JSON.stringify({type:'pong',at:Number(data.at)||0}));return;}
  return this.queue(async()=>{
   if(this.room?.participants[a.side]!==a.player||this.room.connections?.[a.side]!==a.jti){ws.close(1008,'Not a participant');return;}
   if(!['deploy','surrender'].includes(data.type)||typeof data.actionId!=='string'||!/^[a-zA-Z0-9-]{8,64}$/.test(data.actionId)){ws.send(JSON.stringify({type:'error',actionId:data.actionId,error:'Invalid command.'}));return;}
   try{const packet=await this.command(a.side,data);ws.send(JSON.stringify(packPacket({type:'ack',...packet})));}catch{ws.send(JSON.stringify({type:'error',actionId:data.actionId,error:'The room is recovering. Your command will be retried.',retry:true}));}
  });
 }
 async webSocketClose(ws,code,reason){try{ws.close(code===1006?1011:code,reason);}catch{}}
 async webSocketError(ws){try{ws.close(1011,'Reconnect');}catch{}}
 async alarm(){
  await this.ready;return this.queue(async()=>{
   await this.advance();this.broadcast();const outbox=await this.ctx.storage.get('outbox');
   if(outbox){try{const result=await site(this.env,'settle',{id:outbox.id,state:outbox.state});if(result.recorded&&result.settled)await this.ctx.storage.delete('outbox');else throw new Error('Settlement pending');}catch{outbox.attempts++;await this.ctx.storage.put('outbox',outbox);await this.ctx.storage.setAlarm(Date.now()+Math.min(60000,1000*2**Math.min(outbox.attempts,6)));return;}}
   const tickets=await this.ctx.storage.list({prefix:'ticket:'}),expired=[];for(const [key,expiry] of tickets)if(expiry<Date.now())expired.push(key);if(expired.length)await this.ctx.storage.delete(expired);
   if(this.room?.g.status==='playing'){this.schedule();await this.ctx.storage.setAlarm(Date.now()+5000);}
   else if(this.room&&Date.now()-this.room.createdAt>86400000)await this.ctx.storage.deleteAll();
   else await this.ctx.storage.setAlarm(Date.now()+3600000);
  });
 }
}
