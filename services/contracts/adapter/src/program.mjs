import {Buffer} from 'node:buffer';
import {
 ComputeBudgetProgram,PublicKey,Transaction,TransactionInstruction,SystemProgram
} from '@solana/web3.js';
import {ASSOCIATED_TOKEN_PROGRAM_ID,TOKEN_PROGRAM_ID,getAssociatedTokenAddressSync} from '@solana/spl-token';
import {encode58} from '../../../../lib/security.js';
import {
 encodeCancelData,encodeEscrowData,encodeInitializeData,encodeRefundData,encodeSettleData,encodeStakeData,encodeUnstakeData,
 intentHash,matchHash,PROGRAM_ID_DEFAULT
} from './logic.mjs';

export function programId(env=process.env){return new PublicKey(env.GAME_PROGRAM_ID||PROGRAM_ID_DEFAULT);}
export function mintKey(env=process.env){return new PublicKey(env.GAME_TOKEN_MINT);}

export const pdas={
 config:id=>PublicKey.findProgramAddressSync([Buffer.from('config')],id),
 vault:id=>PublicKey.findProgramAddressSync([Buffer.from('vault')],id),
 stake:(id,hash)=>PublicKey.findProgramAddressSync([Buffer.from('stake'),hash],id),
 escrow:(id,hash,side)=>PublicKey.findProgramAddressSync([Buffer.from('escrow'),hash,Buffer.from([side])],id),
 match:(id,hash)=>PublicKey.findProgramAddressSync([Buffer.from('match'),hash],id)
};

export function associatedToken(mint,owner,allowOffCurve=false){
 return getAssociatedTokenAddressSync(mint,owner,allowOffCurve,TOKEN_PROGRAM_ID,ASSOCIATED_TOKEN_PROGRAM_ID);
}

function vaultSet(program,mint){
 const [config]=pdas.config(program),[vaultAuthority]=pdas.vault(program);
 return {config,vaultAuthority,vault:associatedToken(mint,vaultAuthority,true)};
}

function metas(keys,{signers,writable}){
 const signerSet=new Set(signers.map(k=>k.toBase58())),writeSet=new Set(writable.map(k=>k.toBase58()));
 return keys.map(pubkey=>({pubkey,isSigner:signerSet.has(pubkey.toBase58()),isWritable:writeSet.has(pubkey.toBase58())}));
}

export function userInstruction(kind,env,intent){
 const program=programId(env),mint=mintKey(env),wallet=new PublicKey(intent.wallet),vault=vaultSet(program,mint);
 if(kind==='stake'){
  const hash=intentHash(intent.id),[position]=pdas.stake(program,hash),userAta=associatedToken(mint,wallet);
  const keys=[wallet,vault.config,mint,userAta,vault.vault,vault.vaultAuthority,position,TOKEN_PROGRAM_ID,SystemProgram.programId];
  return {ix:new TransactionInstruction({programId:program,keys:metas(keys,{signers:[wallet],writable:[wallet,userAta,vault.vault,position]}),data:encodeStakeData({intentHash:hash,amount:intent.amountUnits,card:intent.card,targetLevel:intent.targetLevel})}),position};
 }
 if(kind==='unstake'){
  if(typeof intent.position!=='string')throw new Error('Staking position required.');
  const position=new PublicKey(intent.position),userAta=associatedToken(mint,wallet);
  const keys=[wallet,vault.config,mint,userAta,vault.vault,vault.vaultAuthority,position,TOKEN_PROGRAM_ID,ASSOCIATED_TOKEN_PROGRAM_ID,SystemProgram.programId];
  return {ix:new TransactionInstruction({programId:program,keys:metas(keys,{signers:[wallet],writable:[wallet,userAta,vault.vault,position]}),data:encodeUnstakeData()}),position};
 }
 if(kind==='escrow'){
  const hash=matchHash(intent.matchId),[matchPda]=pdas.match(program,hash),[escrow]=pdas.escrow(program,hash,intent.side),userAta=associatedToken(mint,wallet);
  const keys=[wallet,vault.config,mint,userAta,vault.vault,vault.vaultAuthority,matchPda,escrow,TOKEN_PROGRAM_ID,SystemProgram.programId];
  return {ix:new TransactionInstruction({programId:program,keys:metas(keys,{signers:[wallet],writable:[wallet,userAta,vault.vault,matchPda,escrow]}),data:encodeEscrowData({matchHash:hash,side:intent.side,amount:intent.amountUnits})}),position:escrow};
 }
 if(kind==='refund'){
  const hash=matchHash(intent.matchId),[matchPda]=pdas.match(program,hash),[escrow]=pdas.escrow(program,hash,intent.side),userAta=associatedToken(mint,wallet);
  const keys=[wallet,vault.config,mint,userAta,vault.vault,vault.vaultAuthority,matchPda,escrow,TOKEN_PROGRAM_ID,ASSOCIATED_TOKEN_PROGRAM_ID,SystemProgram.programId];
  return {ix:new TransactionInstruction({programId:program,keys:metas(keys,{signers:[wallet],writable:[wallet,userAta,vault.vault,matchPda,escrow]}),data:encodeRefundData({matchHash:hash,side:intent.side})}),position:escrow};
 }
 throw new Error('Unsupported intent kind.');
}

