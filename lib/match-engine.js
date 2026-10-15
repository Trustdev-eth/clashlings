import {step,deploy,STEP} from '../public/game/engine.js';
import {updateMarket} from '../public/game/tokens.js';
import {playerSnapshot} from '../public/game/snapshots.js';
export const SCHEDULE_WINDOW=.5;
// Deploys that arrive before the moment the client predicted them wait until then, so both agree on elixir and position.
export function runCommand(g,side,action){
 if(!action)return {ok:true};
 if(typeof action.actionId!=='string'||!/^[a-zA-Z0-9-]{8,64}$/.test(action.actionId))return {ok:false,error:'Command ID required.'};
 g.commands??=[];const key=side+':'+action.actionId,old=g.commands.find(c=>c.id===key);if(old)return old.result;
 if(g.scheduled?.some(c=>c.id===key))return {ok:true,scheduled:true};
 if(action.type==='deploy'&&g.status==='playing'&&Number.isFinite(action.at)&&action.at>g.time+1e-6&&action.at<=g.time+SCHEDULE_WINDOW){g.scheduled??=[];g.scheduled.push({id:key,side,at:action.at,action:{type:action.type,slot:action.slot,card:action.card,x:action.x,y:action.y,actionId:action.actionId}});return {ok:true,scheduled:true};}
 let result={ok:true};
 if(g.status!=='playing')result={ok:false,error:'The battle has ended.'};
 else if(action.type==='surrender'){g.status='ended';g.winner=1-side;}
 else if(action.type==='deploy')result=action.card!==undefined&&action.card!==g.hand[side][action.slot]?{ok:false,error:'Your hand changed. Choose the card again.'}:deploy(g,side,action.slot,action.x,action.y);
 else result={ok:false,error:'Action not found.'};
 g.commands.push({id:key,result});g.commands=[...g.commands.filter(c=>c.result.ok).slice(-160),...g.commands.filter(c=>!c.result.ok).slice(-32)];return result;
}
function runScheduled(g){
 if(!g.scheduled?.length)return;const due=g.scheduled.filter(c=>c.at<=g.time+1e-6).sort((a,b)=>a.at-b.at);if(!due.length)return;g.scheduled=g.scheduled.filter(c=>!due.includes(c));
 for(const c of due){const slot=g.hand[c.side].indexOf(c.action.card);runCommand(g,c.side,{...c.action,slot:slot<0?c.action.slot:slot});}
}
export function advanceMatch(g,seconds,frame){
 if(g.status!=='playing')return 0;const steps=Math.max(0,Math.min(1600,Math.floor(Math.min(160,Math.max(0,seconds))/STEP+1e-6)));let advanced=0;
 for(let i=0;i<steps&&g.status==='playing';i++){
  if(g.market&&g.time+1e-6>=g.market.nextUpdate)updateMarket(g,frame,g.time);
  runScheduled(g);step(g);advanced+=STEP;
 }
 if(g.status==='playing'){if(g.market&&g.time+1e-6>=g.market.nextUpdate)updateMarket(g,frame,g.time);runScheduled(g);}
 return advanced;
}
export function processedCommands(g,side){const prefix=side+':',own=(g.commands||[]).filter(c=>c.id.startsWith(prefix));return [...own.filter(c=>c.result.ok).slice(-16),...own.filter(c=>!c.result.ok).slice(-8)].map(c=>c.id.slice(prefix.length));}
export function envelope(row,g,side,result={ok:true},now=Date.now()){return {id:row.id,side,stake:row.stake,asset:row.asset||'credits',sequence:Math.round((g.time||0)*1000)*1000+(row.version||0),serverTime:now,transport:row.transport||'http',acks:processedCommands(g,side),state:playerSnapshot(g,side),...(!result.ok?{error:result.error}:{})};}
