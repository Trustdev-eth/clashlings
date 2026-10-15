import * as THREE from 'three';
export const SCALE=50,WIDTH=600,HEIGHT=760;
export const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export function boardPoint(x,y,side=0,height=0){return new THREE.Vector3((x-WIDTH/2)/SCALE,height,((side===1?HEIGHT-y:y)-HEIGHT/2)/SCALE);}
export function boardFromWorld(point){return {x:point.x*SCALE+WIDTH/2,y:point.z*SCALE+HEIGHT/2};}
export function surfaceHeight(x,y){return Math.abs(y-380)<46&&(Math.abs(x-135)<39||Math.abs(x-465)<39)?.12:0;}
// Frame the ground and actual tower/tree heights rather than an empty bounding box.
export function arenaFramePoints(){
 const points=[];
 for(const x of [-6.3,6.3])for(const z of [-7.9,7.9])points.push(new THREE.Vector3(x,-.65,z));
 for(const x of [-6,6])for(const z of [-7.2,7.2])points.push(new THREE.Vector3(x,1.6,z));
 for(const x of [-3.3,3.3])for(const z of [-4.18,4.18])points.push(new THREE.Vector3(x,2.25,z));
 for(const z of [-6.12,6.12])points.push(new THREE.Vector3(0,2.75,z));
 for(const x of [-6.95,6.95])for(const z of [-5.5,5.5])points.push(new THREE.Vector3(x,2.5,z));
 return points;
}
export function fitCamera(camera,aspect,orbit=0,cinematic=false,zoom=1){
 camera.aspect=aspect;camera.fov=cinematic?39:36;camera.near=.1;camera.far=160;camera.clearViewOffset();camera.updateProjectionMatrix();
 const pitch=(cinematic?50:60)*Math.PI/180,target=new THREE.Vector3(0,.1,0),direction=new THREE.Vector3(Math.sin(orbit)*Math.cos(pitch),Math.sin(pitch),Math.cos(orbit)*Math.cos(pitch)),points=arenaFramePoints();
 const measure=distance=>{camera.position.copy(target).addScaledVector(direction,distance);camera.lookAt(target);camera.updateMatrixWorld(true);const screen=points.map(p=>p.clone().project(camera));return {minX:Math.min(...screen.map(p=>p.x)),maxX:Math.max(...screen.map(p=>p.x)),minY:Math.min(...screen.map(p=>p.y)),maxY:Math.max(...screen.map(p=>p.y))};};
 let lo=9,hi=100;for(let n=0;n<28;n++){const mid=(lo+hi)/2,b=measure(mid);if(b.maxX-b.minX<1.88&&b.maxY-b.minY<1.80)hi=mid;else lo=mid;}
 const b=measure(hi/zoom);camera.projectionMatrix.elements[8]+=(b.minX+b.maxX)/2;camera.projectionMatrix.elements[9]+=(b.minY+b.maxY)/2;camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();return camera;
}
export function pickBoard(camera,u,v){const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2(u*2-1,1-v*2),camera);const hit=ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),0),new THREE.Vector3());return hit?boardFromWorld(hit):{x:-999,y:-999};}
export function turnAngle(a,b,amount){return a+Math.atan2(Math.sin(b-a),Math.cos(b-a))*clamp(amount,0,1);}
export function legIK(forward,down,upper,lower){const distance=clamp(Math.hypot(forward,down),Math.abs(upper-lower)+.001,upper+lower-.001),hip=-Math.atan2(forward,down)+Math.acos(clamp((upper*upper+distance*distance-lower*lower)/(2*upper*distance),-1,1)),knee=-(Math.PI-Math.acos(clamp((upper*upper+lower*lower-distance*distance)/(2*upper*lower),-1,1)));return {hip,knee};}
export function attackEnvelope(elapsed,duration=.55){if(elapsed<0||elapsed>duration)return {wind:0,strike:0,recover:0};const t=elapsed/duration;return {wind:t<.28?Math.sin(t/.28*Math.PI):0,strike:t>=.24&&t<.6?Math.sin((t-.24)/.36*Math.PI):0,recover:t>.6?(1-t)/.4:0};}
