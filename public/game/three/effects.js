import * as THREE from 'three';
import {boardPoint,clamp} from './math.js';
import {combatTiming} from './motion.js';

export function createEffects(scene,kit,onImpact,resolveAnchors){
 const particles=[],objects=[],labels=[],labelPool=[],tint=new THREE.Color(),seen=new Set(),capacity=460,particleMaterial=new THREE.MeshBasicMaterial({color:'#ffffff',toneMapped:false}),particleMesh=new THREE.InstancedMesh(kit.geometries.rock,particleMaterial,capacity);particleMesh.frustumCulled=false;particleMesh.count=0;scene.add(particleMesh);
 const dummy=new THREE.Object3D(),white=new THREE.Color('#fff5d4'),up=new THREE.Vector3(0,1,0);let enabled=true;
 function particle(at,color,count=8,power=1){if(!enabled)return;for(let n=0;n<count&&particles.length<capacity;n++)particles.push({p:at.clone(),v:new THREE.Vector3((Math.random()-.5)*1.7*power,.5+Math.random()*1.8*power,(Math.random()-.5)*1.7*power),life:.30+Math.random()*.40,age:0,size:.028+Math.random()*.045,gravity:4.5,color:new THREE.Color(color)});}
 // Slow drifting motes: rise>0 floats sparkles upward, rise<0 drips like sweat or rain.
 function aura(at,color,count=4,rise=1,spread=.32){if(!enabled)return;for(let n=0;n<count&&particles.length<capacity;n++){const a=Math.random()*Math.PI*2,r=spread*(.35+Math.random()*.65);particles.push({p:at.clone().add(new THREE.Vector3(Math.cos(a)*r,(Math.random()-.5)*.2,Math.sin(a)*r)),v:new THREE.Vector3((Math.random()-.5)*.25,rise>0?.45+Math.random()*.55:-.15-Math.random()*.3,(Math.random()-.5)*.25),life:.65+Math.random()*.45,age:0,size:.03+Math.random()*.035,gravity:rise>0?-.35:2.6,color:new THREE.Color(color)});}}
 function ring(at,color,size=.5,life=.45){if(!enabled||objects.length>140)return;const mat=new THREE.MeshBasicMaterial({color,transparent:true,depthWrite:false,toneMapped:false}),mesh=new THREE.Mesh(kit.geometries.ring,mat);mesh.rotation.x=Math.PI/2;mesh.position.copy(at);mesh.position.y=.12;scene.add(mesh);objects.push({kind:'ring',mesh,age:0,life,size});}
 function flash(at,color,size=.6){if(!enabled||objects.length>140)return;const mesh=new THREE.Mesh(kit.geometries.gem,new THREE.MeshBasicMaterial({color,transparent:true,depthWrite:false,toneMapped:false}));mesh.position.copy(at);mesh.scale.setScalar(.03);scene.add(mesh);objects.push({kind:'flash',mesh,size,age:0,life:.17});}
 // Label canvases, textures and sprites are pooled: fights produce many damage numbers per second.
 function label(at,text,color,{life=.70,size=1,rise=.70,lift=.5,font='900 56px Arial',stroke=true}={}){
  if(!enabled||typeof document==='undefined'||!text||labels.length>=24)return;let entry=labelPool.pop();
  if(!entry){const canvas=document.createElement('canvas');canvas.width=384;canvas.height=96;const ctx=canvas.getContext('2d');if(!ctx)return;const texture=new THREE.CanvasTexture(canvas),sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true,depthTest:false,depthWrite:false}));sprite.renderOrder=10;entry={ctx,texture,sprite};}
  const {ctx,texture,sprite}=entry;ctx.clearRect(0,0,384,96);ctx.textAlign='center';ctx.font=font;if(stroke){ctx.lineWidth=7;ctx.lineJoin='round';ctx.strokeStyle='#102030';ctx.strokeText(String(text),192,68);}ctx.fillStyle=color;ctx.fillText(String(text),192,68);texture.needsUpdate=true;
  sprite.material.opacity=1;sprite.position.copy(at);sprite.position.y+=lift;sprite.scale.set(2.18*size,.54*size,1);scene.add(sprite);labels.push({entry,sprite,age:0,life,rise,y:sprite.position.y,size});
 }
 function releaseLabel(label){scene.remove(label.sprite);labelPool.push(label.entry);}
 function disposeLabel(entry){entry.texture.dispose();entry.sprite.material.dispose();}
 function number(at,amount,color){if(amount)label(at,amount,color);}
 function add(event,side,now){
  const key=event.id??`${now}:${event.kind}:${event.x}:${event.y}:${event.tx}:${event.ty}`;if(seen.has(key))return false;seen.add(key);if(seen.size>2400)for(const k of [...seen].slice(0,800))seen.delete(k);
  const anchors=resolveAnchors?.(event),from=anchors?.from?.clone()||boardPoint(event.x,event.y,side,event.attackerAir?1.6:typeof event.attacker==='string'?1.45:.85),to=anchors?.to?.clone()||boardPoint(event.tx??event.x,event.ty??event.y,side,event.targetAir?1.5:.65),color=event.color||'#b9def0';
  if(event.kind==='spawn'){ring(from,color,.65,.55);particle(from,color,11,.65);return true;}
  if(event.kind==='poof'){particle(from,color,14,.85);ring(from,color,.45,.4);return true;}
  if(event.kind==='heal'){particle(from,'#bcf3be',5,.4);ring(from,'#a6e1a7',.35,.5);return true;}
  if(event.kind!=='bolt'&&event.kind!=='hit')return true;if(objects.length>110)return true;
  const melee=event.kind==='hit',electric=event.type==='Electric',heavy=event.card===5||event.card===8,ice=event.type==='Ice',geometry=melee?(heavy?kit.geometries.gem:kit.geometries.slash):ice?kit.geometries.cone:event.type==='Nature'?kit.geometries.leaf:event.type==='Light'?kit.geometries.gem:electric?kit.geometries.rock:kit.geometries.ball;
  const material=new THREE.MeshBasicMaterial({color,toneMapped:false,transparent:true,depthWrite:false,side:THREE.DoubleSide}),mesh=new THREE.Mesh(geometry,material);mesh.position.copy(from);mesh.visible=false;scene.add(mesh);
  let bolt=null,claw=null;
  if(electric&&!melee){bolt=new THREE.InstancedMesh(kit.geometries.cylinder,new THREE.MeshBasicMaterial({color:'#fff2b4',transparent:true,opacity:.95,toneMapped:false,depthWrite:false}),10);bolt.frustumCulled=false;bolt.visible=false;scene.add(bolt);}
  if(melee&&!heavy){claw=new THREE.Mesh(kit.geometries.slash,new THREE.MeshBasicMaterial({color:event.type==='Fire'?'#ffe5a2':color,toneMapped:false,transparent:true,depthWrite:false,side:THREE.DoubleSide}));claw.visible=false;scene.add(claw);}
  if(enabled&&!melee){ring(from,color,.34,.25);particle(from,color,4,.35);}
  objects.push({kind:melee?'melee':'projectile',mesh,bolt,claw,from,to,event,age:0,...combatTiming(event),heavy,ice,electric,hit:false,trail:0});return true;
 }
 function free(e){scene.remove(e.mesh);e.mesh.material.dispose();if(e.bolt){scene.remove(e.bolt);e.bolt.material.dispose();e.bolt.dispose();}if(e.claw){scene.remove(e.claw);e.claw.material.dispose();}}
 function update(dt,camera,motion=true){enabled=motion;
  for(let n=objects.length-1;n>=0;n--){const e=objects[n];e.age+=dt;
   if(e.kind==='ring'){const p=e.age/e.life;e.mesh.scale.setScalar(Math.max(.01,e.size*(.2+p)));e.mesh.material.opacity=(1-p)*.75;}
   else if(e.kind==='flash'){const p=e.age/e.life;e.mesh.scale.set(e.size*(.1+p),e.size*(.4+p*1.6),e.size*(.1+p));e.mesh.rotation.y=p*2;e.mesh.material.opacity=(1-p)*.9;}
   else{
    const progress=clamp((e.age-e.delay)/(e.impact-e.delay),0,1),visible=e.age>e.delay&&(e.kind==='melee'||!e.hit);e.mesh.visible=visible;
    if(e.kind==='projectile'){
     e.mesh.position.lerpVectors(e.from,e.to,progress);e.mesh.position.y+=Math.sin(progress*Math.PI)*(e.electric?.04:e.event.type==='Water'?.12:.24);
     if(e.ice){e.mesh.scale.set(.12,.40,.12);e.mesh.quaternion.setFromUnitVectors(up,e.to.clone().sub(e.from).normalize());}
     else{const r=e.electric?.11:e.event.type==='Water'?.18:.12;e.mesh.scale.set(r,r,r*(e.event.type==='Water'?2.8:1.3));e.mesh.lookAt(e.to);e.mesh.rotateZ(e.age*7);}
     e.trail+=dt;if(e.trail>.025){particle(e.mesh.position,e.mesh.material.color,e.event.type==='Water'?3:2,.2);e.trail=0;}
    }else{
     const fade=1-clamp((e.age-e.impact)/(.43-e.impact),0,1);e.mesh.position.copy(e.to).lerp(e.from,(1-progress)*.46);e.mesh.rotation.set(1.1,-Math.atan2(e.to.x-e.from.x,e.to.z-e.from.z),-.9+progress*2.9+(e.event.id%2?-.2:.2));e.mesh.scale.setScalar(e.heavy?.08+progress*.35:.32+progress*.54);e.mesh.material.opacity=fade*.95;
     if(e.claw){e.claw.visible=visible;e.claw.position.copy(e.mesh.position);e.claw.position.y+=.12;e.claw.quaternion.copy(e.mesh.quaternion);e.claw.rotateZ(-.25);e.claw.scale.setScalar(.24+progress*.38);e.claw.material.opacity=fade*.75;}
    }
    if(e.bolt){e.bolt.visible=e.age>e.delay&&e.age<e.impact;const points=[];for(let k=0;k<=10;k++){const p=e.from.clone().lerp(e.to,k/10),amp=Math.sin(k/10*Math.PI)*.17;p.x+=Math.sin(k*9+e.age*83)*amp;p.y+=Math.cos(k*11+e.age*71)*amp;points.push(p);}for(let k=0;k<10;k++){const delta=points[k+1].clone().sub(points[k]);dummy.position.copy(points[k]).addScaledVector(delta,.5);dummy.quaternion.setFromUnitVectors(up,delta.clone().normalize());dummy.scale.set(.035,delta.length(),.035);dummy.updateMatrix();e.bolt.setMatrixAt(k,dummy.matrix);}e.bolt.instanceMatrix.needsUpdate=true;}
    if(e.age>=e.impact&&!e.hit){
     e.hit=true;if(e.kind==='projectile')e.mesh.visible=false;const power=e.heavy?1.45:e.event.splash?1.25:.80;
     flash(e.to,e.event.type==='Fire'?'#ffe59c':e.electric?'#fff8d4':e.mesh.material.color,e.heavy?.48:.28);
     particle(e.to,e.mesh.material.color,e.heavy?24:e.event.splash?20:12,power);ring(e.to,e.mesh.material.color,e.heavy?1.15:e.event.splash?.92:.42,e.heavy?.48:.30);
     if(e.heavy){particle(e.to,'#ab9874',14,1.3);ring(e.to,'#ddc495',.75,.38);}if(e.ice)particle(e.to,'#c2f5ff',7,.75);
     onImpact?.(e.event);number(e.to,e.event.power?'-'+Math.round(e.event.power):null,e.event.power>=150?'#ffdc8f':'#fff4db');
    }
   }
   if(e.age>e.life){free(e);objects.splice(n,1);}
  }
  for(let n=particles.length-1;n>=0;n--){const p=particles[n];p.age+=dt;if(p.age>p.life){particles.splice(n,1);continue;}p.v.y-=dt*p.gravity;p.p.addScaledVector(p.v,dt);}
  for(let n=0;n<particles.length;n++){const p=particles[n],life=1-p.age/p.life;dummy.position.copy(p.p);dummy.quaternion.identity();dummy.scale.setScalar(p.size*life);dummy.rotation.set(p.age*3,n,0);dummy.updateMatrix();particleMesh.setMatrixAt(n,dummy.matrix);particleMesh.setColorAt(n,tint.copy(p.color).lerp(white,life*.22));}particleMesh.count=particles.length;particleMesh.instanceMatrix.needsUpdate=true;if(particleMesh.instanceColor)particleMesh.instanceColor.needsUpdate=true;
  for(let n=labels.length-1;n>=0;n--){const label=labels[n];label.age+=dt;const p=label.age/label.life,pop=label.size*(1+Math.max(0,.25-p)*1.2);label.sprite.position.y=label.y+p*label.rise;label.sprite.scale.set(2.18*pop,.54*pop,1);label.sprite.material.opacity=Math.max(0,Math.min(1,(1-p)*1.6));if(p>=1){releaseLabel(label);labels.splice(n,1);}}
 }
 return {add,update,setMotion(value){enabled=value;},burst:particle,aura,ring,label,dispose(){objects.forEach(free);labels.forEach(releaseLabel);labelPool.forEach(disposeLabel);labelPool.length=0;particleMaterial.dispose();scene.remove(particleMesh);particleMesh.dispose();objects.length=0;particles.length=0;labels.length=0;},get count(){return particles.length+objects.length;}};
}
