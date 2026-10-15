import {unpackPacket} from '../public/game/wire.js';
// Local workerd run by default. Real-network fixtures must be staging tickets.
import {createRequire} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import {newGame,deploy} from '../public/game/engine.js';
import {marketBaseline} from '../public/game/tokens.js';
import {signToken,verifyService} from '../lib/security.js';
const require=createRequire(import.meta.url),wr=createRequire(require.resolve('wrangler/package.json')),{Miniflare}=wr('miniflare'),{build}=wr('esbuild');
const args=process.argv.slice(2),value=(name,fallback)=>args.includes(name)?args[args.indexOf(name)+1]:fallback;
const players=Number(value('--players','500')),seconds=Number(value('--seconds','10')),output=value('--out',null),fixturePath=value('--fixtures',null);
if(!Number.isInteger(players)||players<2||players>1000||players%2||!Number.isFinite(seconds)||seconds<3||seconds>7200)throw new Error('Use an even player count 2–1000 and duration 3–7200 seconds.');
if(fixturePath&&process.env.STAGING_LOAD_TEST!=='1')throw new Error('Set STAGING_LOAD_TEST=1 only for an authorized staging service.');
const origin='https://load.arena.test',secret=crypto.randomUUID()+crypto.randomUUID(),sockets=[],acks=new Map(),ackMs=[],gaps=[],seenCommands=new Set();let mf,start=0,bytes=0,snapshots=0,errors=0,privacyErrors=0,duplicates=0;const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const percentile=(data,p)=>{const a=[...data].sort((x,y)=>x-y);return a.length?Math.round(a[Math.floor((a.length-1)*p)]*100)/100:null;};
async function observe(ws,index,side){ws.side=side;ws.frames=0;ws.lastAt=null;ws.state=null;ws.onMessage=data=>{try{const text=typeof data==='string'?data:String(data),message=unpackPacket(JSON.parse(text));bytes+=text.length;if(message.state){const at=performance.now();if(start&&ws.lastAt!==null)gaps.push(at-ws.lastAt);ws.lastAt=at;ws.state=message.state;ws.frames++;snapshots++;if(message.state.hand[1-side].length||message.state.queue[1-side].length||message.state.seed!==undefined||message.state.commands!==undefined)privacyErrors++;}if(message.type==='ack'){if(seenCommands.has(message.actionId))duplicates++;else{seenCommands.add(message.actionId);const sent=acks.get(message.actionId);if(sent!==undefined)ackMs.push(performance.now()-sent);}}if(message.type==='error'&&!message.retry)errors++;}catch{errors++;}};}
try{
 let fixtures;
 if(fixturePath)fixtures=JSON.parse(await readFile(fixturePath,'utf8'));
 else{
  const bundle=await build({entryPoints:['services/realtime/worker.js'],bundle:true,format:'esm',platform:'neutral',target:'es2022',write:false});
  mf=new Miniflare({modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-05-15',durableObjects:{MATCHES:{className:'MatchRoom',useSQLite:true}},bindings:{SITE_ORIGIN:origin,REALTIME_SHARED_SECRET:secret},serviceBindings:{SITES:async request=>{const raw=await request.text();if(!await verifyService(request,raw,secret))return new Response('Unauthorized',{status:401});const data=JSON.parse(raw),kind=new URL(request.url).pathname.split('/').at(-1);if(kind==='bootstrap'){const g=newGame();for(let i=0;i<6;i++){g.elixir[0]=10;g.elixir[1]=10;deploy(g,0,i%4,i%2?465:135,450+i*20);deploy(g,1,i%4,i%2?465:135,300-i*20);}g.elixir=[5,5];g.time=18;g.market=marketBaseline(null,Date.now()-18000);return Response.json({row:{id:data.id,stake:50,asset:'credits',transport:'realtime',state:JSON.stringify(g),last_tick:Date.now(),version:1},participants:[data.id+':0',data.id+':1']});}if(kind==='settle')return Response.json({recorded:true,settled:true});return Response.json({prices:[]});}}});
  fixtures=await Promise.all(Array.from({length:players},async(_,i)=>{const id='load-'+Math.floor(i/2),side=i%2,ticket=await signToken({aud:'arena-room',match:id,side,player:id+':'+side,origin,exp:Date.now()+180000,jti:crypto.randomUUID()},secret);return {url:'https://realtime.test/matches/'+id+'/socket?ticket='+ticket,origin,side};}));
 }
 if(fixtures.length<players)throw new Error('Not enough staging fixtures.');
 const setupStart=performance.now();
 for(let first=0;first<players;first+=25){await Promise.all(fixtures.slice(first,first+25).map(async(f,j)=>{const index=first+j;let ws;if(mf){const response=await mf.dispatchFetch(f.url,{headers:{Upgrade:'websocket',Origin:f.origin||origin}});if(response.status!==101)throw new Error('Socket rejected: '+response.status);ws=response.webSocket;await observe(ws,index,f.side??index%2);ws.addEventListener('message',e=>ws.onMessage(e.data));ws.accept();}else{const {default:WebSocket}=await import('ws');ws=new WebSocket(f.url,{origin:f.origin});await observe(ws,index,f.side??index%2);ws.on('message',ws.onMessage);await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);});}sockets.push(ws);}));}
 for(let i=0;i<100&&sockets.some(ws=>!ws.state);i++)await sleep(50);if(sockets.some(ws=>!ws.state))throw new Error('Initial snapshots missing.');
 const setupMs=performance.now()-setupStart;start=performance.now();for(const ws of sockets)ws.lastAt=null;
 for(let round=0;round<2;round++){
  for(let i=0;i<sockets.length;i++){const ws=sockets[i],actionId=`load-command-${i}-${round}`,command={type:'deploy',slot:0,card:ws.state.hand[ws.side][0],x:i%2?465:135,y:ws.side===0?520:240,actionId};acks.set(actionId,performance.now());ws.send(JSON.stringify(command));if(i%10===0)ws.send(JSON.stringify(command));}
  await sleep(seconds*500);
 }
 const missing=[...acks.keys()].filter(id=>!seenCommands.has(id)),result={environment:mf?'local-workerd-with-mocked-account-oracle-service':'staging-fixture-network',players:sockets.length,matches:players/2,durationSeconds:seconds,setupMs:Math.round(setupMs),snapshots,bytes,uniqueCommands:acks.size,acknowledged:seenCommands.size,missingAcknowledgements:missing.length,duplicateAcknowledgements:duplicates,protocolErrors:errors,privacyErrors,ackMs:{p50:percentile(ackMs,.5),p95:percentile(ackMs,.95),p99:percentile(ackMs,.99)},snapshotGapMs:{p95:percentile(gaps,.95),p99:percentile(gaps,.99)},minSnapshotsPerConnection:Math.min(...sockets.map(ws=>ws.frames)),notes:mf?'A local concurrency test, not a production capacity or browser/GPU certification. Account service, oracle and settlement are mocks.':'Use with regional latency, actual D1/oracle/contract dependencies, 30-minute ramp and soak before launch.'};
 console.log(JSON.stringify(result,null,2));if(output)await writeFile(output,JSON.stringify(result,null,2)+'\n');if(missing.length||errors||privacyErrors||result.minSnapshotsPerConnection<2)process.exitCode=1;
}finally{for(const ws of sockets)try{ws.close();}catch{}await mf?.dispose();}