export function settleInstruction(env,payload,authority){
 const program=programId(env),mint=mintKey(env),hash=matchHash(payload.matchId),vault=vaultSet(program,mint);
 const participants=[...payload.participants].sort((a,b)=>a.side-b.side);
 if(participants.length!==2||participants[0].side!==0||participants[1].side!==1)throw new Error('Settlement requires sides 0 and 1.');
 const wallet0=new PublicKey(participants[0].wallet),wallet1=new PublicKey(participants[1].wallet);
 const [matchPda]=pdas.match(program,hash),[escrow0]=pdas.escrow(program,hash,0),[escrow1]=pdas.escrow(program,hash,1);
 const ata0=associatedToken(mint,wallet0),ata1=associatedToken(mint,wallet1);
 const keys=[authority.publicKey,vault.config,mint,matchPda,escrow0,escrow1,vault.vault,vault.vaultAuthority,wallet0,wallet1,ata0,ata1,TOKEN_PROGRAM_ID,ASSOCIATED_TOKEN_PROGRAM_ID,SystemProgram.programId];
 return new TransactionInstruction({
  programId:program,
  keys:metas(keys,{signers:[authority.publicKey],writable:[authority.publicKey,matchPda,escrow0,escrow1,vault.vault,ata0,ata1]}),
  data:encodeSettleData({matchHash:hash,winner:payload.winner})
 });
}

export function cancelInstruction(env,matchId,authority){
 const program=programId(env),hash=matchHash(matchId),[config]=pdas.config(program),[matchPda]=pdas.match(program,hash);
 const keys=[authority.publicKey,config,matchPda];
 return new TransactionInstruction({
  programId:program,
  keys:metas(keys,{signers:[authority.publicKey],writable:[matchPda]}),
  data:encodeCancelData({matchHash:hash})
 });
}

export function initializeInstruction(env,authority,settlementAuthority,lockSeconds){
 const program=programId(env),mint=mintKey(env),[config]=pdas.config(program),[vaultAuthority]=pdas.vault(program);
 const vault=associatedToken(mint,vaultAuthority,true);
 const keys=[authority.publicKey,vaultAuthority,mint,vault,config,TOKEN_PROGRAM_ID,ASSOCIATED_TOKEN_PROGRAM_ID,SystemProgram.programId];
 return new TransactionInstruction({
  programId:program,
  keys:metas(keys,{signers:[authority.publicKey],writable:[authority.publicKey,vault,config]}),
  data:encodeInitializeData({settlementAuthority:settlementAuthority.toBuffer(),lockSeconds})
 });
}

export function assembleUserTransaction(ix,wallet,blockhash,env=process.env){
 const tx=new Transaction({feePayer:wallet,recentBlockhash:blockhash});
 const price=Number(env.COMPUTE_UNIT_PRICE_MICROLAMPORTS||1000);
 tx.add(ComputeBudgetProgram.setComputeUnitLimit({units:400_000}));
 tx.add(ComputeBudgetProgram.setComputeUnitPrice({microLamports:Number.isFinite(price)&&price>=0?price:1000}));
 tx.add(ix);
 return tx.serialize({requireAllSignatures:false,verifySignatures:false}).toString('base64');
}

export function encodePosition(pubkey){return encode58(pubkey.toBytes());}
