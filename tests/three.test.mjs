import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createKit,createCreature,animateCreature,disposeCreature,CHARACTER_LANDMARKS} from '../public/game/three/models.js';
import {buildEnvironment,createTower} from '../public/game/three/environment.js';
import {createEffects} from '../public/game/three/effects.js';
import {boardPoint,boardFromWorld,fitCamera,pickBoard,legIK,attackEnvelope,arenaFramePoints} from '../public/game/three/math.js';
import {combatPose,combatTiming} from '../public/game/three/motion.js';
import {placeHealthLabels} from '../public/game/three/health.js';
import {newGame,deploy,step} from '../public/game/engine.js';

test('all twelve creatures are volumetric mesh models with valid materials and animation rigs',()=>{const kit=createKit();for(let id=0;id<12;id++){const rig=createCreature(id,kit);rig.root.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(rig.root),size=box.getSize(new THREE.Vector3());assert.ok(size.x>.2&&size.y>.3&&size.z>.2,`Creature ${id} must have 3D volume.`);let meshes=0;rig.root.traverse(o=>{assert.ok(!o.isSprite,'Creature geometry must not be a billboard.');if(o.isMesh){meshes++;assert.ok(o.geometry.attributes.position.count>2);assert.ok(o.material.isMeshStandardMaterial||(o.userData.outline&&o.material.side===THREE.BackSide));}});assert.ok(meshes>=8,`Creature ${id} has no full model.`);for(let frame=0;frame<30;frame++)animateCreature(rig,{time:frame/30,distance:frame/50,moving:1,attack:frame/60,hit:.2,motion:true});rig.root.updateMatrixWorld(true);const animated=new THREE.Box3().setFromObject(rig.root);assert.ok([animated.min.x,animated.min.y,animated.min.z,animated.max.x,animated.max.y,animated.max.z].every(Number.isFinite));disposeCreature(rig);}kit.dispose();});
test('ground rigs move their joints and flying rigs flap volumetric wings',()=>{const kit=createKit(),fox=createCreature(0,kit),hawk=createCreature(11,kit);animateCreature(fox,{time:0,distance:0,moving:1});const initial=fox.legs[0].hip.rotation.x;animateCreature(fox,{time:.2,distance:.15,moving:1});assert.notEqual(fox.legs[0].hip.rotation.x,initial);assert.equal(hawk.wings.length,2);animateCreature(hawk,{time:.1});const angle=hawk.wings[0].node.rotation.z;animateCreature(hawk,{time:.3});assert.notEqual(hawk.wings[0].node.rotation.z,angle);disposeCreature(fox);disposeCreature(hawk);kit.dispose();});
test('two-bone leg solver stays finite for ground contact and overstretched targets',()=>{for(const forward of [-.4,-.1,0,.1,.4])for(const down of [.01,.2,.4,2]){const p=legIK(forward,down,.2,.18);assert.ok(Number.isFinite(p.hip)&&Number.isFinite(p.knee));}});
test('camera keeps the full battlefield visible in narrow, desktop, and rotated views',()=>{for(const aspect of [.43,.65,.79,1,1.5])for(const orbit of [-.66,0,.66])for(const cinematic of [false,true]){const camera=new THREE.PerspectiveCamera();fitCamera(camera,aspect,orbit,cinematic);for(const x of [0,600])for(const y of [0,760]){const p=boardPoint(x,y).project(camera);assert.ok(Math.abs(p.x)<1&&Math.abs(p.y)<1,`Arena clipped at aspect ${aspect}.`);assert.ok(p.z>-1&&p.z<1);}}});
test('perspective ray picking maps taps back to the correct deployment location for either player',()=>{for(const side of [0,1])for(const orbit of [-.4,0,.4]){const camera=new THREE.PerspectiveCamera();fitCamera(camera,.79,orbit,true);for(const [x,y] of [[135,side===0?520:240],[465,side===0?580:180]]){const point=boardPoint(x,y,side),screen=point.clone().project(camera),picked=pickBoard(camera,(screen.x+1)/2,(1-screen.y)/2),expected=boardFromWorld(point);assert.ok(Math.abs(picked.x-expected.x)<1e-7);assert.ok(Math.abs(picked.y-expected.y)<1e-7);}}});
test('arena environment and towers build with real geometry without browser dependencies',()=>{const kit=createKit(),scene=new THREE.Scene(),environment=buildEnvironment(scene,kit),g=newGame();assert.ok(environment.water.isMesh);assert.ok(environment.group.getObjectByName('instanced-grass-patches').isInstancedMesh);for(const state of g.towers){const tower=createTower(state,kit,0);assert.ok(new THREE.Box3().setFromObject(tower.root).getSize(new THREE.Vector3()).y>1.5);tower.dispose();}environment.update(.5);assert.ok([...environment.water.geometry.attributes.position.array].every(Number.isFinite));environment.dispose();kit.dispose();});
test('combat event IDs and attacker metadata synchronize attack poses without changing damage',()=>{const g=newGame();deploy(g,0,0,300,430);deploy(g,1,0,300,330);g.units[1].y=450;for(let n=0;n<4;n++)step(g);const attack=g.effects.find(e=>e.attacker===g.units[0].id&&e.kind==='hit');assert.ok(attack);assert.equal(attack.victim,g.units[1].id);assert.equal(attack.card,0);assert.equal(attack.power,86);assert.equal(g.units[0].action,'attack');assert.equal(g.units[1].hp,g.units[1].maxHp-86);assert.equal(new Set(g.effects.map(e=>e.id)).size,g.effects.length);});
test('impact effects are deduplicated and complete once across repeated snapshots',()=>{const kit=createKit(),scene=new THREE.Scene(),hits=[],effects=createEffects(scene,kit,e=>hits.push(e.id)),event={id:77,kind:'bolt',type:'Electric',x:200,y:400,tx:200,ty:350,color:'#ffb86f',attacker:1,victim:2};assert.equal(effects.add(event,0,1),true);assert.equal(effects.add({...event},0,1.1),false);for(let n=0;n<30;n++)effects.update(.05,null,true);assert.deepEqual(hits,[77]);assert.equal(effects.count,0);effects.dispose();kit.dispose();});
test('attack poses include a wind-up, a strike and a return to rest',()=>{assert.equal(attackEnvelope(-1).strike,0);assert.ok(attackEnvelope(.08).wind>0);assert.ok(attackEnvelope(.22).strike>0);assert.equal(attackEnvelope(2).wind,0);});

