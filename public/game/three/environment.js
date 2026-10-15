import * as THREE from 'three';
import {boardPoint} from './math.js';
export function buildEnvironment(scene,kit){
 const materials=[],dynamic=[],mat=(color,extra={})=>{const m=new THREE.MeshStandardMaterial({color,roughness:.88,...extra});materials.push(m);return m;};
 const grass=mat('#4fae55'),edge=mat('#2f7d43'),stone=mat('#5b4f92'),path=mat('#e9c27a'),wood=mat('#8e5a32'),rail=mat('#f0b25c'),leaves=[mat('#2a8a4c'),mat('#3aa356'),mat('#58bf5f')],trunk=mat('#7a4c2c');
 const trim=mat('#ffcf5a',{roughness:.35,metalness:.35,emissive:'#ff9d00',emissiveIntensity:.45});
 const part=(parent,type,m,pos,size,rot=[0,0,0],shadow=true)=>kit.part(parent,type,m,pos,size,rot,shadow);
 const group=new THREE.Group();group.name='3d-arena-environment';scene.add(group);
 part(group,'box',stone,[0,-.72,0],[12.6,1,15.7]);part(group,'box',edge,[0,-.27,-4.18],[12.5,.48,7.14]);part(group,'box',edge,[0,-.27,4.18],[12.5,.48,7.14]);
 part(group,'box',grass,[0,-.015,-4.16],[12.25,.11,7.00]);part(group,'box',grass,[0,-.015,4.16],[12.25,.11,7.00]);
 for(const z of [-7.88,7.88])part(group,'box',trim,[0,-.2,z],[12.8,.12,.12],[0,0,0],false);for(const x of [-6.33,6.33])part(group,'box',trim,[x,-.2,0],[.12,.12,15.88],[0,0,0],false);
 // Quiet grass variation, batched into one draw call.
 const patchGeo=new THREE.PlaneGeometry(.34,.34),patchMat=mat('#63c467'),patches=new THREE.InstancedMesh(patchGeo,patchMat,340);patches.name='instanced-grass-patches';const matrix=new THREE.Matrix4();let count=0;for(let n=0;n<340;n++){const x=Math.sin(n*31.75)*5.9,z=Math.sin(n*13.97)*7.3;if(Math.abs(z)<.77)continue;matrix.makeRotationX(-Math.PI/2);matrix.setPosition(x,.045,z);patches.setMatrixAt(count++,matrix);}patches.count=count;patches.receiveShadow=true;group.add(patches);
 for(const x of [-3.3,3.3]){
  for(let n=0;n<26;n++){const z=-6.5+n*.50;if(Math.abs(z)<.82)continue;part(group,'box',path,[x,.055,z],[.76,.06,.40],[0,Math.sin(n)*.035,0]);}
  const bridge=new THREE.Group();bridge.position.set(x,0,0);group.add(bridge);part(bridge,'box',wood,[0,.075,0],[1.44,.14,1.85]);for(let n=0;n<10;n++)part(bridge,'box',rail,[0,.17,-.84+n*.187],[1.42,.07,.16]);for(const sign of [-1,1]){for(const z of [-.85,0,.85])part(bridge,'box',wood,[sign*.79,.30,z],[.085,.62,.085]);part(bridge,'box',rail,[sign*.79,.56,0],[.095,.095,1.95]);}
 }
 const waterGeo=new THREE.PlaneGeometry(12.5,1.35,48,8);waterGeo.rotateX(-Math.PI/2);const waterMat=mat('#1fb4e6',{roughness:.18,metalness:.3,emissive:'#0a74b0',emissiveIntensity:.32,transparent:true,opacity:.95});const water=new THREE.Mesh(waterGeo,waterMat);water.position.y=-.10;water.receiveShadow=true;group.add(water);const waterBase=new Float32Array(waterGeo.attributes.position.array);
 const foamMat=mat('#e8fbff',{transparent:true,opacity:.55,emissive:'#9ee8ff',emissiveIntensity:.2});for(let n=0;n<18;n++){const p=part(group,'ball',foamMat,[-5.9+n*.69,-.07,Math.sin(n*4)*.44],[.13+((n*7)%4)*.04,.009,.022],[0,0,0],false);dynamic.push({mesh:p,kind:'water',phase:n});}
 // Compact stylized trees with varied crowns and visible trunks.
 for(let n=0;n<24;n++){const sign=n%2?1:-1,x=sign*(5.75+(n%3)*.07),z=-7.2+(n/2|0)*1.28;if(Math.abs(z)<.95)continue;const height=.65+(n%4)*.13;part(group,'cylinder',trunk,[x,height*.33,z],[.085,height*.8,.085]);part(group,'rock',leaves[n%3],[x,height*.95,z],[.37,height*.54,.36]);part(group,'rock',leaves[(n+1)%3],[x-.13,height*1.27,z-.03],[.30,height*.43,.28]);}
 const rockMat=mat('#c9c2d8');for(let n=0;n<18;n++){const sign=n%2?1:-1,x=sign*(5.65+(n%3)*.10),z=-7.2+n*.84;part(group,'rock',rockMat,[x,.09,z],[.13+(n%3)*.04,.19,.19],[n*.2,n,0]);}
 // Small flowers give the meadow scale without an external texture dependency.
 const blossom=mat('#ffe066',{emissive:'#ffb300',emissiveIntensity:.15}),petal=mat('#ff8fc8',{emissive:'#ff4fa3',emissiveIntensity:.15});for(let n=0;n<40;n++){const x=(n%2?1:-1)*(4.9+(n%4)*.22),z=Math.sin(n*7.4)*7.1;if(Math.abs(z)<.95)continue;part(group,'ball',n%3?blossom:petal,[x,.10,z],[.055,.07,.055],[0,0,0],false);}
 const floor=part(group,'box',mat('#1a1242'),[0,-1.34,0],[200,.12,200],[0,0,0],false);floor.receiveShadow=true;
 return {group,water,update(time,motion=true){const attr=waterGeo.attributes.position;for(let i=0;i<attr.count;i++){const x=waterBase[i*3],z=waterBase[i*3+2];attr.setY(i,Math.sin(x*2.5+time*1.8)*.016*(motion?1:0)+Math.sin(z*8-time*2)*.008*(motion?1:0));}attr.needsUpdate=true;for(const d of dynamic){d.mesh.position.x=Math.sin(time*.12+d.phase)*5.9;d.mesh.scale.x=.13+Math.sin(time+d.phase)*.035;}},dispose(){materials.forEach(m=>m.dispose());waterGeo.dispose();patchGeo.dispose();}};
}
export function createTower(t,kit,side){
 const root=new THREE.Group(),body=new THREE.Group(),materials=[],flags=[],color=t.p===side?'#1a7dff':'#ff2f4a';root.add(body);
 const mat=(c,metal=false)=>{const m=new THREE.MeshStandardMaterial({color:c,roughness:metal?.35:.9,metalness:metal?.45:0});materials.push(m);return m;},cream=mat('#efe6d6'),dark=mat('#8e88aa'),roof=mat(color),window=mat('#243c48'),gold=mat('#e5c66f',true);
 const p=(type,m,pos,size,rot=[0,0,0])=>kit.part(body,type,m,pos,size,rot);
 p('cylinder',dark,[0,.12,0],[.65,.22,.65]);p('box',cream,[0,.63,0],[.92,1.0,.91]);for(const z of [-.46,.46]){p('box',dark,[0,.37,z],[.93,.055,.025]);p('box',dark,[0,.67,z],[.93,.035,.025]);}p('box',window,[0,.55,.47],[.25,.45,.04]);p('cone',roof,[0,1.36,0],[.83,.62,.83],[0,Math.PI/4,0]);for(const x of [-.43,.43])for(const z of [-.43,.43]){p('cylinder',cream,[x,1.02,z],[.16,.54,.16]);p('cone',roof,[x,1.40,z],[.22,.30,.22]);}
 p('cylinder',dark,[.28,1.72,.13],[.018,.72,.018]);const flag=p('box',roof,[.48,1.92,.13],[.37,.22,.02]);flags.push(flag);
 if(t.king){p('cylinder',gold,[0,1.64,0],[.24,.11,.24]);for(let n=0;n<5;n++){const a=n/5*Math.PI*2;p('cone',gold,[Math.cos(a)*.18,1.78,Math.sin(a)*.18],[.06,.24,.06]);}root.scale.setScalar(1.12);}
 root.position.copy(boardPoint(t.x,t.y,side));root.name='tower-'+t.id;
 return {root,body,flags,materials,hp:t.hp,hit:0,deadAt:null,dispose(){materials.forEach(m=>m.dispose());}};
}
