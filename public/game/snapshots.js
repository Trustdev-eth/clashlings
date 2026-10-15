// Transport-independent interpolation. This never simulates damage or winners.
export class SnapshotBuffer {
 constructor({delay=150,maxExtrapolate=100}={}){this.delay=delay;this.maxExtrapolate=maxExtrapolate;this.frames=[];this.lastSequence=-1;this.gaps=[];this.lastArrival=null;this.lastRender=-Infinity;}
 reset(){this.frames=[];this.lastSequence=-1;this.gaps=[];this.lastArrival=null;this.lastRender=-Infinity;}
 push(packet,arrival=performance.now()){
  if(!packet?.state||!Number.isFinite(packet.state.time))return false;const sequence=packet.sequence??packet.version??Math.round(packet.state.time*1000);
  if(sequence<=this.lastSequence)return false;
  if(this.lastArrival!==null){this.gaps.push(Math.min(1500,Math.max(0,arrival-this.lastArrival)));this.gaps=this.gaps.slice(-16);}
  this.lastSequence=sequence;this.lastArrival=arrival;this.frames.push({state:packet.state,arrival,sequence});this.frames=this.frames.slice(-24);return true;
 }
 sample(now=performance.now()){
  if(!this.frames.length)return null;const last=this.frames.at(-1),gaps=[...this.gaps].sort((a,b)=>a-b),spacing=gaps.length?gaps[Math.floor((gaps.length-1)*.8)]:this.delay*.65,delay=Math.min(500,Math.max(this.delay,spacing*1.3));
  let target=last.state.time+(now-last.arrival-delay)/1000;target=Math.max(this.lastRender,target);this.lastRender=target;
  let a=this.frames[0],b=null;for(const f of this.frames){if(f.state.time<=target)a=f;else{b=f;break;}}
  if(!b){const prev=this.frames.length>1?this.frames.at(-2):last,extra=Math.max(0,Math.min(this.maxExtrapolate/1000,target-last.state.time)),gap=last.state.time-prev.state.time,old=new Map(prev.state.units.map(u=>[u.id,u]));
   return {...last.state,time:last.state.status==='playing'?last.state.time+extra:last.state.time,units:last.state.units.map(u=>{const p=old.get(u.id);return p&&gap>0&&u.action==='move'?{...u,x:u.x+(u.x-p.x)/gap*extra,y:u.y+(u.y-p.y)/gap*extra}:u;}),interpolated:true};
  }
  const dt=b.state.time-a.state.time,t=dt>0?Math.max(0,Math.min(1,(target-a.state.time)/dt)):0,newUnits=new Map(b.state.units.map(u=>[u.id,u]));
  return {...a.state,time:a.state.time+(b.state.time-a.state.time)*t,elixir:a.state.elixir.map((v,i)=>v+(b.state.elixir[i]-v)*t),units:a.state.units.map(u=>{const v=newUnits.get(u.id);return v?{...u,x:u.x+(v.x-u.x)*t,y:u.y+(v.y-u.y)*t}:u;}),interpolated:true};
 }
}
export function playerSnapshot(g,side){const {seed,actionIds,commands,scheduled,...safe}=g;return {...safe,decks:g.decks.map((x,p)=>p===side?x:[]),hand:g.hand.map((x,p)=>p===side?x:[]),queue:g.queue.map((x,p)=>p===side?x:[])};}