test('default framing fills the available axis while retaining elevated towers and arena edges',()=>{
 const camera=new THREE.PerspectiveCamera();fitCamera(camera,.79);
 const projected=arenaFramePoints().map(p=>p.clone().project(camera)),xs=projected.map(p=>p.x),ys=projected.map(p=>p.y);
 assert.ok(Math.max(Math.max(...ys)-Math.min(...ys),Math.max(...xs)-Math.min(...xs))>1.78,'Framing should fill the limiting screen axis.');
 assert.ok(Math.max(...xs)<.96&&Math.min(...xs)>-.96);
 assert.ok(Math.max(...ys)<.92&&Math.min(...ys)>-.92);
});
test('crowded health indicators stay inside the viewport and separate nearby labels',()=>{
 for(const [width,height] of [[320,350],[390,560],[680,470]]){
  const source=Array.from({length:6},(_,i)=>({id:i,x:width/2+(i%2)*7,y:height/2+(i%3)*8,width:62,height:25,priority:i}));
  const placed=placeHealthLabels(source,width,height);assert.equal(placed.length,6);
  for(const p of placed){assert.ok(p.left>=0&&p.top>=35);assert.ok(p.left+p.width<=width&&p.top+p.height<=height);}
  for(let i=0;i<placed.length;i++)for(let j=i+1;j<placed.length;j++){const a=placed[i],b=placed[j],overlap=Math.max(0,Math.min(a.left+a.width,b.left+b.width)-Math.max(a.left,b.left))*Math.max(0,Math.min(a.top+a.height,b.top+b.height)-Math.max(a.top,b.top));assert.equal(overlap,0,'Nearby HP bars must not cover one another.');}
 }
});
test('attack archetypes use different pounce, slam, charge and casting poses',()=>{
 const kit=createKit(),poses=[];
 for(const id of [0,5,8,6]){const rig=createCreature(id,kit);animateCreature(rig,{time:.25,attack:.23});poses.push([rig.body.position.y,rig.body.position.z,rig.body.rotation.x].map(n=>n.toFixed(4)).join(','));assert.ok(rig.root.getObjectByName('silhouette'));disposeCreature(rig);}
 assert.equal(new Set(poses).size,4);kit.dispose();
});
test('reduced motion keeps cosmetic attack poses and effects still',()=>{
 const kit=createKit(),rig=createCreature(0,kit);animateCreature(rig,{time:0,attack:-1,motion:false});const start=rig.body.matrix.clone();rig.body.updateMatrix();start.copy(rig.body.matrix);animateCreature(rig,{time:12,distance:10,moving:1,attack:.23,hit:1,motion:false});rig.body.updateMatrix();assert.deepEqual(rig.body.matrix.elements,start.elements);
 const scene=new THREE.Scene(),effects=createEffects(scene,kit);effects.setMotion(false);effects.burst(new THREE.Vector3(),'#fff',20);effects.ring(new THREE.Vector3(),'#fff');effects.aura(new THREE.Vector3(),'#fff',8,1);assert.equal(effects.count,0);effects.dispose();disposeCreature(rig);kit.dispose();
});
test('market mood reads as proud when buffed, slumped when nerfed, and stays still under reduced motion',()=>{
 const kit=createKit(),pose=(id,options)=>{const rig=createCreature(id,kit);animateCreature(rig,{time:1.3,...options});const out={y:rig.body.position.y,pitch:rig.body.rotation.x,head:rig.head.rotation.x,eye:rig.eyesRig[0]?.scale.y,glow:rig.materials.find(m=>m.vertexColors&&!m.userData.baseGlow).emissiveIntensity,matrix:(rig.body.updateMatrix(),[...rig.body.matrix.elements])};disposeCreature(rig);return out;};
 const calm=pose(0,{}),buff=pose(0,{mood:1}),nerf=pose(0,{mood:-1});
 assert.ok(buff.head<calm.head&&nerf.head>calm.head,'Buffed heads lift and nerfed heads droop.');assert.ok(nerf.pitch>calm.pitch&&nerf.y<calm.y,'Nerfed bodies slump.');assert.ok(buff.eye<1&&nerf.eye<1,'Eyes show expression.');assert.ok(buff.glow>0&&nerf.glow>0&&calm.glow===0,'Mood tints the creature.');
 const jump=pose(0,{react:.5}),flinch=pose(0,{react:-.8});assert.ok(jump.y>calm.y+.2,'Market pumps trigger a cheer jump.');assert.ok(flinch.matrix[5]<calm.matrix[5],'Market dumps make the creature shrink back.');
 const still=pose(0,{motion:false}),stillMood=pose(0,{motion:false,mood:1,react:.5});assert.deepEqual(stillMood.matrix,still.matrix);assert.ok(stillMood.glow>0,'Reduced motion still communicates mood through color.');
 const scene=new THREE.Scene(),effects=createEffects(scene,kit);effects.aura(new THREE.Vector3(),'#ffe38a',4,1);effects.aura(new THREE.Vector3(),'#9cc0ff',3,-1);assert.equal(effects.count,7);for(let n=0;n<40;n++)effects.update(.05,null,true);assert.equal(effects.count,0);effects.dispose();kit.dispose();
});

