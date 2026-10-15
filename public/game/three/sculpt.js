import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

export function paintGeometry(geometry){
 geometry.computeBoundingBox();const p=geometry.attributes.position,b=geometry.boundingBox,height=Math.max(.001,b.max.y-b.min.y),colors=[];
 for(let i=0;i<p.count;i++){const y=(p.getY(i)-b.min.y)/height,shade=.80+y*.20+Math.sin(p.getX(i)*13+p.getZ(i)*9)*.018;colors.push(shade,shade,shade);}
 geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));return geometry;
}
export function solidShape(points,depth=.06){
 const shape=new THREE.Shape();points.forEach(([x,y],i)=>i?shape.lineTo(x,y):shape.moveTo(x,y));shape.closePath();
 return paintGeometry(new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:true,bevelSegments:1,steps:1,bevelSize:depth*.3,bevelThickness:depth*.3,curveSegments:5}));
}
export function taperedCurve(points,radius=.1,tip=.015,segments=14,sides=7){
 const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),frames=curve.computeFrenetFrames(segments,false),positions=[],normals=[],uvs=[],indices=[];
 for(let i=0;i<=segments;i++){const t=i/segments,c=curve.getPointAt(t),r=radius*(1-t)+tip*t;for(let j=0;j<=sides;j++){const angle=j/sides*Math.PI*2,n=frames.normals[i].clone().multiplyScalar(Math.cos(angle)).addScaledVector(frames.binormals[i],Math.sin(angle)),v=c.clone().addScaledVector(n,r);positions.push(v.x,v.y,v.z);normals.push(n.x,n.y,n.z);uvs.push(j/sides,t);if(i<segments&&j<sides){const a=i*(sides+1)+j,b=a+sides+1;indices.push(a,b,a+1,b,b+1,a+1);}}}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));g.setIndex(indices);return paintGeometry(g);
}
// Bake static surfaces together per animated joint/material, preserving articulation.
export function batchJointSurfaces(root,owned){
 const joints=[];root.traverse(o=>{if(o.isGroup)joints.push(o);});
 for(const joint of joints){const groups=new Map();for(const mesh of joint.children)if(mesh.isMesh){const group=groups.get(mesh.material)||[];group.push(mesh);groups.set(mesh.material,group);}
  for(const [material,meshes]of groups){if(meshes.length<2)continue;const copies=meshes.map(m=>{m.updateMatrix();return (m.geometry.index?m.geometry.toNonIndexed():m.geometry.clone()).applyMatrix4(m.matrix);}),geometry=mergeGeometries(copies,false);copies.forEach(g=>g.dispose());if(!geometry)continue;geometry.userData.owned=true;owned.add(geometry);const merged=new THREE.Mesh(geometry,material);merged.castShadow=meshes.some(m=>m.castShadow);merged.receiveShadow=true;merged.name='sculpted-surfaces';for(const m of meshes)joint.remove(m);joint.add(merged);}
 }
 // Drop construction-only geometry once it has been baked into the rig.
 const used=new Set();root.traverse(o=>{if(o.geometry)used.add(o.geometry);});for(const g of [...owned])if(!used.has(g)){g.dispose();owned.delete(g);}
}
