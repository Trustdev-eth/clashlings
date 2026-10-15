import {step,deploy,STEP} from './engine.js';

// Simulates online matches locally like practice. Authoritative snapshots rebase the simulation and
// own deploys the server has not processed yet are replayed on top, so input feels instant.
export class Predictor {
 constructor({side=0,maxAhead=1,maxLead=.3,pendingLife=5}={}){this.side=side;this.maxAhead=maxAhead;this.maxLead=maxLead;this.pendingLife=pendingLife;this.auth=null;this.state=null;this.pending=[];this.samples=[];this.offset=null;this.target=null;this.rtt=.1;this.lastFrame=null;}
 setRtt(seconds){if(Number.isFinite(seconds)&&seconds>0)this.rtt=this.rtt*.75+Math.min(1,seconds)*.25;}
 // Server game time is estimated from the least-delayed recent snapshot, then led by one round trip so
 // a command sent now reaches the server at the moment it was predicted locally.
 receive(packet,now=performance.now()){
  const s=packet?.state;if(!s||!Number.isFinite(s.time))return false;if(this.auth&&s.time+1e-9<this.auth.time)return false;
  const processed=new Set(packet.acks||[]);this.pending=this.pending.filter(c=>!processed.has(c.actionId)&&(this.state?.time??0)-c.at<this.pendingLife);
  this.auth=structuredClone(s);this.samples.push(s.time-now/1000);this.samples=this.samples.slice(-24);
  this.target=Math.max(...this.samples)+Math.min(this.maxLead,this.rtt);if(this.offset===null||Math.abs(this.target-this.offset)>.75)this.offset=this.target;
  this.rebuild();return true;
 }
 rebuild(){
  if(!this.auth)return;const sim=structuredClone(this.auth),goal=Math.min(Math.max(this.state?.time??sim.time,sim.time),sim.time+this.maxAhead),queue=[...this.pending].sort((a,b)=>a.at-b.at);
  const replay=()=>{while(queue.length&&queue[0].at<=sim.time+1e-6)this.apply(sim,queue.shift());};
  replay();for(let n=0;sim.status==='playing'&&sim.time+STEP<=goal+1e-6&&n<40;n++){step(sim);replay();}while(queue.length)this.apply(sim,queue.shift());
  this.state=sim;
 }
 frame(now=performance.now()){
  if(!this.state)return null;
  if(this.lastFrame!==null&&this.target!==null){const slew=Math.max(0,(now-this.lastFrame)/1000)*.1;this.offset+=Math.max(-slew,Math.min(slew,this.target-this.offset));}this.lastFrame=now;
  const goal=Math.min(now/1000+this.offset,this.auth.time+this.maxAhead);
  for(let n=0;this.state.status==='playing'&&this.state.time+STEP<=goal+1e-6&&n<6;n++)step(this.state);
  return this.state;
 }
 predict(command){
  if(!this.state||this.state.status!=='playing')return {ok:false,error:'The battle has ended.'};
  const item={...command,at:this.state.time},result=this.apply(this.state,item);if(result.ok)this.pending.push(item);return {...result,at:item.at};
 }
 settle(actionId){const before=this.pending.length;this.pending=this.pending.filter(c=>c.actionId!==actionId);if(this.pending.length!==before)this.rebuild();}
 apply(sim,c){if(c.type!=='deploy')return {ok:true};const slot=sim.hand[this.side]?.indexOf(c.card)??-1;if(slot<0)return {ok:false,error:'Your hand changed. Choose the card again.'};return deploy(sim,this.side,slot,c.x,c.y);}
 get lead(){return this.state&&this.auth?this.state.time-this.auth.time:0;}
}
