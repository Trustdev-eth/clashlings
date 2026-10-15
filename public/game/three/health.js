import * as THREE from 'three';
import {clamp} from './math.js';

// Fixed CSS pixels keep health readable independently of camera distance.
export function placeHealthLabels(items,width,height){
 const placed=[],result=[];
 for(const item of [...items].sort((a,b)=>b.priority-a.priority)){
  let best=null;
  for(const [dx,dy] of [[0,0],[0,-25],[0,25],[-64,-12],[64,-12],[0,-50],[0,50],[-64,-38],[64,-38]]){
   const left=clamp(item.x-item.width/2+dx,4,Math.max(4,width-item.width-4)),top=clamp(item.y-item.height+dy,35,Math.max(35,height-item.height-4));
   const overlap=placed.reduce((sum,p)=>sum+Math.max(0,Math.min(left+item.width,p.left+p.width)-Math.max(left,p.left))*Math.max(0,Math.min(top+item.height,p.top+p.height)-Math.max(top,p.top)),0),score=overlap*100+Math.abs(dx)+Math.abs(dy)*.9;
   if(!best||score<best.score)best={...item,left,top,score};
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
  const bar={position:new THREE.Vector3(),visible:true,hp:0,maxHp:1,width:76,height:tower?23:29,element,set(hp,maxHp){if(this.hp===hp&&this.maxHp===maxHp)return;this.hp=hp;this.maxHp=maxHp;fill.style.width=`${clamp(hp/Math.max(1,maxHp),0,1)*100}%`;amount.textContent=String(Math.max(0,Math.ceil(hp)));element.classList.toggle('is-low',hp/maxHp<.3);},setMarket(mult,status){if(tower)return;const percent=Math.round((mult-1)*100),text=`${name} · ${level} ${percent>0?'▲+':percent<0?'▼':''}${percent}%`;if(title.textContent!==text){const shifted=this.percent!==undefined&&this.percent!==percent;this.percent=percent;title.textContent=text;if(shifted){element.classList.remove('market-pop');void element.offsetWidth;element.classList.add('market-pop');}}element.dataset.market=status==='live'?(percent>0?'up':percent<0?'down':'flat'):'neutral';},dispose(){element.remove();bars.delete(this);}};
  bars.add(bar);return bar;
 }
 function update(camera,width,height){
  const items=[];
  for(const bar of bars){const p=bar.position.clone().project(camera),visible=bar.visible&&p.z>-1&&p.z<1&&Math.abs(p.x)<1.1&&Math.abs(p.y)<1.1;bar.element.hidden=!visible;if(visible)items.push({bar,x:(p.x+1)*width/2,y:(1-p.y)*height/2,width:bar.width,height:bar.height,priority:(bar.element.classList.contains('is-tower')?2:0)+(1-bar.hp/bar.maxHp)});}
  for(const item of placeHealthLabels(items,width,height)){
   const {bar,left,top,x,y}=item;bar.element.style.transform=`translate(${Math.round(left)}px,${Math.round(top)}px)`;
   const dx=x-(left+bar.width/2),dy=y-(top+bar.height),length=Math.hypot(dx,dy);const stem=bar.element.firstElementChild;stem.style.height=`${length}px`;stem.style.transform=`rotate(${-Math.atan2(dx,dy)}rad)`;stem.hidden=length<4;
  }
 }
 return {create,update,dispose(){bars.clear();layer.remove();}};
}
