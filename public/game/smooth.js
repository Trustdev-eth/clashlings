import {STEP} from './engine.js';

const MAX_SPEED=110,SNAP=140,SETTLE=12,HISTORY=5;

// Units are drawn one simulation step behind the newest state and interpolated between recorded steps, so
// motion stays even when 60 Hz frames and 10 Hz steps don't line up. Sudden corrections (server rebases,
// re-keyed predictions) are eased out over a few frames instead of snapping.
export class MotionTracker {
 constructor(){this.tracks=new Map();}
 static renderTime(g,clock){return Number.isFinite(clock)?Math.min(clock,g.time+STEP)-STEP:g.time;}
 update(units,time,renderTime,dt){
  const live=new Set();
  for(const u of units){
   live.add(u.id);let t=this.tracks.get(u.id);
   if(!t){t={samples:[],x:u.x,y:u.y,rawX:null,rawY:null,errX:0,errY:0,rt:renderTime};this.tracks.set(u.id,t);}
   const s=t.samples;while(s.length&&s[s.length-1].t>time+1e-6)s.pop();
   const last=s[s.length-1];if(last&&Math.abs(last.t-time)<1e-6){last.x=u.x;last.y=u.y;}else s.push({t:time,x:u.x,y:u.y});if(s.length>HISTORY)s.shift();
   const [x,y]=sampleAt(s,renderTime);
   if(t.rawX!==null){const jump=Math.hypot(x-t.rawX,y-t.rawY),allowed=MAX_SPEED*Math.max(dt,Math.abs(renderTime-t.rt))+2;if(jump>SNAP){t.errX=0;t.errY=0;}else if(jump>allowed){t.errX+=t.rawX-x;t.errY+=t.rawY-y;}}
   const k=Math.exp(-dt*SETTLE);t.errX*=k;t.errY*=k;if(Math.abs(t.errX)+Math.abs(t.errY)<.05){t.errX=0;t.errY=0;}
   t.rawX=x;t.rawY=y;t.rt=renderTime;t.x=x+t.errX;t.y=y+t.errY;
  }
  for(const id of this.tracks.keys())if(!live.has(id))this.tracks.delete(id);
 }
 get(id){return this.tracks.get(id);}
 rename(from,to){const t=this.tracks.get(from);if(!t)return;this.tracks.delete(from);this.tracks.set(to,t);}
 clear(){this.tracks.clear();}
}

function sampleAt(s,time){
 if(time<=s[0].t)return [s[0].x,s[0].y];
 for(let i=1;i<s.length;i++){const a=s[i-1],b=s[i];if(time<=b.t){const f=(time-a.t)/Math.max(1e-6,b.t-a.t);return [a.x+(b.x-a.x)*f,a.y+(b.y-a.y)*f];}}
 const end=s[s.length-1];return [end.x,end.y];
}
