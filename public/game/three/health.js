import * as THREE from 'three';
import {clamp} from './math.js';

// Fixed CSS pixels keep health readable independently of camera distance.
const SLOTS=[[0,0],[0,-25],[0,25],[-64,-12],[64,-12],[0,-50],[0,50],[-64,-38],[64,-38]];
// item.slot is the previous choice; keeping it unless it clearly overlaps stops labels hopping every frame.
export function placeHealthLabels(items,width,height){
 const placed=[],result=[];
 for(const item of [...items].sort((a,b)=>b.priority-a.priority)){
  let best=null;
  for(let slot=0;slot<SLOTS.length;slot++){
   const [dx,dy]=SLOTS[slot],left=clamp(item.x-item.width/2+dx,4,Math.max(4,width-item.width-4)),top=clamp(item.y-item.height+dy,35,Math.max(35,height-item.height-4));
   const overlap=placed.reduce((sum,p)=>sum+Math.max(0,Math.min(left+item.width,p.left+p.width)-Math.max(left,p.left))*Math.max(0,Math.min(top+item.height,p.top+p.height)-Math.max(top,p.top)),0),score=overlap*100+Math.abs(dx)+Math.abs(dy)*.9+(item.slot!==undefined&&slot!==item.slot?60:0);
   if(!best||score<best.score)best={...item,left,top,score,slot};
  }
  placed.push(best);result.push(best);
 }
 return result;
}
export function createHealthHUD(canvas){
 const layer=document.createElement('div'),bars=new Set();layer.className='arena-health-layer';layer.setAttribute('aria-hidden','true');canvas.insertAdjacentElement('afterend',layer);
 function create({friendly,tower=false,name='',level=1}){
  const element=document.createElement('div'),title=document.createElement('span'),track=document.createElement('span'),fill=document.createElement('i'),amount=document.createElement('b'),stem=document.createElement('span');
  element.className=`health-label ${friendly?'is-own':'is-rival'}${tower?' is-tower':''}`;title.className='health-name';title.textContent=tower?name:`${name} · ${level}`;track.className='health-track';stem.className='health-stem';track.append(fill,amount);element.append(stem,title,track);layer.append(element);
  const bar={position:new THREE.Vector3(),visible:true,hp:0,maxHp:1,width:76,height:tower?23:29,element,set(hp,maxHp){if(this.hp===hp&&this.maxHp===maxHp)return;this.hp=hp;this.maxHp=maxHp;fill.style.width=`${clamp(hp/Math.max(1,maxHp),0,1)*100}%`;amount.textContent=String(Math.max(0,Math.ceil(hp)));element.classList.toggle('is-low',hp/maxHp<.3);},setMarket(mult,status){if(tower)return;const percent=Math.round((mult-1)*100),text=`${name} · ${level} ${percent>0?'▲+':percent<0?'▼':''}${percent}%`;if(title.textContent!==text){const shifted=this.percent!==undefined&&this.percent!==percent;this.percent=percent;title.textContent=text;if(shifted){element.classList.remove('market-pop');void element.offsetWidth;element.classList.add('market-pop');}}const market=status==='live'?(percent>0?'up':percent<0?'down':'flat'):'neutral';if(element.dataset.market!==market)element.dataset.market=market;},dispose(){element.remove();bars.delete(this);}};
  bars.add(bar);return bar;
 }
 const projected=new THREE.Vector3();let lastUpdate=null;
 function update(camera,width,height){
  const now=performance.now()/1000,ease=lastUpdate===null?1:1-Math.exp(-Math.min(.1,now-lastUpdate)*16),items=[];lastUpdate=now;
  for(const bar of bars){const p=projected.copy(bar.position).project(camera),visible=bar.visible&&p.z>-1&&p.z<1&&Math.abs(p.x)<1.1&&Math.abs(p.y)<1.1;if(bar.element.hidden===visible)bar.element.hidden=!visible;if(!visible)bar.offset=null;else items.push({bar,slot:bar.slot,x:(p.x+1)*width/2,y:(1-p.y)*height/2,width:bar.width,height:bar.height,priority:(bar.element.classList.contains('is-tower')?2:0)+(1-bar.hp/bar.maxHp)});}
  for(const item of placeHealthLabels(items,width,height)){
   // The anchor follows the creature exactly; only the slot offset eases, so a slot change glides instead of jumping.
   const {bar,x,y}=item,goalX=item.left-x,goalY=item.top-y;bar.slot=item.slot;bar.offset??={x:goalX,y:goalY};bar.offset.x+=(goalX-bar.offset.x)*ease;bar.offset.y+=(goalY-bar.offset.y)*ease;
   const left=x+bar.offset.x,top=y+bar.offset.y,transform=`translate(${Math.round(left)}px,${Math.round(top)}px)`;if(bar.transform!==transform){bar.transform=transform;bar.element.style.transform=transform;}
   const dx=x-(left+bar.width/2),dy=y-(top+bar.height),length=Math.hypot(dx,dy),stem=bar.element.firstElementChild,short=length<4;if(stem.hidden!==short)stem.hidden=short;if(!short){stem.style.height=`${Math.round(length)}px`;stem.style.transform=`rotate(${(-Math.atan2(dx,dy)).toFixed(3)}rad)`;}
  }
 }
 return {create,update,dispose(){bars.clear();layer.remove();}};
}
