import {createServer} from 'node:http';
import {PublicKey,Transaction} from '@solana/web3.js';
import {verifyService} from '../../../../lib/security.js';
import {assertUserIntent,decodeMatch,matchHash,payouts} from './logic.mjs';
import {assembleUserTransaction,cancelInstruction,mintKey,pdas,programId,settleInstruction,userInstruction} from './program.mjs';
import {accountInfo,connection,latestBlockhash,sendAndConfirm,settlementKeypair} from './rpc.mjs';
import {readPositions,verifyIntent} from './verify.mjs';

export function createAdapter(env=process.env){
 return createServer(async(req,res)=>{
  try{
   const raw=await readBody(req,8192);
   const headers=new Headers();
   for(const [name,value] of Object.entries(req.headers)){
    if(value==null)continue;
    headers.set(name,Array.isArray(value)?value.join(', '):value);
   }
   const request=new Request('http://127.0.0.1'+(req.url||'/'),{method:req.method,headers,body:req.method==='GET'||req.method==='HEAD'?undefined:raw});
   const response=await handleAdapterRequest(request,env);
   res.writeHead(response.status,{'Content-Type':'application/json','Cache-Control':'no-store'});
   res.end(await response.text());
  }catch(error){
   const status=error.status||400;
   console.warn('Adapter error',error.message);
   send(res,status,{error:error.message||'Adapter error.'});
  }
 });
}

export async function handleAdapterRequest(request,env=process.env){
 try{
  const path=new URL(request.url).pathname;
  if(request.method==='GET'&&path==='/health')return json(200,{ok:true,protocol:1,programId:programId(env).toBase58()});
  if(request.method!=='POST')return json(405,{error:'POST required.'});
  const raw=await request.text();
  if(raw.length>8192)return json(413,{error:'Request too large.'});
  if(!await verifyService(request,raw,env.CONTRACT_ADAPTER_KEY))return json(401,{error:'Service authentication required.'});
  const body=JSON.parse(raw);
  if(path==='/v1/prepare')return json(200,await prepare(env,body));
  if(path==='/v1/verify')return json(200,await verifyIntent(connection(env),env,body));
  if(path==='/v1/positions')return json(200,await readPositions(connection(env),env,body));
  if(path==='/v1/settle')return json(200,await settle(env,body));
  return json(404,{error:'Unknown adapter route.'});
 }catch(error){
  const status=error.status||(error.message?.includes('not configured')?503:400);
  console.warn('Adapter error',error.message);
  return json(status,{error:error.message||'Adapter error.'});
 }
}

async function prepare(env,intent){
 assertConfig(env,intent);
 assertUserIntent(intent);
 const {ix,position}=userInstruction(intent.kind,env,intent);
 if(intent.position&&position.toBase58()!==intent.position)throw new Error('Position PDA does not match this intent.');
 const conn=connection(env);
 if(intent.kind==='refund')await cancelIfFullyLocked(conn,env,intent);
 const blockhash=await latestBlockhash(conn);
 return {intentId:intent.id,transaction:assembleUserTransaction(ix,new PublicKey(intent.wallet),blockhash,env),expiresAt:Math.min(Number(intent.expiresAt)||Date.now()+55000,Date.now()+55000)};
}

async function cancelIfFullyLocked(conn,env,intent){
 const program=programId(env),[matchPda]=pdas.match(program,matchHash(intent.matchId));
 const existing=await accountInfo(conn,matchPda);
 if(!existing)return;
 const parsed=decodeMatch(existing.data);
 if(parsed.settled)throw new Error('This match is already settled.');
 if(parsed.cancelled||parsed.sides!==0b11)return;
 const authority=settlementKeypair(env);
 const tx=new Transaction();
 tx.feePayer=authority.publicKey;
 tx.add(cancelInstruction(env,intent.matchId,authority));
 try{
  await sendAndConfirm(conn,tx,[authority]);
 }catch(error){
  const again=await accountInfo(conn,matchPda);
  if(!again||decodeMatch(again.data).cancelled!==true)throw error;
 }
}

async function settle(env,payload){
 assertConfig(env,payload);
 if(payload.settlementId!=='match:'+payload.matchId)throw new Error('Settlement ID must be match:<id>.');
 payload.winner=Number(payload.winner);
 payload.participants=(payload.participants||[]).map(p=>({...p,side:Number(p.side)}));
 const paid=payouts(payload.winner,payload.amountUnits,payload.participants);
 const program=programId(env),mint=mintKey(env);
 const authority=settlementKeypair(env);
 const conn=connection(env);
 const [matchPda]=pdas.match(program,matchHash(payload.matchId));
 const existing=await accountInfo(conn,matchPda);
 if(existing){
  const parsed=decodeMatch(existing.data);
  if(parsed.cancelled)throw new Error('This match was cancelled.');
  if(parsed.settled){
   const sigs=await conn.getSignaturesForAddress(matchPda,{limit:8});
   const signature=sigs.find(s=>s.err==null)?.signature||sigs[0]?.signature||'replay';
   return {
    finalized:true,success:true,matchId:payload.matchId,winner:payload.winner,programId:program.toBase58(),
    mint:mint.toBase58(),decimals:Number(env.GAME_TOKEN_DECIMALS??9),amountUnits:payload.amountUnits,
    signature,payouts:paid
   };
  }
 }
 const tx=new Transaction();tx.feePayer=authority.publicKey;tx.add(settleInstruction(env,payload,authority));
 const signature=await sendAndConfirm(conn,tx,[authority]);
 const confirmed=await verifySettled(conn,program,matchPda);
 if(!confirmed)return {finalized:false,success:false,matchId:payload.matchId,signature};
 return {
  finalized:true,success:true,matchId:payload.matchId,winner:payload.winner,programId:program.toBase58(),
  mint:mint.toBase58(),decimals:Number(env.GAME_TOKEN_DECIMALS??9),amountUnits:payload.amountUnits,signature,payouts:paid
 };
}

async function verifySettled(conn,program,matchPda){
 const info=await accountInfo(conn,matchPda);if(!info||!info.owner.equals(program))return false;
 return decodeMatch(info.data).settled===true;
}

function assertConfig(env,body){
 if((env.GAME_PROGRAM_ID||'')&&body.programId&&body.programId!==env.GAME_PROGRAM_ID)throw new Error('Program ID does not match.');
 if(body.mint&&body.mint!==env.GAME_TOKEN_MINT)throw new Error('Mint does not match.');
 if(body.decimals!=null&&Number(body.decimals)!==Number(env.GAME_TOKEN_DECIMALS??9))throw new Error('Decimals do not match.');
}

function json(status,data){
 return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
}

function send(res,status,data){
 res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});
 res.end(JSON.stringify(data));
}

function readBody(req,max){
 return new Promise((resolve,reject)=>{
  if(req.method==='GET'||req.method==='HEAD'){resolve('');return;}
  const chunks=[];let size=0;
  req.on('data',c=>{size+=c.length;if(size>max){reject(Object.assign(new Error('Request too large.'),{status:413}));req.destroy();return;}chunks.push(c);});
  req.on('end',()=>resolve(Buffer.concat(chunks)));
  req.on('error',reject);
 });
}
