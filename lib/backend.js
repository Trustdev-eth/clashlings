import {newGame,validDeck,DEFAULT_DECK} from '../public/game/engine.js';
import {sessionIdentity,walletAuth} from './wallet-auth.js';
import {getMarket} from './market.js';
import {marketBaseline} from '../public/game/tokens.js';
import {rewardStatus} from './rewards.js';
import {contractConfig,tokenOracleRequired,tokenLevels,prepareIntent,verifyIntent,adapter,toUnits,syncStakes} from './contracts.js';
import {advanceMatch,runCommand,envelope} from './match-engine.js';
import {realtimeReady,realtimeTicket,roomRequest,realtimeHealthy} from './realtime-bridge.js';
import {verifyService,sha256} from './security.js';
const json=(x,status=200)=>new Response(JSON.stringify(x),{status,headers:{'Content-Type':'application/json','Cache-Control':'private, no-store'}});
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const name=n=>String(n||'Trainer').replace(/[<>\x00-\x1f]/g,'').trim().slice(0,16)||'Trainer';
const stakes=[25,50,100],TOKEN_WAIT_MS=600000,TOKEN_FUND_MS=240000;
const openRankedToken="asset='token' AND mode='ranked' AND stake=? AND p0<>? AND p1 IS NULL AND status IN ('waiting','funding') AND (expires_at>? OR EXISTS(SELECT 1 FROM holds h WHERE h.match_id=matches.id))";
const readPlayer=(db,id)=>db.prepare('SELECT * FROM players WHERE id=?').bind(id).first();
const publicPlayer=p=>({name:p.name,deck:JSON.parse(p.deck),levels:JSON.parse(p.levels),balance:p.balance,wins:p.wins,losses:p.losses,trophies:p.trophies,tokenEarned:p.token_earned||0});
const holdFor=(db,id)=>db.prepare('SELECT m.* FROM holds h JOIN matches m ON m.id=h.match_id WHERE h.player_id=?').bind(id).first();
export async function api(request,env){
 try{
  const db=env.DB;if(!db)return json({error:'Online play is unavailable. You can still practice.'},503);
  const url=new URL(request.url),path=url.pathname.replace(/^\/api\/?/,'').split('/'),now=Date.now();
  if(request.method==='POST'&&request.headers.get('origin')&&request.headers.get('origin')!==url.origin)fail(403,'Use this site to make changes.');
  if(request.method==='POST'&&!(request.headers.get('content-type')||'').includes('application/json'))fail(415,'Send JSON.');
  let body={},raw='';if(request.method==='POST'){const text=raw=await request.text();if(text.length>(path[0]==='internal'?256000:8192))fail(413,'Request is too large.');try{body=JSON.parse(text);}catch{fail(400,'Invalid JSON.');}if(!body||typeof body!=='object'||Array.isArray(body))fail(400,'Send a JSON object.');}
  if(path[0]==='contract-receipt'){if(request.method!=='POST'||!await verifyService(request,raw,env.CONTRACT_ADAPTER_KEY,now))fail(401,'Contract service authentication required.');const intent=await db.prepare('SELECT player_id FROM token_intents WHERE id=?').bind(body.intentId).first();if(!intent)fail(404,'Transaction request not found.');const result=await verifyIntent(db,env,intent.player_id,body.intentId,body.signature,now);if(result.pending)return json({pending:true},202);const funding=result.row.kind==='escrow'?await fundTokenMatch(db,env,result.row,now):{};return json({confirmed:true,...funding});}
  if(path[0]==='internal')return await internal(request,env,path[1],body,raw,now);
  if(path[0]==='runtime')return json({walletConnectProjectId:env.WALLETCONNECT_PROJECT_ID||null,contracts:contractConfig(env),realtime:realtimeReady(env),marketConfigured:env.MARKET_SOURCE!=='off'});
  if(path[0]==='market'){const market=await getMarket(env,now);return new Response(JSON.stringify(market),{headers:{'Content-Type':'application/json','Cache-Control':'public,max-age=5'}});}
  if(path[0]==='auth'&&path[1]==='wallet')return await walletAuth(request,env,path[2],body,now);
  const identity=await sessionIdentity(request,db,now),owner=identity?.owner||request.headers.get('oai-authenticated-user-id');if(!owner)fail(401,'Connect and sign in with a Solana wallet to create your trainer account.');
  if(identity&&request.method==='POST'&&request.headers.get('origin')!==url.origin)fail(403,'Use this site to make changes.');
  // Combat traffic bypasses unrelated profile/hold reads.
  if(path[0]==='match'&&path[1])return await handleMatch(db,request,env,path,body,owner,now,url.origin);
  const held=await holdFor(db,owner);if(held&&held.expires_at<now){if(held.asset==='token'&&held.status==='waiting'){/* funded token rooms stay joinable until cancel */}else if(held.status==='waiting'||held.status==='funding')await cancel(db,held,now);else if(held.status==='playing')await tick(db,held.id,owner,now,null,env,held);}
  if(path[0]==='profile'&&request.method==='POST'){
   const deck=body.deck??DEFAULT_DECK;if(!validDeck(deck))fail(400,'Choose eight different creatures.');
   const old=await readPlayer(db,owner);if(old&&await holdFor(db,owner)&&old.deck!==JSON.stringify(deck))fail(409,'Finish or cancel your battle before changing your deck.');
   await db.prepare('INSERT INTO players (id,name,deck,levels,created_at) VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,deck=excluded.deck').bind(owner,name(body.name),JSON.stringify(deck),JSON.stringify(Array(12).fill(1)),now).run();
   return json(publicPlayer(await readPlayer(db,owner)));
  }
  const p=await readPlayer(db,owner);if(!p)fail(409,'Create your trainer profile first.');
  if(path[0]==='profile'){const hold=await holdFor(db,owner);return json({...publicPlayer(p),wallet:identity?.wallet||null,activeMatch:hold?{id:hold.id,status:hold.status,mode:hold.mode,code:hold.code,stake:hold.stake,asset:hold.asset}:null});}
  if(path[0]==='rewards'){
   if(request.method!=='GET')fail(410,'Daily credit rewards are retired. Win GAME by staking it in token battles.');
   return json(await rewardStatus(db,owner));
  }
  if(path[0]==='token')return await tokenRoute(request,env,path,body,p,identity,now,url.origin);
  if(path[0]==='ledger')return json({entries:(await db.prepare('SELECT delta,kind,created_at FROM ledger WHERE player_id=? ORDER BY created_at DESC,rowid DESC LIMIT 40').bind(owner).all()).results});
  if(path[0]==='ranks')return json({players:(await db.prepare('SELECT name,wins,losses,token_earned AS tokenEarned FROM players ORDER BY token_earned DESC,wins DESC,name ASC LIMIT 30').all()).results,currency:'GAME'});
  if(path[0]==='queue'||path[0]==='rooms'||path[0]==='upgrade')fail(410,'Credit battles and credit upgrades are retired. Stake GAME in the token arena.');
  return json({error:'Route not found.'},404);
 }catch(e){if(e.status)return json({error:e.message},e.status);if(/Insufficient credits|NOT NULL constraint failed: ledger.id/.test(e.message))return json({error:'Not enough credits.'},400);if(/UNIQUE constraint/.test(e.message))return json({error:'That action was already processed, or you have an active battle. Refresh your account.'},409);console.error('Game API error',e.message);return json({error:'Online service error. Try again shortly.'},500);}
}
async function cancel(db,row,now){
 if(row.asset==='token'){
  await db.batch([db.prepare("UPDATE matches SET status='cancelled',settled=1 WHERE id=? AND status IN ('waiting','funding')").bind(row.id),db.prepare("DELETE FROM holds WHERE match_id=? AND EXISTS(SELECT 1 FROM matches WHERE id=? AND status='cancelled')").bind(row.id,row.id)]);return;
 }
 await db.batch([
 db.prepare("UPDATE players SET balance=balance+?,revision=revision+1 WHERE id=? AND EXISTS (SELECT 1 FROM matches WHERE id=? AND status='waiting' AND settled=0)").bind(row.stake,row.p0,row.id),
 db.prepare("INSERT INTO ledger (id,player_id,delta,kind,match_id,created_at) SELECT ?,p0,stake,'refund',id,? FROM matches WHERE id=? AND status='waiting' AND settled=0").bind('refund:'+row.id,now,row.id),
 db.prepare("DELETE FROM holds WHERE match_id=? AND EXISTS (SELECT 1 FROM matches WHERE id=? AND status='waiting')").bind(row.id,row.id),
 db.prepare("UPDATE matches SET status='cancelled',settled=1 WHERE id=? AND status='waiting'").bind(row.id)
]);}
async function tick(db,id,owner,now,action=null,env={},initialRow=null){
 for(let i=0;i<5;i++){
  const row=i===0&&initialRow?initialRow:await db.prepare('SELECT * FROM matches WHERE id=?').bind(id).first();if(!row)fail(404,'Battle not found.');const side=row.p0===owner?0:1;
  if(row.transport==='realtime'&&row.status!=='ended')return roomRequest(row,owner,action,env);
  const g=JSON.parse(row.state),needsMarket=g.market&&g.time+(now-row.last_tick)/1000>=g.market.nextUpdate,frame=needsMarket?await getMarket(env,now):null,ran=advanceMatch(g,Math.max(0,(now-row.last_tick)/1000),frame);
  if(action?.type==='surrender'&&!action.actionId)action={...action,actionId:'surrender-'+side};
  const result=action?runCommand(g,side,action):{ok:true};
  const ended=g.status==='ended',persist=!!action||(ended&&row.status!=='ended')||(ran>0&&now-row.last_tick>=1000);
  if(!persist){if(ended&&!row.settled)await settle(db,row,g,now,env);return envelope(row,g,side,result,now);}
  if(!ran&&!action&&row.status===g.status){if(ended&&!row.settled)await settle(db,row,g,now,env);return envelope(row,g,side,result,now);}
  const r=await db.prepare('UPDATE matches SET state=?,last_tick=?,version=version+1,status=? WHERE id=? AND version=?').bind(JSON.stringify(g),row.last_tick+ran*1000,g.status,id,row.version).run();
  if(r.meta.changes){if(ended)await settle(db,row,g,now,env);return envelope({...row,version:row.version+1},g,side,result,now);}
 }fail(409,'Battle is busy. Your command can be retried with the same ID.');
}
async function settle(db,row,g,now,env={}){
 if(row.asset==='token')return settleToken(db,row,g,now,env);
 const statements=[];for(let p=0;p<2;p++){
  const id=p===0?row.p0:row.p1;if(g.winner===p||g.winner===-1)statements.push(db.prepare("INSERT INTO ledger (id,player_id,delta,kind,match_id,created_at) SELECT ?,?,stake*?, ?,id,? FROM matches WHERE id=? AND status='ended' AND settled=0").bind('payout:'+row.id+':'+p,id,g.winner===-1?1:2,g.winner===-1?'draw_refund':'win',now,row.id));
  statements.push(db.prepare("UPDATE players SET balance=balance+?,revision=revision+1,wins=wins+?,losses=losses+?,trophies=MAX(0,trophies+?) WHERE id=? AND EXISTS(SELECT 1 FROM matches WHERE id=? AND status='ended' AND settled=0)").bind(g.winner===p?row.stake*2:g.winner===-1?row.stake:0,g.winner===p?1:0,g.winner!==p&&g.winner!==-1?1:0,g.winner===-1?0:g.winner===p?30:-15,id,row.id));
 }
 statements.push(db.prepare("DELETE FROM holds WHERE match_id=? AND EXISTS (SELECT 1 FROM matches WHERE id=? AND status='ended')").bind(row.id,row.id),db.prepare("UPDATE matches SET settled=1 WHERE id=? AND status='ended' AND settled=0").bind(row.id));await db.batch(statements);
}
async function handleMatch(db,request,env,path,body,owner,now,origin){
 const row=await db.prepare('SELECT * FROM matches WHERE id=? AND (p0=? OR p1=?)').bind(path[1],owner,owner).first();if(!row)fail(404,'Battle not found.');
 if(path[2]==='ticket'&&request.method==='POST'){if(row.transport!=='realtime'||row.status!=='playing')fail(409,'This battle is not on the realtime service.');return json(await realtimeTicket(row,owner,origin,env,now));}
 if(path[2]==='cancel'&&request.method==='POST'){
  if(!['waiting','funding'].includes(row.status)||(row.p0!==owner&&!(row.asset==='token'&&row.status==='funding')))fail(409,'This battle has started or only its host can cancel.');
  await cancel(db,row,now);return json({cancelled:true,asset:row.asset,refundPending:row.asset==='token',profile:publicPlayer(await readPlayer(db,owner))});
 }
 if(['waiting','funding','cancelled'].includes(row.status)){
  if(row.asset==='token'&&['waiting','funding'].includes(row.status)&&!row.p1)await db.prepare("UPDATE matches SET expires_at=? WHERE id=? AND status IN ('waiting','funding') AND p1 IS NULL").bind(now+TOKEN_WAIT_MS,row.id).run();
  return json({id:row.id,code:row.code,status:row.status,stake:row.stake,asset:row.asset});
 }
 if(request.method==='POST'&&!['deploy','surrender'].includes(path[2]))fail(404,'Action not found.');
 const action=request.method==='POST'?{...body,type:path[2]}:null,data=await tick(db,row.id,owner,now,action,env,row);
 if(row.transport==='realtime'&&data.state?.status==='playing')data.connection=await realtimeTicket(row,owner,origin,env,now);
 return json(data);
}
async function internal(request,env,route,body,raw,now){
 if(request.method!=='POST'||!await verifyService(request,raw,env.REALTIME_SHARED_SECRET,now))fail(401,'Service authentication required.');
 if(route==='market')return json(await getMarket(env,now));
 if(typeof body.id!=='string'||body.id.length>64)fail(400,'Match ID required.');
 const db=env.DB,row=await db.prepare('SELECT * FROM matches WHERE id=?').bind(body.id).first();if(!row||row.transport!=='realtime')fail(404,'Realtime battle not found.');
 if(route==='bootstrap')return json({row,participants:[row.p0,row.p1]});
 if(route==='settle'){
  const g=body.state;if(!g||g.status!=='ended'||![-1,0,1].includes(g.winner)||!Number.isFinite(g.time)||g.time<0||g.time>151||!Array.isArray(g.towers)||g.towers.length!==6||!Array.isArray(g.units)||g.units.length>120)fail(400,'Invalid authoritative result.');
  if(row.status==='ended'&&JSON.parse(row.state).winner!==g.winner)fail(409,'A different result is already recorded.');
  if(row.status==='playing')await db.prepare("UPDATE matches SET state=?,status='ended',version=version+1 WHERE id=? AND status='playing' AND transport='realtime'").bind(JSON.stringify(g),row.id).run();
  else if(row.status!=='ended')fail(409,'This match cannot be settled.');
  const canonical=await db.prepare('SELECT * FROM matches WHERE id=?').bind(row.id).first(),state=JSON.parse(canonical.state);if(state.winner!==g.winner)fail(409,'A different result is already recorded.');await settle(db,canonical,state,now,env);const final=await db.prepare('SELECT settled FROM matches WHERE id=?').bind(row.id).first();return json({recorded:true,settled:!!final.settled});
 }
 fail(404,'Service route not found.');
}
async function tokenRoute(request,env,path,body,p,identity,now,origin){
 const db=env.DB,owner=p.id,cfg=contractConfig(env);
 if(path[1]==='status'){
  if(cfg.configured){try{await syncStakes(db,env,owner,now);}catch{/* trainer still shows last verified D1 positions if the adapter is unreachable */}}
  const pending=(await db.prepare("SELECT m.id,m.stake,m.stake_units,m.status FROM matches m WHERE m.asset='token' AND m.status='cancelled' AND (m.p0=? OR m.p1=?) AND EXISTS(SELECT 1 FROM token_intents t WHERE t.match_id=m.id AND t.player_id=? AND t.kind='escrow' AND t.status='confirmed') AND NOT EXISTS(SELECT 1 FROM token_intents r WHERE r.match_id=m.id AND r.player_id=? AND r.kind='refund' AND r.status='confirmed') LIMIT 10").bind(owner,owner,owner,owner).all()).results;
  const settlements=(await db.prepare("SELECT m.id,m.stake,s.status,s.receipt FROM matches m JOIN token_settlements s ON s.match_id=m.id WHERE m.asset='token' AND (m.p0=? OR m.p1=?) ORDER BY s.updated_at DESC LIMIT 10").bind(owner,owner).all()).results.map(r=>({id:r.id,stake:r.stake,status:r.status,signature:r.receipt?JSON.parse(r.receipt).signature:null}));
  const withdrawable=(await db.prepare("SELECT id,card,amount_units AS amountUnits,lock_until AS lockUntil FROM token_positions WHERE player_id=? AND status='active' AND lock_until<=? LIMIT 30").bind(owner,now).all()).results;return json({config:cfg,wallet:identity?.wallet||null,...await tokenLevels(db,owner,now),refunds:pending,withdrawable,settlements});
 }
 if(request.method!=='POST')fail(404,'Token route not found.');
 if(!identity?.wallet)fail(401,'Sign in with your Solana wallet first.');
 if(path[1]==='stake'&&path[2]==='prepare'){
  if(await holdFor(db,owner))fail(409,'Finish or cancel your battle before staking.');
  return json(await prepareIntent(db,env,owner,identity.wallet,{...body,kind:'stake'},now));
 }
 if(path[1]==='unstake'&&path[2]==='prepare'){
  if(typeof body.positionId!=='string'||body.positionId.length>80)fail(400,'Staking position ID required.');
  if(await holdFor(db,owner))fail(409,'Finish your battle before withdrawing stake.');
  const position=await db.prepare("SELECT * FROM token_positions WHERE id=? AND player_id=? AND wallet=? AND status='active' AND lock_until<=?").bind(body.positionId,owner,identity.wallet,now).first();if(!position)fail(409,'This staking position is still locked or belongs to another wallet.');
  return json(await prepareIntent(db,env,owner,identity.wallet,{kind:'unstake',actionId:body.actionId,amountUnits:position.amount_units,card:position.card,positionRef:position.position},now));
 }
 if(path[1]==='refund'&&path[2]==='prepare'){
  if(typeof body.matchId!=='string'||body.matchId.length>64)fail(400,'Match ID required.');
  const row=await db.prepare("SELECT * FROM matches WHERE id=? AND asset='token' AND status='cancelled' AND (p0=? OR p1=?)").bind(body.matchId,owner,owner).first();if(!row)fail(404,'Refundable battle not found.');
  const original=await db.prepare("SELECT * FROM token_intents WHERE match_id=? AND player_id=? AND kind='escrow' AND status='confirmed'").bind(row.id,owner).first();if(!original)fail(409,'No finalized escrow was found.');if(original.wallet!==identity.wallet)fail(409,'Reconnect the wallet that funded this escrow.');if(await db.prepare("SELECT id FROM token_intents WHERE match_id=? AND player_id=? AND kind='refund' AND status='confirmed'").bind(row.id,owner).first())fail(409,'This escrow was already refunded.');
  return json(await prepareIntent(db,env,owner,identity.wallet,{kind:'refund',actionId:body.actionId,matchId:row.id,amountUnits:original.amount_units,positionRef:JSON.parse(original.receipt).position,side:row.p0===owner?0:1},now));
 }
 if(path[1]==='intent'&&path[2]&&path[3]==='confirm'){
  const verified=await verifyIntent(db,env,owner,path[2],body.signature,now);
  if(verified.pending)return json({pending:true,intentId:path[2]},202);
  const funding=verified.row.kind==='escrow'?await fundTokenMatch(db,env,verified.row,now):{};
  return json({confirmed:true,...funding,kind:verified.row.kind,matchId:verified.row.match_id,...await tokenLevels(db,owner,now)});
 }
 if(path[1]==='battle'){
  if(typeof body.actionId!=='string'||!/^[a-zA-Z0-9-]{8,64}$/.test(body.actionId))fail(400,'Battle request ID required.');
  if(!cfg.enabled)fail(503,'Token battles open after the escrow, oracle, and live match service are connected.');
  if(!await realtimeHealthy(env))fail(503,'The live token arena is reconnecting. No entry was reserved.');
  const own=await holdFor(db,owner);if(own){const previous=await db.prepare("SELECT * FROM token_intents WHERE id=? AND player_id=? AND match_id=? AND kind='escrow'").bind(await sha256(owner+':token:'+body.actionId),owner,own.id).first();if(previous?.status==='prepared'&&previous.expires_at>now&&['waiting','funding'].includes(own.status))return json({...JSON.parse(previous.receipt),matchId:own.id,code:own.code,side:previous.side,stake:own.stake});if(own.asset==='token'&&own.status==='playing')return json({match:own.id});fail(409,'Finish or cancel your current battle first.');}
  if(!stakes.includes(body.stake))fail(400,'Choose a 25, 50, or 100 token entry.');
  const market=await getMarket(env,now),deck=JSON.parse(p.deck);if(tokenOracleRequired(env)&&deck.some(i=>market.prices[i]?.status!=='live'&&i!==5))fail(503,'One or more character price feeds are unavailable. Try again shortly.');
  const freshId=crypto.randomUUID(),hold=crypto.randomUUID(),units=toUnits(body.stake,cfg.decimals);let row;
  if(body.code){
   row=await db.prepare("SELECT * FROM matches WHERE code=? AND asset='token' AND status IN ('waiting','funding') AND p1 IS NULL AND (expires_at>? OR EXISTS(SELECT 1 FROM holds h WHERE h.match_id=matches.id))").bind(String(body.code).trim().toUpperCase(),now).first();if(!row)fail(404,'Token room not found.');if(row.p0===owner)fail(400,'Another trainer needs to join.');if(body.stake!==row.stake)fail(409,'Confirm the same entry amount as your rival.');
   const claimed=await db.batch([db.prepare("INSERT INTO holds (id,player_id,match_id,stake) SELECT ?,?,?,0 FROM matches WHERE id=? AND status IN ('waiting','funding') AND p1 IS NULL").bind(hold,owner,row.id,row.id),db.prepare("UPDATE matches SET p1=?,status='funding',expires_at=? WHERE id=? AND p1 IS NULL AND status IN ('waiting','funding') AND EXISTS(SELECT 1 FROM holds WHERE id=?)").bind(owner,now+TOKEN_FUND_MS,row.id,hold)]);if(!claimed[1].meta.changes)fail(409,'Another trainer joined first.');row={...row,p1:owner};
  }else if(body.mode==='friendly'){
   const code=crypto.randomUUID().slice(0,6).toUpperCase();await db.batch([db.prepare('INSERT INTO holds (id,player_id,match_id,stake) VALUES (?,?,?,0)').bind(hold,owner,freshId),db.prepare("INSERT INTO matches (id,code,p0,status,state,version,last_tick,created_at,expires_at,mode,stake,asset,stake_units,transport) VALUES (?,?,?,'funding','{}',0,?,?,?,'friendly',?,'token',?,'realtime')").bind(freshId,code,owner,now,now,now+TOKEN_FUND_MS,body.stake,units)]);row=await db.prepare('SELECT * FROM matches WHERE id=?').bind(freshId).first();
  }else{
   const code=crypto.randomUUID().slice(0,6).toUpperCase();
   await db.batch([
    db.prepare('INSERT INTO holds (id,player_id,match_id,stake) VALUES (?,?,?,0)').bind(hold,owner,freshId),
    db.prepare(`INSERT INTO matches (id,code,p0,status,state,version,last_tick,created_at,expires_at,mode,stake,asset,stake_units,transport) SELECT ?,?,?,'funding','{}',0,?,?,?,'ranked',?,'token',?,'realtime' WHERE NOT EXISTS(SELECT 1 FROM matches WHERE ${openRankedToken})`).bind(freshId,code,owner,now,now,now+TOKEN_FUND_MS,body.stake,units,body.stake,owner,now),
    db.prepare(`UPDATE matches SET p1=?,status='funding',expires_at=? WHERE id=(SELECT id FROM (SELECT id FROM matches WHERE ${openRankedToken} ORDER BY created_at,id LIMIT 1))`).bind(owner,now+TOKEN_FUND_MS,body.stake,owner,now),
    db.prepare("UPDATE holds SET match_id=(SELECT id FROM matches WHERE asset='token' AND status IN ('waiting','funding') AND (p0=? OR p1=?) ORDER BY created_at DESC,id DESC LIMIT 1) WHERE id=?").bind(owner,owner,hold)
   ]);row=await holdFor(db,owner);
  }
  const id=row.id,side=row.p0===owner?0:1,amountUnits=row.stake_units,code=row.code;
  try{const proposal=await prepareIntent(db,env,owner,identity.wallet,{kind:'escrow',actionId:body.actionId,amountUnits,matchId:id,side},now);return json({...proposal,matchId:id,code,side,stake:body.stake});}
  catch(e){const match=await db.prepare('SELECT * FROM matches WHERE id=?').bind(id).first();await cancel(db,match,now);throw e;}
 }
 fail(404,'Token route not found.');
}
async function fundTokenMatch(db,env,intent,now){
 const row=await db.prepare('SELECT * FROM matches WHERE id=?').bind(intent.match_id).first();if(!row)fail(404,'Token battle not found.');
 if(row.status==='cancelled'||row.expires_at<now){await cancel(db,row,now);return {cancelled:true,refundAvailable:true};}
 if(row.status==='playing'||row.status==='ended')return;
 const escrows=(await db.prepare("SELECT * FROM token_intents WHERE match_id=? AND kind='escrow' AND status='confirmed'").bind(row.id).all()).results;
 const funded=side=>escrows.some(e=>e.side===side&&e.player_id===(side===0?row.p0:row.p1));
 if(!funded(0)||!funded(1)){if(funded(0)&&!row.p1)await db.prepare("UPDATE matches SET status='waiting',expires_at=? WHERE id=? AND status='funding' AND p1 IS NULL").bind(now+TOKEN_WAIT_MS,row.id).run();return;}
 await Promise.all([syncStakes(db,env,row.p0,now),syncStakes(db,env,row.p1,now)]);
 const players=await Promise.all([readPlayer(db,row.p0),readPlayer(db,row.p1)]),levels=await Promise.all(players.map(p=>tokenLevels(db,p.id,now))),frame=await getMarket(env,now);
 if(tokenOracleRequired(env)&&players.some(p=>JSON.parse(p.deck).some(i=>i!==5&&frame.prices[i]?.status!=='live'))){await cancel(db,row,now);return {cancelled:true,refundAvailable:true};}
 const g=newGame({names:players.map(p=>p.name),decks:players.map(p=>JSON.parse(p.deck)),levels:levels.map(l=>l.levels),seed:now>>>0});g.market=marketBaseline(frame,now);
 const started=await db.prepare("UPDATE matches SET status='playing',state=?,last_tick=?,expires_at=?,version=version+1 WHERE id=? AND status IN ('funding','waiting')").bind(JSON.stringify(g),now,now+210000,row.id).run();if(started.meta.changes){const live=await db.prepare('SELECT * FROM matches WHERE id=?').bind(row.id).first();await roomRequest(live,row.p0,null,env);}
}
async function settleToken(db,row,g,now,env){
 if(row.settled)return;
 await db.prepare("INSERT OR IGNORE INTO token_settlements (match_id,status,updated_at) VALUES (?,'pending',?)").bind(row.id,now).run();
 try{
  const escrow=(await db.prepare("SELECT wallet,side,receipt FROM token_intents WHERE match_id=? AND kind='escrow' AND status='confirmed' ORDER BY side").bind(row.id).all()).results;if(escrow.length!==2)fail(409,'Both escrows are required for settlement.');
  const receipt=await adapter(env,'settle',{settlementId:'match:'+row.id,matchId:row.id,winner:g.winner,amountUnits:row.stake_units,participants:escrow.map(e=>({wallet:e.wallet,side:Number(e.side),position:JSON.parse(e.receipt).position}))}),cfg=contractConfig(env);
  const payoutsOk=Array.isArray(receipt.payouts)&&receipt.payouts.length===2&&escrow.every(e=>receipt.payouts.filter(p=>p.wallet===e.wallet&&p.amountUnits===(BigInt(row.stake_units)*(g.winner===-1?1n:g.winner===Number(e.side)?2n:0n)).toString()).length===1);
  if(!payoutsOk||receipt.decimals!==cfg.decimals||receipt.finalized!==true||receipt.success!==true||receipt.matchId!==row.id||receipt.winner!==g.winner||receipt.mint!==cfg.mint||receipt.programId!==cfg.programId||receipt.amountUnits!==row.stake_units||typeof receipt.signature!=='string'){
   await db.prepare("UPDATE token_settlements SET status='submitted',receipt=?,updated_at=? WHERE match_id=?").bind(JSON.stringify(receipt),now,row.id).run();return;
  }
  const statements=[db.prepare("UPDATE token_settlements SET status='finalized',receipt=?,updated_at=? WHERE match_id=?").bind(JSON.stringify(receipt),now,row.id)];
  for(let side=0;side<2;side++){
   const earned=g.winner===side?row.stake:0,id=side===0?row.p0:row.p1;
   if(earned)statements.push(db.prepare("INSERT INTO ledger (id,player_id,delta,kind,match_id,created_at) SELECT ?,?,?, 'token_win',?,? FROM matches WHERE id=? AND settled=0 AND status='ended'").bind('token_win:'+row.id+':'+side,id,earned,row.id,now,row.id));
   statements.push(db.prepare("UPDATE players SET wins=wins+?,losses=losses+?,token_earned=token_earned+?,revision=revision+1 WHERE id=? AND EXISTS(SELECT 1 FROM matches WHERE id=? AND settled=0 AND status='ended')").bind(g.winner===side?1:0,g.winner!==side&&g.winner!==-1?1:0,earned,id,row.id));
  }
  statements.push(db.prepare('DELETE FROM holds WHERE match_id=?').bind(row.id),db.prepare("UPDATE matches SET settled=1 WHERE id=? AND status='ended'").bind(row.id));await db.batch(statements);
 }catch(e){console.warn('Token settlement pending');await db.prepare("UPDATE token_settlements SET status='failed',updated_at=? WHERE match_id=? AND status<>'finalized'").bind(now,row.id).run();}
}