test('each rebuilt creature retains its card landmark within a bounded rendering budget',()=>{
 const kit=createKit();for(let id=0;id<12;id++){const rig=createCreature(id,kit);assert.ok(rig.root.getObjectByName(CHARACTER_LANDMARKS[id]),`Missing visual identity for ${id}`);let meshes=0,triangles=0;rig.root.traverse(o=>{if(o.isMesh){meshes++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;}});assert.ok(meshes<=56,`Too many draws for creature ${id}: ${meshes}`);assert.ok(triangles<36000,`Excess geometry for creature ${id}: ${triangles}`);disposeCreature(rig);}kit.dispose();
});
test('baked sculpted geometry is shared while joints and hit materials remain independent',()=>{
 const kit=createKit(),a=createCreature(0,kit),b=createCreature(0,kit),surface=a.root.getObjectByName('sculpted-surfaces'),other=b.root.getObjectByName('sculpted-surfaces');assert.equal(surface.geometry,other.geometry);assert.notEqual(surface.material,other.material);assert.notEqual(a.head,b.head);let disposed=0;surface.geometry.addEventListener('dispose',()=>disposed++);animateCreature(a,{time:.2,attack:.2,hit:1});assert.notEqual(a.body.position.z,b.body.position.z);assert.notEqual(surface.material.emissiveIntensity,other.material.emissiveIntensity);disposeCreature(a);disposeCreature(b);assert.equal(disposed,0);kit.dispose();assert.equal(disposed,1);
});
test('attack variants change the active side and reset fully after recovery',()=>{
 for(const id of [0,1,2,3,4,5,6,7,8,9,10,11]){const a=combatPose(id,.20,0),b=combatPose(id,.20,1);assert.ok(Object.values(a).filter(v=>typeof v==='number').every(Number.isFinite));assert.ok(a.strike>.8);const rest=combatPose(id,1,1);assert.equal(rest.phase,'idle');assert.equal(rest.strike,0);if([0,1,3,4,5,6,8,10,11].includes(id))assert.notEqual(a.twist+a.roll+a.x,b.twist+b.roll+b.x);}
 const kit=createKit(),dragon=createCreature(7,kit);animateCreature(dragon,{time:.15,attack:.15});assert.ok(dragon.jaw.rotation.x>.4);disposeCreature(dragon);kit.dispose();
});
test('melee and spell impacts fire once at their shared animation contact times',()=>{
 for(const kind of ['hit','bolt']){const kit=createKit(),scene=new THREE.Scene(),hits=[],effects=createEffects(scene,kit,e=>hits.push(e.id)),event={id:11,kind,card:kind==='hit'?5:3,type:kind==='hit'?'Earth':'Ice',x:300,y:430,tx:300,ty:350};effects.add(event,0,0);const timing=combatTiming(event);for(let t=0;t<timing.impact-.015;t+=.01)effects.update(.01,null,true);assert.equal(hits.length,0);effects.update(.02,null,true);assert.equal(hits.length,1);for(let n=0;n<90;n++)effects.update(.02,null,true);assert.equal(hits.length,1);assert.equal(effects.count,0);effects.dispose();kit.dispose();}
});
test('larger wings and attack silhouettes remain visible at the deployment edges',()=>{
 const kit=createKit();for(const id of [0,5,7,11]){const rig=createCreature(id,kit);for(const aspect of [.65,1,1.4])for(const [x,z,heading]of [[-5.24,5.08,0],[5.24,5.08,Math.PI],[0,-5.08,Math.PI]]){const camera=new THREE.PerspectiveCamera();fitCamera(camera,aspect);rig.root.position.set(x,rig.float+.055,z);rig.root.rotation.y=heading;rig.root.scale.setScalar(rig.modelScale*1.28);animateCreature(rig,{time:.2,attack:.2,combo:1});rig.root.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(rig.root);for(const cx of [box.min.x,box.max.x])for(const cy of [box.min.y,box.max.y])for(const cz of [box.min.z,box.max.z]){const p=new THREE.Vector3(cx,cy,cz).project(camera);assert.ok(Math.abs(p.x)<1&&Math.abs(p.y)<1,`Creature ${id} clips at ${aspect}`);}}disposeCreature(rig);}kit.dispose();
});
