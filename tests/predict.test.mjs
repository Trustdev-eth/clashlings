import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newGame,step,advance,STEP,CARDS} from '../public/game/engine.js';
import {runCommand,envelope,advanceMatch,processedCommands} from '../lib/match-engine.js';
import {packPacket,unpackPacket} from '../public/game/wire.js';
import {marketBaseline} from '../public/game/tokens.js';
import {Predictor} from '../public/game/predict.js';

const row={id:'m1',stake:50,asset:'credits',transport:'realtime',version:1};
const send=(g,side)=>unpackPacket(JSON.parse(JSON.stringify(packPacket(envelope(row,g,side)))));
const units=s=>s.units.map(u=>[u.id,u.card,u.p,u.x,u.y,u.hp,u.cd,u.stun,u.slow]);
const deployAt=(id,card,x,y)=>({type:'deploy',card,x,y,actionId:'action-'+id});

test('lossless room frames simulate identically to the authoritative match',()=>{
 const g=newGame({seed:7});runCommand(g,0,{...deployAt(1,g.hand[0][0],135,520),slot:0});runCommand(g,1,{...deployAt(2,g.hand[1][1],465,240),slot:1});advance(g,6.3);
 const copy=send(g,0).state;for(let i=0;i<80;i++){step(g);step(copy);}
 assert.deepEqual(units(copy),units(g));assert.deepEqual(copy.towers.map(t=>t.hp),g.towers.map(t=>t.hp));assert.deepEqual(copy.elixir,g.elixir);
 assert.deepEqual(copy.hand[1],[]);assert.equal(copy.seed,undefined);
});

test('own deploys appear instantly, are never doubled or rejected, and converge exactly with the server under jitter',()=>{
 for(const base of [30,90,160]){
  const server=newGame({seed:11});server.market=marketBaseline(null,0);
  const p=new Predictor({side:0});let serverClock=0,maxJump=0,instant=0,placed=0,rejected=0,lastUplink=0;const wire=[],toServer=[],before=new Map();
  const latency=()=>base+Math.random()*base*.5,deliver=(queue,at,item)=>queue.push({at,item}),uplink=clock=>lastUplink=Math.max(lastUplink,clock+latency());
  p.receive(send(server,0),0);p.setRtt(base*2.5/1000);
  for(let clock=0;clock<=30000;clock+=16){
   while(serverClock+100<=clock){serverClock+=100;advanceMatch(server,.1,null);
    for(const m of toServer.filter(m=>m.at<=serverClock)){const slot=server.hand[m.item.side].indexOf(m.item.card);if(!runCommand(server,m.item.side,{...m.item,slot}).ok&&m.item.side===0)rejected++;}
    toServer.splice(0,toServer.length,...toServer.filter(m=>m.at>serverClock));
    deliver(wire,serverClock+latency(),send(server,0));}
   for(const m of wire.filter(m=>m.at<=clock).sort((a,b)=>a.item.sequence-b.item.sequence))p.receive(m.item,clock);
   wire.splice(0,wire.length,...wire.filter(m=>m.at>clock));
   const s=p.frame(clock),card=s.hand[0][0];
   if(clock>500&&s.elixir[0]>=CARDS[card].cost){const cmd=deployAt('p0-'+clock,card,135+(placed%3)*150,540),count=s.units.length,r=p.predict(cmd);if(r.ok){placed++;if(p.state.units.length>count)instant++;deliver(toServer,uplink(clock),{...cmd,at:r.at,side:0});}}
   if(clock%2496===0&&clock>0)deliver(toServer,clock,{...deployAt('p1-'+clock,server.hand[1][2],300,220),side:1});
   for(const u of p.state.units){const old=before.get(u.id);if(old)maxJump=Math.max(maxJump,Math.hypot(u.x-old[0],u.y-old[1]));}before.clear();for(const u of p.state.units)before.set(u.id,[u.x,u.y]);
  }
  assert.ok(placed>=4&&instant===placed,'Every deploy is visible on the frame it is placed.');
  assert.equal(rejected,0,`Deploys made the instant elixir allows are never rejected (${base}ms).`);
  assert.equal(p.pending.length,0,'The server acknowledged every predicted deploy.');
  assert.ok(maxJump<22,`Units move continuously between frames (largest jump ${maxJump.toFixed(1)}px).`);
  const reference=structuredClone(server),local=structuredClone(p.state);advance(local.time<reference.time?local:reference,Math.abs(reference.time-local.time));
  assert.deepEqual(units(local),units(reference),`Prediction converges exactly with the server (${base}ms).`);
 }
});

test('early commands wait for their predicted step; late ones apply at once; retries never double',()=>{
 const g=newGame({seed:2});g.elixir[0]=3;const card=g.hand[0][0],early={...deployAt('early',card,135,540),slot:0,at:g.time+.3};
 assert.deepEqual(runCommand(g,0,early),{ok:true,scheduled:true});assert.deepEqual(runCommand(g,0,early),{ok:true,scheduled:true});assert.equal(g.units.length,0);
 assert.equal(send(g,0).state.scheduled,undefined,'Waiting deploys never leak to the other player.');
 advanceMatch(g,.2,null);assert.equal(g.units.length,0);advanceMatch(g,.1,null);assert.equal(g.units.length,CARDS[card].count||1);assert.ok(processedCommands(g,0).includes(early.actionId));
 const late={...deployAt('late-one',g.hand[0][0],135,540),slot:0,at:g.time-.4};g.elixir[0]=10;runCommand(g,0,late);assert.ok(g.units.length>1);
});

test('a rejected prediction is removed once the server reports it processed',()=>{
 const g=newGame({seed:3}),p=new Predictor({side:0});p.receive(send(g,0),0);const cmd=deployAt(9,g.hand[0][0],135,540);assert.equal(p.predict(cmd).ok,true);assert.equal(p.state.units.length,1);
 g.commands=[{id:'0:'+cmd.actionId,result:{ok:false,error:'Need more elixir.'}}];const packet=send(g,0);assert.deepEqual(packet.acks,[cmd.actionId]);p.receive(packet,100);assert.equal(p.state.units.length,0);assert.equal(p.pending.length,0);
});

test('an unconfirmed prediction survives snapshots taken before the server received it',()=>{
 const g=newGame({seed:5}),p=new Predictor({side:0});p.setRtt(.2);p.receive(send(g,0),0);p.frame(0);const cmd=deployAt(10,g.hand[0][1],465,540);p.predict(cmd);
 for(let t=100;t<=400;t+=100){step(g);p.receive(send(g,0),t);p.frame(t);assert.equal(p.state.units.length,1,'Prediction stays visible while in flight.');}
 runCommand(g,0,{...cmd,slot:g.hand[0].indexOf(cmd.card)});step(g);p.receive(send(g,0),500);assert.equal(p.pending.length,0);assert.equal(p.state.units.length,1);
});

test('prediction stops running far ahead of the last authoritative state during a disconnect',()=>{
 const g=newGame(),p=new Predictor({side:0,maxAhead:1});p.receive(send(g,0),0);for(let t=0;t<=5000;t+=16)p.frame(t);assert.ok(p.state.time<=g.time+1+STEP);
});
