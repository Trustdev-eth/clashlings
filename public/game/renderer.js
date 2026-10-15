import {create3DRenderer} from './three/renderer.js';
import {renderer as create2DRenderer} from './renderer-2d.js';
export function renderer(canvas){
 let current;
 try{current=create3DRenderer(canvas);canvas.parentElement.dataset.renderMode='3d';}
 catch(error){
  console.warn('3D unavailable; using the compatibility arena.',error.message);
  const replacement=canvas.cloneNode(false);canvas.replaceWith(replacement);canvas=replacement;const fallback=create2DRenderer(canvas);current={...fallback,mode:'2d',pick(clientX,clientY){const r=canvas.getBoundingClientRect();return {x:(clientX-r.left)/r.width*600,y:(clientY-r.top)/r.height*760};},setCamera(){},dispose(){}};canvas.parentElement.dataset.renderMode='2d';
 }
 const label=canvas.parentElement.querySelector('#scene-mode');if(label)label.textContent=current.mode==='3d'?'LIVE 3D':'COMPATIBILITY VIEW';
 return current;
}
