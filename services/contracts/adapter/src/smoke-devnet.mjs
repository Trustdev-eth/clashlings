import {createHash} from 'node:crypto';
import {Keypair,LAMPORTS_PER_SOL,PublicKey,SystemProgram,Transaction} from '@solana/web3.js';
import {getOrCreateAssociatedTokenAccount,transfer} from '@solana/spl-token';
import {signedHeaders} from '../../../../lib/security.js';
import {loadAdapterEnv} from './env.mjs';
import {handleAdapterRequest} from './server.mjs';
import {connection,sendAndConfirm,settlementKeypair} from './rpc.mjs';
import {mintKey} from './program.mjs';

loadAdapterEnv();
const env=process.env;
const conn=connection(env);
const payer=settlementKeypair(env);
const mint=mintKey(env);
const explorer=sig=>`https://explorer.solana.com/tx/${sig}?cluster=devnet`;
const result={cluster:'devnet',programId:env.GAME_PROGRAM_ID,mint:mint.toBase58(),wallet:payer.publicKey.toBase58(),steps:[]};

function intentId(label){
 return createHash('sha256').update(`devnet-smoke:${label}:${Date.now()}:${Math.random()}`).digest('base64url');
}

async function adapter(path,body){
 const payload=JSON.stringify({
  programId:env.GAME_PROGRAM_ID,mint:env.GAME_TOKEN_MINT,decimals:Number(env.GAME_TOKEN_DECIMALS??9),
  chain:env.GAME_TOKEN_CHAIN||'solana:devnet',...body
 });
 const headers=await signedHeaders(payload,env.CONTRACT_ADAPTER_KEY);
 const response=await handleAdapterRequest(new Request('http://127.0.0.1:8788'+path,{method:'POST',headers,body:payload}),env);
 const data=await response.json();
 if(!response.ok)throw new Error((data.error||path)+` (${response.status})`);
 return data;
}

async function sendPrepared(serialized,signer){
 const tx=Transaction.from(Buffer.from(serialized,'base64'));
 tx.partialSign(signer);
 const signature=await conn.sendRawTransaction(tx.serialize(),{skipPreflight:false,preflightCommitment:'confirmed'});
 const confirmation=await conn.confirmTransaction(signature,'finalized');
 if(confirmation.value.err)throw new Error('On-chain transaction failed: '+JSON.stringify(confirmation.value.err));
 return signature;
}

async function userFlow(kind,signer,fields){
 const prepared=await adapter('/v1/prepare',{kind,wallet:signer.publicKey.toBase58(),...fields});
 const signature=await sendPrepared(prepared.transaction,signer);
 const verified=await adapter('/v1/verify',{intentId:fields.id,kind,wallet:signer.publicKey.toBase58(),signature,...fields});
 if(verified.finalized!==true||verified.success!==true)throw new Error(kind+' did not finalize.');
 return {prepared,signature,verified};
}

function note(name,data){
 result.steps.push({name,...data});
 console.log(JSON.stringify({name,...data}));
}

try{
 const sol=await conn.getBalance(payer.publicKey);
 note('wallet',{sol:sol/LAMPORTS_PER_SOL,ataWait:true});
 if(sol<80_000_000)throw new Error('Authority wallet needs more SOL for the live smoke.');

 const stakeAmount='1000000000';
 const stake=await userFlow('stake',payer,{id:intentId('stake'),amountUnits:stakeAmount,card:0,targetLevel:2});
 note('stake',{ok:true,signature:stake.signature,position:stake.verified.position,lockUntil:stake.verified.lockUntil,explorer:explorer(stake.signature)});

 const positions=await adapter('/v1/positions',{wallet:payer.publicKey.toBase58(),positions:[{position:stake.verified.position}]});
 const live=positions.positions?.[0];
 if(!live?.active||live.amountUnits!==stakeAmount)throw new Error('Positions readback did not show the new stake.');
 note('positions',{ok:true,active:live.active,amountUnits:live.amountUnits,lockUntil:live.lockUntil});

 let unstakeError=null;
 try{
  const prepared=await adapter('/v1/prepare',{kind:'unstake',id:intentId('unstake'),wallet:payer.publicKey.toBase58(),amountUnits:stakeAmount,position:stake.verified.position});
  await sendPrepared(prepared.transaction,payer);
 }catch(error){unstakeError=error.message||String(error);}
 if(!/StillLocked|6007|0x1777/i.test(unstakeError||''))throw new Error('Unstake should still be locked, got: '+unstakeError);
 note('unstake-still-locked',{ok:true,error:unstakeError.slice(0,240)});

 const refundAmount='1000000000';
 const refundMatch='smoke-refund-'+Date.now();
 const one=await userFlow('escrow',payer,{id:intentId('escrow-refund'),amountUnits:refundAmount,matchId:refundMatch,side:0});
 note('escrow-one-side',{ok:true,signature:one.signature,position:one.verified.position,explorer:explorer(one.signature)});
 const refund=await userFlow('refund',payer,{id:intentId('refund'),amountUnits:refundAmount,matchId:refundMatch,side:0});
 note('refund-incomplete',{ok:true,signature:refund.signature,explorer:explorer(refund.signature)});

 const opponent=Keypair.generate();
 const fund=new Transaction().add(SystemProgram.transfer({fromPubkey:payer.publicKey,toPubkey:opponent.publicKey,lamports:50_000_000}));
 const fundSig=await sendAndConfirm(conn,fund,[payer]);
 const payerAta=await getOrCreateAssociatedTokenAccount(conn,payer,mint,payer.publicKey);
 const oppAta=await getOrCreateAssociatedTokenAccount(conn,payer,mint,opponent.publicKey);
 const tokenSig=await transfer(conn,payer,payerAta.address,oppAta.address,payer,5_000_000_000n,[],{commitment:'finalized'});
 note('fund-opponent',{ok:true,wallet:opponent.publicKey.toBase58(),sol:fundSig,tokens:tokenSig});

 const settleAmount='1000000000';
 const matchId='smoke-settle-'+Date.now();
 const side0=await userFlow('escrow',payer,{id:intentId('escrow-0'),amountUnits:settleAmount,matchId,side:0});
 const side1=await userFlow('escrow',opponent,{id:intentId('escrow-1'),amountUnits:settleAmount,matchId,side:1});
 note('escrow-both-sides',{ok:true,side0:side0.signature,side1:side1.signature,explorer0:explorer(side0.signature),explorer1:explorer(side1.signature)});

 const settled=await adapter('/v1/settle',{
  settlementId:'match:'+matchId,matchId,winner:0,amountUnits:settleAmount,
  participants:[{wallet:payer.publicKey.toBase58(),side:0},{wallet:opponent.publicKey.toBase58(),side:1}]
 });
 if(settled.finalized!==true||settled.success!==true)throw new Error('Settlement did not finalize.');
 const expected=settled.payouts||[];
 if(expected[0]?.amountUnits!=='2000000000'||expected[1]?.amountUnits!=='0')throw new Error('Settlement payouts were not 2× / 0.');
 note('settle-winner-0',{ok:true,signature:settled.signature,payouts:expected,explorer:explorer(settled.signature)});

 result.ok=true;
 console.log(JSON.stringify(result,null,2));
}catch(error){
 result.ok=false;
 result.error=error.message||String(error);
 console.error(JSON.stringify(result,null,2));
 process.exit(1);
}
