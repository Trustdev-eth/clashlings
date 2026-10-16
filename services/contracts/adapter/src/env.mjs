import {existsSync,readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const preset=new Set(Object.keys(process.env).filter(k=>process.env[k]!==undefined&&process.env[k]!==''));

function loadEnvFile(path){
 if(!existsSync(path))return;
 for(const line of readFileSync(path,'utf8').split(/\r?\n/)){
  const text=line.trim();if(!text||text.startsWith('#'))continue;
  const i=text.indexOf('=');if(i<1)continue;
  const key=text.slice(0,i).trim();
  let value=text.slice(i+1).trim();
  if((value.startsWith('"')&&value.endsWith('"'))||(value.startsWith("'")&&value.endsWith("'")))value=value.slice(1,-1);
  if(preset.has(key))continue;
  process.env[key]=value;
 }
}

export function loadAdapterEnv(){
 const adapterDir=resolve(dirname(fileURLToPath(import.meta.url)),'..');
 const root=resolve(adapterDir,'../../..');
 loadEnvFile(resolve(adapterDir,'.env'));
 loadEnvFile(resolve(root,'.env'));
 loadEnvFile(resolve(root,'.env.local'));
}
