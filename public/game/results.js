import {ROUND} from './engine.js';

// A receipt describes settled gameplay; animations never award or change credits.
export function resultSummary(game,side,{online=false,stake=0}={}){
 const draw=game.winner===-1,win=game.winner===side,outcome=draw?'draw':win?'victory':'defeat';
 return {outcome,win,draw,ownScore:game.score[side],rivalScore:game.score[1-side],net:online&&!draw?(win?stake:-stake):0,pot:online&&win?stake*2:0,seconds:Math.max(0,Math.min(ROUND,Math.round(game.time))),rival:game.names[1-side]};
}

export function animateResult(dialog,{motion=true,winning=false}={}){
 const counters=[...dialog.querySelectorAll('[data-count]')].map(el=>({el,value:Number(el.dataset.count)||0,prefix:el.dataset.prefix||''}));
 const write=f=>counters.forEach(({el,value,prefix})=>el.textContent=prefix+Math.round(value*f).toLocaleString());
 if(!motion){write(1);return ()=>{};}
 let frame=0,start=0,last=0,stopped=false,canvas=null,ctx=null,width=0,height=0,burstIndex=0;
 const particles=[],bursts=[.12,.58,1.08,1.65],colors=['#ffe5a1','#f4c35b','#67cbed','#fff4cf'];
 const parent=dialog.parentElement;
 function resize(){if(!canvas)return;const rect=parent.getBoundingClientRect();width=rect.width;height=rect.height;const scale=Math.min(globalThis.devicePixelRatio||1,1.5);canvas.width=Math.round(width*scale);canvas.height=Math.round(height*scale);ctx?.setTransform(scale,0,0,scale,0,0);}
 if(winning){canvas=document.createElement('canvas');canvas.className='victory-particles';canvas.setAttribute('aria-hidden','true');ctx=canvas.getContext('2d');parent.prepend(canvas);resize();globalThis.addEventListener('resize',resize);}
 function burst(index){
  const x=width*(index%2?.78:.22),y=height*(index<2?.42:.30),count=width<600?32:46;
  for(let n=0;n<count&&particles.length<180;n++){const angle=n/count*Math.PI*2,speed=85+Math.random()*140;particles.push({x,y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed-60,age:0,life:1.25+Math.random()*.75,size:2+Math.random()*3,angle:Math.random()*6,spin:(Math.random()-.5)*8,color:colors[n%colors.length]});}
 }
 function tick(now){
  if(stopped)return;if(!start){start=now;last=now;}const elapsed=(now-start)/1000,dt=Math.min(.04,(now-last)/1000);last=now;
  const p=Math.min(1,elapsed/.85);write(1-Math.pow(1-p,3));
  if(ctx){ctx.clearRect(0,0,width,height);while(burstIndex<bursts.length&&elapsed>=bursts[burstIndex])burst(burstIndex++);
   for(let n=particles.length-1;n>=0;n--){const q=particles[n];q.age+=dt;if(q.age>=q.life){particles.splice(n,1);continue;}q.vy+=dt*145;q.x+=q.vx*dt;q.y+=q.vy*dt;q.angle+=q.spin*dt;ctx.save();ctx.globalAlpha=Math.min(1,(q.life-q.age)*2);ctx.fillStyle=q.color;ctx.translate(q.x,q.y);ctx.rotate(q.angle);ctx.fillRect(-q.size,-q.size/2,q.size*2,q.size);ctx.restore();}
  }
  if(elapsed<.9||(ctx&&elapsed<3.8))frame=requestAnimationFrame(tick);else{write(1);canvas?.remove();globalThis.removeEventListener('resize',resize);}
 }
 frame=requestAnimationFrame(tick);
 return ()=>{stopped=true;cancelAnimationFrame(frame);globalThis.removeEventListener('resize',resize);canvas?.remove();particles.length=0;write(1);};
}
