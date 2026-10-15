import {newGame,deploy,advance,validDeck,DEFAULT_DECK,UPGRADE_COSTS,STARTING_CREDITS} from '../public/game/engine.js';
import {sessionIdentity,walletAuth} from './wallet-auth.js';
import {getMarket} from './market.js';
import {marketBaseline} from '../public/game/tokens.js';
import {rewardStatus,claimReward,utcDay} from './rewards.js';
import {contractConfig,tokenLevels,prepareIntent,verifyIntent,adapter,toUnits,syncStakes} from './contracts.js';
import {advanceMatch,runCommand,envelope} from './match-engine.js';
import {realtimeReady,realtimeTicket,roomRequest,realtimeHealthy} from './realtime-bridge.js';
import {verifyService,sha256} from './security.js';
const json=(x,status=200)=>new Response(JSON.stringify(x),{status,headers:{'Content-Type':'application/json','Cache-Control':'private, no-store'}});
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const name=n=>String(n||'Trainer').replace(/[<>\x00-\x1f]/g,'').trim().slice(0,16)||'Trainer';
const stakes=[25,50,100];
const readPlayer=(db,id)=>db.prepare('SELECT * FROM players WHERE id=?').bind(id).first();
const publicPlayer=p=>({name:p.name,deck:JSON.parse(p.deck),levels:JSON.parse(p.levels),balance:p.balance,wins:p.wins,losses:p.losses,trophies:p.trophies});
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
  const held=await holdFor(db,owner);if(held&&held.expires_at<now){if(held.status==='waiting'||held.status==='funding')await cancel(db,held,now);else if(held.status==='playing')await tick(db,held.id,owner,now,null,env,held);}
  if(path[0]==='profile'&&request.method==='POST'){
   const deck=body.deck??DEFAULT_DECK;if(!validDeck(deck))fail(400,'Choose eight different creatures.');
   const old=await readPlayer(db,owner);if(old&&await holdFor(db,owner)&&old.deck!==JSON.stringify(deck))fail(409,'Finish or cancel your battle before changing your deck.');
   await db.batch([
    db.prepare('INSERT INTO players (id,name,deck,levels,created_at) VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,deck=excluded.deck').bind(owner,name(body.name),JSON.stringify(deck),JSON.stringify(Array(12).fill(1)),now),
    db.prepare('INSERT OR IGNORE INTO ledger (id,player_id,delta,kind,created_at) VALUES (?,?,?,?,?)').bind('welcome:'+owner,owner,STARTING_CREDITS,'welcome',now),
    db.prepare('UPDATE players SET balance=balance+?,revision=revision+1 WHERE id=? AND changes()>0').bind(STARTING_CREDITS,owner)
   ]);return json(publicPlayer(await readPlayer(db,owner)));
  }
  const p=await readPlayer(db,owner);if(!p)fail(409,'Create your trainer profile first.');
  if(path[0]==='profile'){const hold=await holdFor(db,owner);return json({...publicPlayer(p),wallet:identity?.wallet||null,activeMatch:hold?{id:hold.id,status:hold.status,mode:hold.mode,code:hold.code,stake:hold.stake,asset:hold.asset}:null});}
  if(path[0]==='rewards'){
   if(request.method==='GET')return json(await rewardStatus(db,owner,now));
   const reward=await claimReward(db,owner,body.kind,now);return json({...reward,profile:publicPlayer(await readPlayer(db,owner))});
  }
  if(path[0]==='token')return await tokenRoute(request,env,path,body,p,identity,now,url.origin);
  if(path[0]==='ledger')return json({entries:(await db.prepare('SELECT delta,kind,created_at FROM ledger WHERE player_id=? ORDER BY created_at DESC,rowid DESC LIMIT 40').bind(owner).all()).results});
  if(path[0]==='ranks')return json({players:(await db.prepare('SELECT name,wins,losses,trophies FROM players ORDER BY trophies DESC,wins DESC LIMIT 30').all()).results});
  if(path[0]==='upgrade'&&request.method==='POST'){
   const card=body.card;if(!Number.isInteger(card)||card<0||card>=12)fail(400,'Choose a creature.');
   if(typeof body.actionId!=='string'||!/^[a-zA-Z0-9-]{8,64}$/.test(body.actionId))fail(400,'Upgrade ID required.');
   const operation=owner+':upgrade:'+body.actionId;
   if(await db.prepare('SELECT id FROM ledger WHERE id=?').bind(operation).first())return json(publicPlayer(p));
   if(await holdFor(db,owner))fail(409,'Finish or cancel your battle before upgrading.');
   const levels=JSON.parse(p.levels),level=levels[card];if(level>=5)fail(400,'This creature is already at max level.');const cost=UPGRADE_COSTS[level];if(p.balance<cost)fail(400,'Not enough credits for this upgrade.');levels[card]++;
   const changes=await db.batch([
    db.prepare('UPDATE players SET balance=balance-?,levels=?,revision=revision+1 WHERE id=? AND revision=? AND balance>=? AND NOT EXISTS (SELECT 1 FROM holds WHERE player_id=?)').bind(cost,JSON.stringify(levels),owner,p.revision,cost,owner),
    db.prepare("INSERT INTO ledger (id,player_id,delta,kind,created_at) SELECT ?,?,?,'upgrade',? WHERE changes()>0").bind(operation,owner,-cost,now)
   ]);if(!changes[0].meta.changes)fail(409,'Your account changed. Try again.');return json(publicPlayer(await readPlayer(db,owner)));
  }
  if(path[0]==='queue'){
   let own=await holdFor(db,owner);
   if(own?.status==='playing')return json({match:own.id});
   if(own&&own.asset==='token')fail(409,'Finish your token battle first.');
   if(own&&own.mode!=='ranked')fail(409,'Cancel your friendly room first.');
   if(request.method==='POST'&&body.cancel){if(own)await cancel(db,own,now);return json({cancelled:true,profile:publicPlayer(await readPlayer(db,owner))});}
   if(request.method==='GET')return json({match:own?.status==='playing'?own.id:null,waiting:!!own,id:own?.id});
   const stake=own?.stake??body.stake;if(!stakes.includes(stake))fail(400,'Choose a 25, 50, or 100 credit stake.');
   const candidate=await db.prepare("SELECT * FROM matches WHERE mode='ranked' AND asset='credits' AND stake=? AND p0<>? AND status='waiting' AND expires_at>? ORDER BY created_at,id LIMIT 1").bind(stake,owner,now).first();
   // When both players arrived together, only the newer room joins the older one.
   const older=candidate&&(!own||candidate.created_at<own.created_at||(candidate.created_at===own.created_at&&candidate.id<own.id));
   if(older){if(own){await cancel(db,own,now);own=null;}const joined=await join(db,candidate,p,now,env);if(joined)return json({match:joined});}
   if(own){await db.prepare("UPDATE matches SET expires_at=? WHERE id=? AND status='waiting'").bind(now+90000,own.id).run();return json({waiting:true,id:own.id});}
   const id=await waiting(db,p,stake,'ranked',null,now);return json({waiting:true,id});
  }
  if(path[0]==='rooms'&&request.method==='POST'){
   if(await holdFor(db,owner))fail(409,'Finish or cancel your current battle first.');
   if(!body.code){if(!stakes.includes(body.stake))fail(400,'Choose a 25, 50, or 100 credit stake.');const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789',code=Array.from(crypto.getRandomValues(new Uint8Array(6)),b=>alphabet[b%alphabet.length]).join('');const id=await waiting(db,p,body.stake,'friendly',code,now);return json({id,code,status:'waiting',stake:body.stake});}
   const code=String(body.code).trim().toUpperCase();if(!/^[A-Z2-9]{6}$/.test(code))fail(400,'Enter a six-character room code.');
   const room=await db.prepare("SELECT * FROM matches WHERE code=? AND asset='credits' AND status='waiting' AND expires_at>?").bind(code,now).first();if(!room)fail(404,'That room expired or has already started.');if(room.p0===owner)fail(400,'Another trainer needs to join your room.');
   if(body.confirmStake!==room.stake)return json({confirm:true,stake:room.stake,host:(await readPlayer(db,room.p0)).name});
   const id=await join(db,room,p,now,env);if(!id)fail(409,'Someone else joined that room.');return json({match:id});
  }
  return json({error:'Route not found.'},404);
 }catch(e){if(e.status)return json({error:e.message},e.status);if(/Insufficient credits|NOT NULL constraint failed: ledger.id/.test(e.message))return json({error:'Not enough credits.'},400);if(/UNIQUE constraint/.test(e.message))return json({error:'That action was already processed, or you have an active battle. Refresh your account.'},409);console.error('Game API error',e.message);return json({error:'Online service error. Try again shortly.'},500);}
}
async function waiting(db,p,stake,mode,code,now){
 const id=crypto.randomUUID(),hold=crypto.randomUUID();const r=await db.batch([
  db.prepare('UPDATE players SET balance=balance-?,revision=revision+1 WHERE id=? AND balance>=? AND NOT EXISTS (SELECT 1 FROM holds WHERE player_id=?)').bind(stake,p.id,stake,p.id),
  db.prepare("INSERT INTO ledger (id,player_id,delta,kind,match_id,created_at) SELECT ?,?,?,'stake',?,? WHERE changes()>0").bind('stake:'+hold,p.id,-stake,id,now),
  db.prepare('INSERT INTO holds (id,player_id,match_id,stake) SELECT ?,?,?,? WHERE EXISTS (SELECT 1 FROM ledger WHERE id=?)').bind(hold,p.id,id,stake,'stake:'+hold),
  db.prepare("INSERT INTO matches (id,code,p0,status,state,version,last_tick,created_at,expires_at,mode,stake) SELECT ?,?,?,'waiting','{}',0,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM holds WHERE id=?)").bind(id,code,p.id,now,now,now+(mode==='ranked'?90000:180000),mode,stake,hold)
 ]);if(!r[0].meta.changes)fail(400,'Not enough available credits, or a battle is already active.');return id;
}
async function join(db,room,p,now,env={}){
 const host=await readPlayer(db,room.p0),g=newGame({names:[host.name,p.name],decks:[JSON.parse(host.deck),JSON.parse(p.deck)],levels:[JSON.parse(host.levels),JSON.parse(p.levels)],seed:now>>>0}),hold=crypto.randomUUID(),transport=await realtimeHealthy(env)?'realtime':'http';g.market=marketBaseline(await getMarket(env,now),now);
 const r=await db.batch([
  db.prepare("INSERT INTO holds (id,player_id,match_id,stake) SELECT ?,?,?,? FROM matches WHERE id=? AND status='waiting'").bind(hold,p.id,room.id,room.stake,room.id),
  db.prepare('UPDATE players SET balance=balance-?,revision=revision+1 WHERE id=? AND balance>=? AND EXISTS (SELECT 1 FROM holds WHERE id=?)').bind(room.stake,p.id,room.stake,hold),
  db.prepare("INSERT INTO ledger (id,player_id,delta,kind,match_id,created_at) SELECT CASE WHEN changes()>0 THEN ? ELSE NULL END,player_id,-stake,'stake',match_id,? FROM holds WHERE id=?").bind('stake:'+hold,now,hold),
  db.prepare("UPDATE matches SET p1=?,state=?,status='playing',last_tick=?,expires_at=?,transport=?,version=version+1 WHERE id=? AND status='waiting' AND EXISTS(SELECT 1 FROM holds WHERE id=?)").bind(p.id,JSON.stringify(g),now,now+180000,transport,room.id,hold)
 ]);return r[3].meta.changes?room.id:null;
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
 if(g.winner===0||g.winner===1){const winner=g.winner===0?row.p0:row.p1,day=utcDay(now);statements.push(db.prepare("INSERT INTO daily_wins (id,player_id,day,wins) SELECT ?,?,?,1 WHERE EXISTS(SELECT 1 FROM matches WHERE id=? AND status='ended' AND settled=0) ON CONFLICT(id) DO UPDATE SET wins=wins+1").bind(winner+':'+day,winner,day,row.id));}
 statements.push(db.prepare("DELETE FROM holds WHERE match_id=? AND EXISTS (SELECT 1 FROM matches WHERE id=? AND status='ended')").bind(row.id,row.id),db.prepare("UPDATE matches SET settled=1 WHERE id=? AND status='ended' AND settled=0").bind(row.id));await db.batch(statements);
}
async function handleMatch(db,request,env,path,body,owner,now,origin){
 const row=await db.prepare('SELECT * FROM matches WHERE id=? AND (p0=? OR p1=?)').bind(path[1],owner,owner).first();if(!row)fail(404,'Battle not found.');
 if(path[2]==='ticket'&&request.method==='POST'){if(row.transport!=='realtime'||row.status!=='playing')fail(409,'This battle is not on the realtime service.');return json(await realtimeTicket(row,owner,origin,env,now));}
 if(path[2]==='cancel'&&request.method==='POST'){
  if(!['waiting','funding'].includes(row.status)||(row.p0!==owner&&!(row.asset==='token'&&row.status==='funding')))fail(409,'This battle has started or only its host can cancel.');
  await cancel(db,row,now);return json({cancelled:true,asset:row.asset,refundPending:row.asset==='token',profile:publicPlayer(await readPlayer(db,owner))});
 }
 if(['waiting','funding','cancelled'].includes(row.status))return json({id:row.id,code:row.code,status:row.status,stake:row.stake,asset:row.asset});
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
  const market=await getMarket(env,now),deck=JSON.parse(p.deck);if(deck.some(i=>market.prices[i]?.status!=='live'&&i!==5))fail(503,'One or more character price feeds are unavailable. Try a credit battle.');
  const freshId=crypto.randomUUID(),hold=crypto.randomUUID(),units=toUnits(body.stake,cfg.decimals);let row;
  if(body.code){
   row=await db.prepare("SELECT * FROM matches WHERE code=? AND asset='token' AND status IN ('waiting','funding') AND p1 IS NULL AND expires_at>?").bind(String(body.code).trim().toUpperCase(),now).first();if(!row)fail(404,'Token room not found.');if(row.p0===owner)fail(400,'Another trainer needs to join.');if(body.stake!==row.stake)fail(409,'Confirm the same entry amount as your rival.');
   const claimed=await db.batch([db.prepare("INSERT INTO holds (id,player_id,match_id,stake) SELECT ?,?,?,0 FROM matches WHERE id=? AND status IN ('waiting','funding') AND p1 IS NULL").bind(hold,owner,row.id,row.id),db.prepare("UPDATE matches SET p1=?,status='funding',expires_at=? WHERE id=? AND p1 IS NULL AND status IN ('waiting','funding') AND EXISTS(SELECT 1 FROM holds WHERE id=?)").bind(owner,now+240000,row.id,hold)]);if(!claimed[1].meta.changes)fail(409,'Another trainer joined first.');row={...row,p1:owner};
  }else if(body.mode==='friendly'){
   const code=crypto.randomUUID().slice(0,6).toUpperCase();await db.batch([db.prepare('INSERT INTO holds (id,player_id,match_id,stake) VALUES (?,?,?,0)').bind(hold,owner,freshId),db.prepare("INSERT INTO matches (id,code,p0,status,state,version,last_tick,created_at,expires_at,mode,stake,asset,stake_units,transport) VALUES (?,?,?,'funding','{}',0,?,?,?,'friendly',?,'token',?,'realtime')").bind(freshId,code,owner,now,now,now+240000,body.stake,units)]);row=await db.prepare('SELECT * FROM matches WHERE id=?').bind(freshId).first();
  }else{
   // Reserve, choose/create the room, and attach its second participant atomically.
   await db.batch([
    db.prepare('INSERT INTO holds (id,player_id,match_id,stake) VALUES (?,?,?,0)').bind(hold,owner,freshId),
    db.prepare("INSERT INTO matches (id,p0,status,state,version,last_tick,created_at,expires_at,mode,stake,asset,stake_units,transport) SELECT ?,?,'funding','{}',0,?,?,?,'ranked',?,'token',?,'realtime' WHERE NOT EXISTS(SELECT 1 FROM matches WHERE asset='token' AND mode='ranked' AND stake=? AND p0<>? AND p1 IS NULL AND status IN ('waiting','funding') AND expires_at>?)").bind(freshId,owner,now,now,now+240000,body.stake,units,body.stake,owner,now),
    db.prepare("UPDATE matches SET p1=?,status='funding',expires_at=? WHERE id=(SELECT id FROM matches WHERE asset='token' AND mode='ranked' AND stake=? AND p0<>? AND p1 IS NULL AND status IN ('waiting','funding') AND expires_at>? ORDER BY created_at,id LIMIT 1)").bind(owner,now+240000,body.stake,owner,now),
    db.prepare("UPDATE holds SET match_id=(SELECT id FROM matches WHERE asset='token' AND status='funding' AND (p0=? OR p1=?) ORDER BY created_at DESC,id DESC LIMIT 1) WHERE id=?").bind(owner,owner,hold)
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
 if(!funded(0)||!funded(1)){if(funded(0)&&!row.p1)await db.prepare("UPDATE matches SET status='waiting',expires_at=? WHERE id=? AND status='funding' AND p1 IS NULL").bind(now+180000,row.id).run();return;}
 await Promise.all([syncStakes(db,env,row.p0,now),syncStakes(db,env,row.p1,now)]);
 const players=await Promise.all([readPlayer(db,row.p0),readPlayer(db,row.p1)]),levels=await Promise.all(players.map(p=>tokenLevels(db,p.id,now))),frame=await getMarket(env,now);
 if(players.some(p=>JSON.parse(p.deck).some(i=>i!==5&&frame.prices[i]?.status!=='live'))){await cancel(db,row,now);return {cancelled:true,refundAvailable:true};}
 const g=newGame({names:players.map(p=>p.name),decks:players.map(p=>JSON.parse(p.deck)),levels:levels.map(l=>l.levels),seed:now>>>0});g.market=marketBaseline(frame,now);
 const started=await db.prepare("UPDATE matches SET status='playing',state=?,last_tick=?,expires_at=?,version=version+1 WHERE id=? AND status IN ('funding','waiting')").bind(JSON.stringify(g),now,now+210000,row.id).run();if(started.meta.changes){const live=await db.prepare('SELECT * FROM matches WHERE id=?').bind(row.id).first();await roomRequest(live,row.p0,null,env);}
}
async function settleToken(db,row,g,now,env){
 if(row.settled)return;
 await db.prepare("INSERT OR IGNORE INTO token_settlements (match_id,status,updated_at) VALUES (?,'pending',?)").bind(row.id,now).run();
 try{
  const escrow=(await db.prepare("SELECT wallet,side,receipt FROM token_intents WHERE match_id=? AND kind='escrow' AND status='confirmed' ORDER BY side").bind(row.id).all()).results;if(escrow.length!==2)fail(409,'Both escrows are required for settlement.');
  const receipt=await adapter(env,'settle',{settlementId:'match:'+row.id,matchId:row.id,winner:g.winner,amountUnits:row.stake_units,participants:escrow.map(e=>({wallet:e.wallet,side:e.side,position:JSON.parse(e.receipt).position}))}),cfg=contractConfig(env);
  const payoutsOk=Array.isArray(receipt.payouts)&&receipt.payouts.length===2&&escrow.every(e=>receipt.payouts.filter(p=>p.wallet===e.wallet&&p.amountUnits===(BigInt(row.stake_units)*(g.winner===-1?1n:g.winner===e.side?2n:0n)).toString()).length===1);
  if(!payoutsOk||receipt.decimals!==cfg.decimals||receipt.finalized!==true||receipt.success!==true||receipt.matchId!==row.id||receipt.winner!==g.winner||receipt.mint!==cfg.mint||receipt.programId!==cfg.programId||receipt.amountUnits!==row.stake_units||typeof receipt.signature!=='string'){
   await db.prepare("UPDATE token_settlements SET status='submitted',receipt=?,updated_at=? WHERE match_id=?").bind(JSON.stringify(receipt),now,row.id).run();return;
  }
  const statements=[db.prepare("UPDATE token_settlements SET status='finalized',receipt=?,updated_at=? WHERE match_id=?").bind(JSON.stringify(receipt),now,row.id)];
  for(let side=0;side<2;side++)statements.push(db.prepare("UPDATE players SET wins=wins+?,losses=losses+?,trophies=MAX(0,trophies+?),revision=revision+1 WHERE id=? AND EXISTS(SELECT 1 FROM matches WHERE id=? AND settled=0 AND status='ended')").bind(g.winner===side?1:0,g.winner!==side&&g.winner!==-1?1:0,g.winner===-1?0:g.winner===side?30:-15,side===0?row.p0:row.p1,row.id));
  if(g.winner!==-1){const winner=g.winner===0?row.p0:row.p1,day=utcDay(now);statements.push(db.prepare("INSERT INTO daily_wins (id,player_id,day,wins) SELECT ?,?,?,1 WHERE EXISTS(SELECT 1 FROM matches WHERE id=? AND status='ended' AND settled=0) ON CONFLICT(id) DO UPDATE SET wins=wins+1").bind(winner+':'+day,winner,day,row.id));}
  statements.push(db.prepare('DELETE FROM holds WHERE match_id=?').bind(row.id),db.prepare("UPDATE matches SET settled=1 WHERE id=? AND status='ended'").bind(row.id));await db.batch(statements);
 }catch(e){console.warn('Token settlement pending');await db.prepare("UPDATE token_settlements SET status='failed',updated_at=? WHERE match_id=? AND status<>'finalized'").bind(now,row.id).run();}
}
