import {Connection,Keypair,PublicKey,Transaction} from '@solana/web3.js';
import {readFileSync} from 'node:fs';
import {dirname,isAbsolute,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const adapterRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export function resolveKeypairPath(path){
 if(!path)return path;
 return isAbsolute(path)?path:resolve(adapterRoot,path);
}

const LOCAL_RPC=/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/i;
const connections=new Map();

export function connection(env=process.env){
 const url=env.SOLANA_RPC_URL;
 if(!url)throw new Error('SOLANA_RPC_URL is required.');
 if(!/^https:\/\//.test(url)&&!LOCAL_RPC.test(url))throw new Error('SOLANA_RPC_URL must be https (http is allowed only on localhost).');
 let conn=connections.get(url);
 if(!conn){
  conn=new Connection(url,{commitment:'confirmed',disableRetryOnRateLimit:true});
  connections.set(url,conn);
 }
 return conn;
}

function rateLimited(error){
 return /429|Too Many Requests|503|502|rate limit/i.test(String(error?.message||error||''));
}
async function rpcRetry(fn,tries=4){
 let last;
 for(let i=0;i<tries;i++){
  try{return await fn();}
  catch(error){
   last=error;
   if(!rateLimited(error)||i===tries-1)throw error;
   await new Promise(resolve=>setTimeout(resolve,1000*(2**i)));
  }
 }
 throw last;
}

export function settlementKeypair(env=process.env){
 if(env.SETTLEMENT_KEYPAIR_JSON)return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(env.SETTLEMENT_KEYPAIR_JSON)));
 if(env.SETTLEMENT_KEYPAIR_PATH)return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(resolveKeypairPath(env.SETTLEMENT_KEYPAIR_PATH),'utf8'))));
 throw new Error('Settlement keypair is not configured.');
}

export async function latestBlockhash(conn){
 return rpcRetry(async()=>{const {blockhash}=await conn.getLatestBlockhash('confirmed');return blockhash;});
}

export async function accountInfo(conn,address){
 return rpcRetry(()=>conn.getAccountInfo(new PublicKey(address),'confirmed'));
}

export async function accountsInfo(conn,addresses){
 if(!addresses.length)return [];
 const keys=addresses.map(address=>new PublicKey(address)),out=[];
 for(let i=0;i<keys.length;i+=100){
  const chunk=keys.slice(i,i+100);
  out.push(...await rpcRetry(()=>conn.getMultipleAccountsInfo(chunk,'confirmed')));
 }
 return out;
}

export async function finalizedTransaction(conn,signature){
 const tx=await rpcRetry(()=>conn.getTransaction(signature,{commitment:'finalized',maxSupportedTransactionVersion:0}));
 if(!tx)return {finalized:false};
 const meta=tx.meta;if(meta?.err)return {finalized:true,success:false,err:meta.err};
 return {finalized:true,success:true,tx,blockTime:tx.blockTime?tx.blockTime*1000:null};
}

export async function sendAndConfirm(conn,transaction,signers){
 const {blockhash,lastValidBlockHeight}=await rpcRetry(()=>conn.getLatestBlockhash('confirmed'));
 transaction.recentBlockhash=blockhash;
 if(!(transaction instanceof Transaction))throw new Error('Expected a legacy transaction.');
 const signature=await rpcRetry(()=>conn.sendTransaction(transaction,signers,{skipPreflight:false,preflightCommitment:'confirmed'}));
 const confirmation=await conn.confirmTransaction({signature,blockhash,lastValidBlockHeight},'finalized');
 if(confirmation.value.err)throw new Error('On-chain transaction failed.');
 return signature;
}
