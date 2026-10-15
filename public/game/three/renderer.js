import * as THREE from 'three';
import {CARDS,STEP,deploymentZones,canDeployAt} from '../engine.js';
import {createKit,createCreature,animateCreature,disposeCreature} from './models.js';
import {buildEnvironment,createTower} from './environment.js';
import {createEffects} from './effects.js';
import {createHealthHUD} from './health.js';
import {combatTiming} from './motion.js';
import {boardPoint,pickBoard,fitCamera,surfaceHeight,turnAngle,clamp} from './math.js';

export function create3DRenderer(canvas){
 const gl=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'}),scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(36,600/760,.1,160),targetCamera=camera.clone(),kit=createKit(),units=new Map(),towers=new Map(),preview=[],healthHUD=createHealthHUD(canvas);
 let width=0,height=0,previousGame=null,previousSide=-1,last=performance.now()/1000,visualTime=0,orbit=0,cinematic=false,zoom=1,shake=0,disposed=false,lost=false,firstCamera=true,marketSeq=-1,marketLevels=[];
 const MOOD_UP=new THREE.Color('#ffd34f'),MOOD_DOWN=new THREE.Color('#7c8cff'),EMOJI_FONT='64px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';
 const mobile=canvas.clientWidth<420;
 gl.setPixelRatio(Math.min(window.devicePixelRatio||1,mobile?1.25:1.6));gl.outputColorSpace=THREE.SRGBColorSpace;gl.toneMapping=THREE.ACESFilmicToneMapping;gl.toneMappingExposure=1;gl.shadowMap.enabled=true;gl.shadowMap.type=THREE.PCFShadowMap;gl.setClearColor('#140e36');scene.fog=new THREE.Fog('#1b1350',46,100);
 const sky=document.createElement('canvas');sky.width=2;sky.height=256;{const c=sky.getContext('2d'),fade=c.createLinearGradient(0,0,0,256);fade.addColorStop(0,'#3a1f86');fade.addColorStop(.45,'#211660');fade.addColorStop(1,'#120c2e');c.fillStyle=fade;c.fillRect(0,0,2,256);}
 const skyTexture=new THREE.CanvasTexture(sky);skyTexture.colorSpace=THREE.SRGBColorSpace;scene.background=skyTexture;
 const hemi=new THREE.HemisphereLight('#e8f0ff','#3b2f66',1.35);scene.add(hemi);
 const sun=new THREE.DirectionalLight('#fff1d6',2.3);sun.position.set(-6,14,8);sun.castShadow=true;sun.shadow.mapSize.set(mobile?1024:2048,mobile?1024:2048);sun.shadow.camera.left=-10;sun.shadow.camera.right=10;sun.shadow.camera.top=11;sun.shadow.camera.bottom=-11;sun.shadow.camera.near=.5;sun.shadow.camera.far=40;sun.shadow.normalBias=.035;sun.shadow.bias=-.0004;scene.add(sun);
 const rim=new THREE.DirectionalLight('#b98cff',1);rim.position.set(6,7,-9);scene.add(rim);
 const environment=buildEnvironment(scene,kit),effects=createEffects(scene,kit,event=>{
  const u=units.get(event.victim);if(u){u.hit=1;u.hitStop=Math.max(u.hitStop,combatTiming(event).hold);const recoil=boardPoint(event.tx??event.x,event.ty??event.y,previousSide).sub(boardPoint(event.x,event.y,previousSide));if(recoil.lengthSq()>.001)u.recoil.copy(recoil.normalize().multiplyScalar(event.splash?.16:.11));}
  const attacker=units.get(event.attacker);if(attacker)attacker.hitStop=Math.max(attacker.hitStop,combatTiming(event).hold);const tower=towers.get(event.victim);if(tower)tower.hit=1;shake=Math.max(shake,event.card===5||event.card===8?.8:event.splash?.6:.24);
 },event=>{const attacker=units.get(event.attacker),victim=units.get(event.victim),tower=towers.get(event.victim),source=attacker?.rig.head||attacker?.rig.body,target=victim?.rig.body||tower?.body;return {from:attacker?.rig.head?attacker.rig.head.localToWorld(new THREE.Vector3(0,-.04,.30)):source?.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0,.06,0)),to:target?.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0,victim?.65:.8,0))};});
 const selectionMaterial=new THREE.MeshBasicMaterial({color:'#ffe58c',transparent:true,opacity:.95,depthWrite:false,toneMapped:false}),selection=new THREE.Mesh(kit.geometries.ring,selectionMaterial);selection.rotation.x=Math.PI/2;selection.scale.setScalar(.48);selection.visible=false;scene.add(selection);
 const zoneMaterial=new THREE.MeshBasicMaterial({color:'#2ba9ed',transparent:true,opacity:.16,depthWrite:false,side:THREE.DoubleSide,toneMapped:false}),zone=new THREE.Mesh(new THREE.PlaneGeometry(10.48,4.44),zoneMaterial);zone.rotation.x=-Math.PI/2;zone.position.set(0,.09,(523-380)/50);zone.visible=false;scene.add(zone);const extraZones=Array.from({length:2},()=>{const z=new THREE.Mesh(zone.geometry,zoneMaterial);z.rotation.x=-Math.PI/2;z.visible=false;scene.add(z);return z;});
 function lens(){camera.aspect=targetCamera.aspect;camera.fov=targetCamera.fov;camera.projectionMatrix.copy(targetCamera.projectionMatrix);camera.projectionMatrixInverse.copy(targetCamera.projectionMatrixInverse);}
 function size(){const rect=canvas.getBoundingClientRect(),w=Math.max(1,Math.round(rect.width)),h=Math.max(1,Math.round(rect.height));if(w!==width||h!==height){width=w;height=h;gl.setSize(w,h,false);fitCamera(targetCamera,w/h,orbit,cinematic,zoom);lens();if(firstCamera){camera.position.copy(targetCamera.position);camera.quaternion.copy(targetCamera.quaternion);firstCamera=false;}}}
 const observer=typeof ResizeObserver!=='undefined'?new ResizeObserver(size):null;observer?.observe(canvas);size();
 const lostHandler=event=>{event.preventDefault();lost=true;const label=canvas.parentElement?.querySelector('#scene-mode');if(label)label.textContent='RESTORING 3D…';},restoredHandler=()=>{lost=false;const label=canvas.parentElement?.querySelector('#scene-mode');if(label)label.textContent='LIVE 3D';};canvas.addEventListener('webglcontextlost',lostHandler);canvas.addEventListener('webglcontextrestored',restoredHandler);
 function createEntry(u,side,now,level){
  const rig=createCreature(u.card,kit),position=boardPoint(u.x,u.y,side),baseScale=rig.modelScale*(u.baby?.75:1.28);rig.root.scale.setScalar(baseScale);
  rig.phase=((Number(u.id)||0)*.618%1)*Math.PI*2;
  const box=new THREE.Box3().setFromObject(rig.root),health=healthHUD.create({friendly:u.p===side,name:CARDS[u.card].symbol,level:level||1}),teamMaterial=new THREE.MeshBasicMaterial({color:u.p===side?'#28cfff':'#ff576d',transparent:true,opacity:.95,depthWrite:false,toneMapped:false}),teamRing=new THREE.Mesh(kit.geometries.ring,teamMaterial);teamRing.rotation.x=Math.PI/2;teamRing.scale.setScalar(u.baby?.31:.48);scene.add(teamRing);
  const statusMaterial=new THREE.MeshBasicMaterial({color:'#b4e6f3',transparent:true,opacity:.8,depthWrite:false,toneMapped:false}),statusHalo=new THREE.Mesh(kit.geometries.ring,statusMaterial);statusHalo.rotation.x=Math.PI/2;statusHalo.scale.setScalar(.38);statusHalo.position.y=.88;statusHalo.visible=false;rig.root.add(statusHalo);scene.add(rig.root);
  const moodMaterial=new THREE.MeshBasicMaterial({color:MOOD_UP,transparent:true,opacity:0,depthWrite:false,toneMapped:false}),moodRing=new THREE.Mesh(kit.geometries.ring,moodMaterial);moodRing.rotation.x=Math.PI/2;moodRing.visible=false;scene.add(moodRing);
  const e={rig,health,teamRing,teamMaterial,statusHalo,statusMaterial,moodRing,moodMaterial,mood:null,react:0,lastAura:now,card:u.card,owner:u.p,position,from:position.clone(),to:position.clone(),received:now,lastX:u.x,lastY:u.y,heading:u.p===side?Math.PI:0,distance:0,lastDust:0,moving:0,attackAt:-100,animationTime:now,hitStop:0,combo:-1,hit:0,recoil:new THREE.Vector3(),born:now,deadAt:null,baby:!!u.baby,hp:u.hp,barHeight:box.max.y+.10,baseScale};units.set(u.id,e);return e;
 }
 // A predicted unit can be renumbered by the authoritative state; keep its model instead of a death and respawn.
 function adopt(u,present){for(const [id,e]of units)if(!present.has(id)&&e.deadAt===null&&e.card===u.card&&e.owner===u.p&&e.baby===!!u.baby&&Math.hypot(e.lastX-u.x,e.lastY-u.y)<48){units.delete(id);units.set(u.id,e);return e;}return null;}
 function disposeEntry(id,e){scene.remove(e.rig.root,e.teamRing,e.moodRing);e.health.dispose();e.teamMaterial.dispose();e.statusMaterial.dispose();e.moodMaterial.dispose();disposeCreature(e.rig);units.delete(id);}
 // Market reaction: buffs cheer with sparkles, nerfs shudder with cold drips; announce adds the floating % and emoji.
 function marketReaction(e,dir,mult,strong,announce){
  const up=dir>0,at=e.rig.root.position.clone(),head=at.clone(),pct=Math.round((mult-1)*100);head.y+=e.barHeight*.85;e.react=up?1:-1;
  effects.ring(at,up?MOOD_UP:MOOD_DOWN,up?1.05:.8,.65);
  if(up){effects.burst(head,'#ffe07a',strong?18:10,strong?1:.7);effects.aura(at.clone().setY(at.y+.3),'#fff1a8',strong?10:6,1,.42);}
  else{effects.aura(head,'#9cc0ff',strong?12:7,-1,.3);effects.burst(at.clone().setY(.2),'#5b6fa8',strong?8:4,.35);}
  if(!announce)return;
  effects.label(at,`${up?'▲':'▼'} ${pct>0?'+':''}${pct}% DMG`,up?'#ffe27a':'#a9bcff',{life:1.5,size:.85,rise:.5,lift:e.barHeight+.5});
  effects.label(at,up?(strong?'🤩':'😄'):(strong?'😱':'😰'),'#fff',{life:1.35,size:1.1,rise:.35,lift:e.barHeight+1.0,font:EMOJI_FONT,stroke:false});
 }
 function draw(g,options={}){
  if(disposed||lost||!g)return;size();const now=performance.now()/1000,dt=Math.min(.06,Math.max(.001,now-last));last=now;const side=options.side||0,motion=options.motion!==false;if(!options.paused)visualTime+=dt;const t=visualTime;effects.setMotion(motion);
  camera.position.lerp(targetCamera.position,motion?1-Math.exp(-dt*7):1);camera.quaternion.slerp(targetCamera.quaternion,motion?1-Math.exp(-dt*7):1);camera.updateMatrixWorld(true);
  if(previousSide!==side){for(const e of towers.values()){scene.remove(e.root);e.health.dispose();e.dispose();}towers.clear();for(const [id,e]of units)disposeEntry(id,e);previousSide=side;}
  for(const state of g.towers){
   let e=towers.get(state.id);if(!e){e=createTower(state,kit,side);e.health=healthHUD.create({friendly:state.p===side,tower:true,name:`${state.p===side?'Your':'Rival'} ${state.king?'King':'Tower'}`});scene.add(e.root);towers.set(state.id,e);}
   if(state.hp<e.hp)e.hit=1;e.hp=state.hp;e.hit=Math.max(0,e.hit-dt*4);e.body.rotation.z=Math.sin(t*50)*e.hit*.045*(motion?1:0);
   for(const f of e.flags){f.rotation.y=Math.sin(t*3.7+state.x)*.20*(motion?1:0);f.scale.x=.37+Math.sin(t*4)*.025*(motion?1:0);}
   if(state.hp<=0){if(e.deadAt===null){e.deadAt=t;effects.burst(e.root.position.clone().add(new THREE.Vector3(0,.7,0)),'#bba581',26,1.7);effects.ring(e.root.position,'#ffe0a3',1.3,.6);shake=1;}const fall=clamp((t-e.deadAt)/.85,0,1);e.body.position.y=-fall*1.48;e.body.rotation.z=fall*.30;e.root.scale.y=1-fall*.60;e.health.visible=false;}
   else{e.health.visible=true;e.health.position.copy(e.root.position);e.health.position.y=state.king?2.65:2.2;e.health.set(state.hp,state.maxHp);}
  }
  const live=new Set(),market=g.market,sequence=market?.sequence??0,levelOf=i=>market?.status?.[i]==='live'?market.multipliers[i]??1:1,shift=market&&sequence>marketSeq&&sequence-marketSeq<=2?market.multipliers.map((_,i)=>levelOf(i)-(marketLevels[i]??1)):null,announced=new Set();
  if(sequence!==marketSeq){marketSeq=sequence;marketLevels=market?market.multipliers.map((_,i)=>levelOf(i)):[];}
  const present=new Set(g.units.map(u=>u.id));
  for(const u of g.units){
   live.add(u.id);const e=units.get(u.id)||adopt(u,present)||createEntry(u,side,t,g.levels[u.p][u.card]),goal=boardPoint(u.x,u.y,side);
   if(e.lastX!==u.x||e.lastY!==u.y){e.blend=Math.hypot(u.x-e.lastX,u.y-e.lastY)>12?.22:STEP;e.from.copy(e.position);e.to.copy(goal);e.received=t;e.lastX=u.x;e.lastY=u.y;}
   const before=e.position.clone(),duration=options.online?.25:e.blend||STEP,f=clamp((t-e.received)/duration,0,1);e.position.lerpVectors(e.from,e.to,f);if(options.interpolated)e.position.copy(goal);const travel=before.distanceTo(e.position);e.distance+=travel;e.moving=THREE.MathUtils.damp(e.moving,travel/dt>.12?1:0,9,dt);
   const aim=travel>.0002?e.position.clone().sub(before):new THREE.Vector3(u.facingX||0,0,(side===1?-1:1)*(u.facingY||0));if(aim.lengthSq()>.00001)e.heading=turnAngle(e.heading,Math.atan2(aim.x,aim.z),1-Math.exp(-dt*13));
   e.hit=Math.max(0,e.hit-dt*4);if(u.hp<e.hp)e.hit=Math.max(e.hit,.55);e.hp=u.hp;e.statusHalo.visible=u.stun>0||u.slow>0;e.statusMaterial.color.set(u.stun>0?'#ffe067':'#8be5ff');e.statusHalo.rotation.z=motion?t*3:0;e.recoil.multiplyScalar(Math.exp(-dt*13));
   e.rig.root.position.copy(e.position).addScaledVector(e.recoil,e.hit);const hover=e.rig.float+(e.rig.kind==='fly'&&motion?Math.sin(t*4+u.id)*.08:0);e.rig.root.position.y=surfaceHeight(u.x,u.y)+.055+hover;e.rig.root.rotation.y=e.heading;
   const animationDt=options.paused||motion&&e.hitStop>0?0:dt;e.hitStop=Math.max(0,e.hitStop-dt);e.animationTime+=animationDt;
   const mult=levelOf(u.card),moodGoal=clamp((mult-1)/.15,-1,1),key=u.p+':'+u.card;e.react=Math.sign(e.react)*Math.max(0,Math.abs(e.react)-animationDt/1.1);
   if(e.mood===null){e.mood=moodGoal;if(Math.abs(moodGoal)>=.2){marketReaction(e,moodGoal,mult,Math.abs(moodGoal)>=.6,!announced.has(key));announced.add(key);}}
   else if(shift&&Math.abs(shift[u.card])>=.005){marketReaction(e,shift[u.card],mult,Math.abs(shift[u.card])>=.03,!announced.has(key));announced.add(key);}
   e.mood=THREE.MathUtils.damp(e.mood,moodGoal,3,dt);const strength=Math.abs(e.mood);
   if(motion&&!options.paused&&strength>.3&&t-e.lastAura>.9-strength*.4){e.lastAura=t;const at=e.rig.root.position.clone();if(e.mood>0)effects.aura(at.setY(at.y+.25),'#ffe38a',2,1,.36);else effects.aura(at.setY(at.y+e.barHeight*.85),'#9cc0ff',1,-1,.18);}
   animateCreature(e.rig,{time:e.animationTime,distance:e.distance,moving:e.moving,attack:e.animationTime-e.attackAt,combo:e.combo,hit:e.hit,stun:u.stun,engaged:u.action==='attack',motion,mood:e.mood,react:e.react});
   const pop=motion?clamp((t-e.born)/.30,0,1):1;e.rig.root.scale.setScalar(e.baseScale*(.12+.88*(1-Math.pow(1-pop,3))));
   e.teamRing.position.copy(e.position);e.teamRing.position.y=surfaceHeight(u.x,u.y)+.09;e.teamRing.scale.setScalar((e.baby?.31:.48)*(1+e.hit*.10));
   e.moodRing.visible=strength>.05;if(e.moodRing.visible){const pulse=motion?Math.sin(t*(e.mood>0?6:2.5)+u.id):0;e.moodMaterial.color.copy(e.mood>0?MOOD_UP:MOOD_DOWN);e.moodMaterial.opacity=(.22+.55*strength)*(.8+.2*pulse);e.moodRing.position.copy(e.teamRing.position);e.moodRing.position.y+=.012;e.moodRing.scale.setScalar((e.baby?.38:.6)*(1+(e.mood>0?pulse*.04:0)+Math.abs(e.react)*.35));}
   if(motion&&e.moving>.35&&e.distance-e.lastDust>(e.rig.kind==='golem'?.21:.30)){e.lastDust=e.distance;effects.burst(e.position.clone().setY(.11),e.rig.kind==='fly'?CARDS[u.card].color:'#b8a578',e.rig.kind==='golem'?3:1,.26);}
   e.health.position.copy(e.rig.root.position);e.health.position.y+=e.barHeight+Math.max(0,e.rig.body.position.y)*e.baseScale+(e.rig.kind==='fly'&&!e.rig.swim?.20:0);e.health.set(u.hp,u.maxHp);e.health.setMarket?.(g.market?.multipliers?.[u.card]??1,g.market?.status?.[u.card]||'no-baseline');e.health.visible=true;
  }
  for(const [id,e]of units)if(!live.has(id)){e.deadAt??=t;const death=clamp((t-e.deadAt)/.48,0,1);e.health.visible=false;e.teamRing.visible=false;e.moodRing.visible=false;animateCreature(e.rig,{time:t,distance:e.distance,moving:0,dying:death,motion});e.rig.root.scale.setScalar(e.baseScale*(1-death*.9));if(death>=1)disposeEntry(id,e);}
  if(previousGame!==g||!options.online){for(const event of g.effects){const fresh=effects.add(event,side,g.time);if(fresh&&event.attacker!==undefined){const e=units.get(event.attacker);if(e&&e.lastEvent!==event.id){e.lastEvent=event.id;e.attackAt=e.animationTime;e.combo=(e.combo+1)%3;}}}previousGame=g;}
  zone.visible=options.active&&options.selected>=0;const zones=deploymentZones(g,side),meshes=[zone,...extraZones];for(let i=0;i<meshes.length;i++){const z=zones[i],mesh=meshes[i];mesh.visible=zone.visible&&!!z;if(z){mesh.scale.set(z.w/524,z.h/222,1);mesh.position.copy(boardPoint(z.x+z.w/2,z.y+z.h/2,side,.09));}}const pointer=options.pointer;selection.visible=!!(zone.visible&&pointer&&canDeployAt(g,side,pointer.x,side===1?760-pointer.y:pointer.y));
  if(selection.visible){selection.position.copy(boardPoint(pointer.x,pointer.y,0,.10));selection.position.y+=surfaceHeight(pointer.x,pointer.y);selection.scale.setScalar(.44+(motion?Math.sin(t*8)*.035:0));}
  const showPreview=!options.active&&g.time===0;
  if(showPreview&&preview.length===0){for(const [id,x,y,p]of [[0,205,505,0],[2,415,540,0],[1,180,285,1],[5,415,270,1],[7,395,390,1]]){const rig=createCreature(id,kit);rig.root.scale.multiplyScalar(1.28);scene.add(rig.root);preview.push({rig,x,y,p});}}
  for(const e of preview){e.rig.root.visible=showPreview;if(showPreview){e.rig.root.position.copy(boardPoint(e.x,e.y,0,.06+e.rig.float));e.rig.root.rotation.y=e.p===0?Math.PI:0;animateCreature(e.rig,{time:t,distance:0,motion});}}
  environment.update(t,motion);effects.update(options.paused?0:dt,camera,motion);shake=Math.max(0,shake-dt*3);const offset=motion?Math.sin(t*59)*shake*.055:0;camera.position.x+=offset;camera.updateMatrixWorld(true);gl.render(scene,camera);healthHUD.update(camera,width,height);camera.position.x-=offset;camera.updateMatrixWorld(true);
 }
 return {mode:'3d',draw,pick(clientX,clientY){const r=canvas.getBoundingClientRect();return pickBoard(camera,(clientX-r.left)/r.width,(clientY-r.top)/r.height);},setCamera(action){if(action==='left')orbit=clamp(orbit-.22,-.66,.66);if(action==='right')orbit=clamp(orbit+.22,-.66,.66);if(action==='view')cinematic=!cinematic;if(action==='zoom')zoom=zoom===1?1.15:1;if(action==='reset'){orbit=0;zoom=1;cinematic=false;}fitCamera(targetCamera,width/height,orbit,cinematic,zoom);lens();},get info(){return {drawCalls:gl.info.render.calls,triangles:gl.info.render.triangles,units:units.size,effects:effects.count};},dispose(){if(disposed)return;disposed=true;observer?.disconnect();canvas.removeEventListener('webglcontextlost',lostHandler);canvas.removeEventListener('webglcontextrestored',restoredHandler);for(const [id,e]of units)disposeEntry(id,e);for(const e of towers.values()){e.health.dispose();e.dispose();}for(const e of preview)disposeCreature(e.rig);healthHUD.dispose();effects.dispose();environment.dispose();skyTexture.dispose();zone.geometry.dispose();zoneMaterial.dispose();selectionMaterial.dispose();kit.dispose();sun.shadow.map?.dispose();gl.renderLists.dispose();gl.dispose();gl.forceContextLoss();scene.clear();}};
}
