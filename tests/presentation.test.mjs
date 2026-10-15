import test from 'node:test';
import assert from 'node:assert/strict';
import {battleLayout} from '../public/game/layout.js';
import {resultSummary,animateResult} from '../public/game/results.js';
import {newGame} from '../public/game/engine.js';

test('portrait tablets use a horizontal hand instead of stretching a side column',()=>{
 for(const [w,h] of [[768,1024],[820,1180],[1032,1376],[1024,1366]]){
  const layout=battleLayout(w,h,true);assert.equal(layout.dock,'bottom');assert.equal(layout.sidebar,false);
 }
 const landscape=battleLayout(1376,1032,true);assert.equal(landscape.dock,'side');assert.equal(landscape.sidebar,false);
});
test('phones enter focused play and short landscape screens keep a usable side dock',()=>{
 for(const [w,h] of [[320,568],[375,667],[390,844],[430,932]]){const l=battleLayout(w,h,true);assert.equal(l.dock,'bottom');assert.equal(l.immersive,true);assert.equal(l.sidebar,false);}
 for(const [w,h] of [[667,375],[740,360],[844,390],[932,430]])assert.equal(battleLayout(w,h,true).dock,'side');
});
test('mode choices remain available in compact lobbies and sidebar lobbies',()=>{
 assert.equal(battleLayout(390,844,false).immersive,false);assert.equal(battleLayout(1032,1376,false).sidebar,false);assert.equal(battleLayout(1440,900,false).sidebar,true);assert.equal(battleLayout(1440,900,true).sidebar,false);
});
test('the win receipt distinguishes net earnings from return of the stake',()=>{
 const g=newGame();g.winner=0;g.score=[3,1];g.time=80;
 const r=resultSummary(g,0,{online:true,stake:50});assert.equal(r.outcome,'victory');assert.equal(r.net,50);assert.equal(r.pot,100);assert.equal(r.ownScore,3);assert.equal(r.rivalScore,1);assert.equal(r.seconds,80);
 const rival=resultSummary(g,1,{online:true,stake:50});assert.equal(rival.outcome,'defeat');assert.equal(rival.net,-50);assert.equal(rival.ownScore,1);assert.equal(rival.rivalScore,3);
});
test('practice and draw receipts never imply a credit reward',()=>{
 const g=newGame();g.winner=0;assert.equal(resultSummary(g,0,{online:false,stake:100}).net,0);assert.equal(resultSummary(g,0,{online:false,stake:100}).pot,0);
 g.winner=-1;const r=resultSummary(g,1,{online:true,stake:100});assert.equal(r.outcome,'draw');assert.equal(r.net,0);assert.equal(r.pot,0);g.time=200;assert.equal(resultSummary(g,0).seconds,150);
});
test('reduced-motion results show final counts immediately without creating effects',()=>{
 const counter={dataset:{count:'1250',prefix:'+'},textContent:''};const cleanup=animateResult({querySelectorAll:()=>[counter]},{motion:false,winning:true});assert.equal(counter.textContent,'+1,250');cleanup();assert.equal(counter.textContent,'+1,250');
});
test('closing a victory cancels animation, removes particles and completes the receipt',()=>{
 const originals={};for(const name of ['requestAnimationFrame','cancelAnimationFrame','addEventListener','removeEventListener','document'])originals[name]=globalThis[name];
 const callbacks=new Map(),listeners=new Set();let nextId=0,removed=false,draws=0;
 const ctx={setTransform(){},clearRect(){},save(){},restore(){},translate(){},rotate(){},fillRect(){draws++;}},canvas={setAttribute(){},getContext:()=>ctx,remove(){removed=true;}},counter={dataset:{count:'50',prefix:'+'},textContent:'+50'},parent={getBoundingClientRect:()=>({width:390,height:844}),prepend(){}};
 globalThis.requestAnimationFrame=fn=>{callbacks.set(++nextId,fn);return nextId;};globalThis.cancelAnimationFrame=id=>callbacks.delete(id);globalThis.addEventListener=(event,fn)=>listeners.add(fn);globalThis.removeEventListener=(event,fn)=>listeners.delete(fn);globalThis.document={createElement:()=>canvas};
 try{const stop=animateResult({querySelectorAll:()=>[counter],parentElement:parent},{motion:true,winning:true});
  const run=time=>{const [id,fn]=callbacks.entries().next().value;callbacks.delete(id);fn(time);};run(100);run(300);assert.ok(draws>0);assert.ok(callbacks.size>0);stop();assert.equal(callbacks.size,0);assert.equal(listeners.size,0);assert.equal(removed,true);assert.equal(counter.textContent,'+50');
 }finally{for(const [name,value]of Object.entries(originals)){if(value===undefined)delete globalThis[name];else globalThis[name]=value;}}
});
