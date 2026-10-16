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

export function connection(env=process.env){
 const url=env.SOLANA_RPC_URL;
 if(!url)throw new Error('SOLANA_RPC_URL is required.');
 if(!/^https:\/\//.test(url)&&!LOCAL_RPC.test(url))throw new Error('SOLANA_RPC_URL must be https (http is allowed only on localhost).');
 return new Connection(url,'confirmed');
}

export function settlementKeypair(env=process.env){
 if(env.SETTLEMENT_KEYPAIR_JSON)return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(env.SETTLEMENT_KEYPAIR_JSON)));
 if(env.SETTLEMENT_KEYPAIR_PATH)return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(resolveKeypairPath(env.SETTLEMENT_KEYPAIR_PATH),'utf8'))));
 throw new Error('Settlement keypair is not configured.');
}

export async function latestBlockhash(conn){
 const {blockhash}=await conn.getLatestBlockhash('confirmed');return blockhash;
}

export async function accountInfo(conn,address){
 const info=await conn.getAccountInfo(new PublicKey(address),'confirmed');return info;
}

export async function finalizedTransaction(conn,signature){
 const tx=await conn.getTransaction(signature,{commitment:'finalized',maxSupportedTransactionVersion:0});
 if(!tx)return {finalized:false};
 const meta=tx.meta;if(meta?.err)return {finalized:true,success:false,err:meta.err};
 return {finalized:true,success:true,tx,blockTime:tx.blockTime?tx.blockTime*1000:null};
}

export async function sendAndConfirm(conn,transaction,signers){
 const {blockhash,lastValidBlockHeight}=await conn.getLatestBlockhash('confirmed');
 transaction.recentBlockhash=blockhash;
 if(!(transaction instanceof Transaction))throw new Error('Expected a legacy transaction.');
 const signature=await conn.sendTransaction(transaction,signers,{skipPreflight:false,preflightCommitment:'confirmed'});
 const confirmation=await conn.confirmTransaction({signature,blockhash,lastValidBlockHeight},'finalized');
 if(confirmation.value.err)throw new Error('On-chain transaction failed.');
 return signature;
}
