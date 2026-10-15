import test from 'node:test';
import assert from 'node:assert/strict';
import {STEP} from '../public/game/engine.js';
import {MotionTracker} from '../public/game/smooth.js';

// Drives a 10 Hz simulation from irregular 60 Hz-ish frames the way client.js does.
function run(frames,{speed=60,onStep}={}){
 const tracker=new MotionTracker(),u={id:1,x:100,y:400},out=[];let time=0,accum=0,seed=7;
 const jitter=()=>{seed=(seed*16807)%2147483647;return seed/2147483647;};
 for(let n=0;n<frames;n++){
  const dt=.012+jitter()*.01;accum+=dt;while(accum>=STEP){time+=STEP;u.y-=speed*STEP;onStep?.(u,time);accum-=STEP;}
  tracker.update([u],time,MotionTracker.renderTime({time},time+accum),dt);const t=tracker.get(1);out.push({x:t.x,y:t.y,dt});
 }
 return {tracker,u,out};
}

test('units move at an even speed even though frames and simulation steps never line up',()=>{
 const {out}=run(240),speeds=[];for(let n=30;n<out.length;n++)speeds.push((out[n-1].y-out[n].y)/out[n].dt);
 assert.ok(Math.min(...speeds)>57&&Math.max(...speeds)<63,`speed stayed between ${Math.min(...speeds).toFixed(1)} and ${Math.max(...speeds).toFixed(1)} px/s`);
});

test('a server correction is eased out over a few frames instead of snapping',()=>{
 const {out}=run(120,{onStep:(u,time)=>{if(Math.abs(time-1)<1e-6)u.x+=30;}});
 const steps=out.slice(1).map((p,i)=>Math.hypot(p.x-out[i].x,p.y-out[i].y));
 assert.ok(Math.max(...steps)<8,`largest per-frame move was ${Math.max(...steps).toFixed(1)} px`);
 assert.ok(Math.abs(out.at(-1).x-130)<.5,'The unit settles on the corrected path.');
});

test('a real teleport snaps, and renamed predictions keep their motion history',()=>{
 const tracker=new MotionTracker(),u={id:'p1',x:100,y:100};
 tracker.update([u],0,0,.016);u.x=400;tracker.update([u],.1,.1,.016);assert.equal(tracker.get('p1').x,400);
 u.x=410;tracker.update([u],.2,.15,.016);tracker.rename('p1',9);const moved={...u,id:9,x:420};tracker.update([moved],.3,.2,.016);
 assert.ok(Math.abs(tracker.get(9).x-410)<1e-6,'Interpolation continues across the new id.');assert.equal(tracker.get('p1'),undefined);
});
