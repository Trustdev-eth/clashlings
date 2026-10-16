import {PublicKey} from '@solana/web3.js';
import {encode58} from '../../../../lib/security.js';
import {asInt,decodeEscrow,decodeStakePosition,ESCROW_LOCKED,ESCROW_REFUNDED,instructionName} from './logic.mjs';
import {mintKey,programId} from './program.mjs';
import {accountInfo,finalizedTransaction} from './rpc.mjs';

export async function verifyIntent(conn,env,request){
 const program=programId(env),mint=mintKey(env);
 const result=await finalizedTransaction(conn,request.signature);
 if(!result.finalized)return {finalized:false};
 if(!result.success)return {finalized:true,success:false};
 const message=result.tx.transaction.message;
 const keys=accountKeys(message);
 const ix=findGameInstruction(message,keys,program);
 if(!ix)throw new Error('Transaction does not call the arena program.');
 const name=instructionName(Buffer.from(ix.data));
 const kind=kindFromInstruction(name);
 if(kind!==request.kind)throw new Error('Instruction kind does not match the intent.');
 if(keys[0]!==request.wallet)throw new Error('Fee payer is not the signing wallet.');
 if(!keys.includes(mint.toBase58()))throw new Error('Mint is missing from the transaction.');

 const position=positionFromInstruction(kind,keys,ix);
 const info=await accountInfo(conn,position);
 if(!info||!info.owner.equals(program))throw new Error('Position account is missing.');
 const receipt={
  finalized:true,success:true,intentId:request.intentId,signature:request.signature,kind,
  programId:program.toBase58(),mint:mint.toBase58(),decimals:Number(env.GAME_TOKEN_DECIMALS??9),
  wallet:request.wallet,amountUnits:request.amountUnits,position,blockTime:result.blockTime
 };
 if(kind==='stake'||kind==='unstake'){
  const parsed=decodeStakePosition(info.data);
  if(encode58(parsed.owner)!==request.wallet||encode58(parsed.mint)!==mint.toBase58()||parsed.amount!==request.amountUnits)throw new Error('Stake position does not match.');
  if(kind==='stake'){
   if(parsed.withdrawn||parsed.card!==asInt(request.card,'Card')||parsed.targetLevel!==asInt(request.targetLevel,'Target level'))throw new Error('Stake lock does not match.');
   receipt.locked=true;receipt.card=parsed.card;receipt.targetLevel=parsed.targetLevel;receipt.lockUntil=parsed.lockUntil*1000;
  }else{
   if(!parsed.withdrawn)throw new Error('Position is still staked.');
   receipt.withdrawn=true;
  }
 }
 if(kind==='escrow'||kind==='refund'){
  const parsed=decodeEscrow(info.data);
  if(encode58(parsed.owner)!==request.wallet||encode58(parsed.mint)!==mint.toBase58()||parsed.amount!==request.amountUnits||parsed.side!==asInt(request.side,'Side'))throw new Error('Escrow position does not match.');
  if(kind==='escrow'){if(parsed.status!==ESCROW_LOCKED)throw new Error('Escrow is not locked.');receipt.locked=true;receipt.matchId=request.matchId;receipt.side=parsed.side;}
  else{if(parsed.status!==ESCROW_REFUNDED)throw new Error('Escrow was not refunded.');receipt.refunded=true;receipt.matchId=request.matchId;}
 }
 return receipt;
}

export async function readPositions(conn,env,payload){
 const program=programId(env),mint=mintKey(env);
 const positions=[];
 for(const item of payload.positions||[]){
  const info=await accountInfo(conn,item.position);
  if(!info||!info.owner.equals(program)){positions.push({position:item.position,active:false});continue;}
  try{
   const parsed=decodeStakePosition(info.data);
   const active=!parsed.withdrawn&&encode58(parsed.owner)===payload.wallet&&encode58(parsed.mint)===mint.toBase58();
   positions.push({
    position:item.position,wallet:encode58(parsed.owner),mint:encode58(parsed.mint),programId:program.toBase58(),
    amountUnits:parsed.amount,lockUntil:parsed.lockUntil*1000,active
   });
  }catch{positions.push({position:item.position,active:false});}
 }
 return {finalized:true,positions};
}

function accountKeys(message){
 if(message.staticAccountKeys)return message.staticAccountKeys.map(k=>k.toBase58());
 return message.accountKeys.map(k=>typeof k==='string'?k:k.toBase58());
}
function findGameInstruction(message,keys,program){
 const compiled=message.compiledInstructions||message.instructions||[];
 const programIndex=keys.indexOf(program.toBase58());if(programIndex<0)return null;
 for(const ix of compiled){
  const pid=Number.isInteger(ix.programIdIndex)?ix.programIdIndex:keys.indexOf(String(ix.programId));
  if(pid!==programIndex)continue;
  const data=typeof ix.data==='string'?Buffer.from(ix.data,'base64'):Buffer.from(ix.data);
  const accounts=(ix.accountKeyIndexes||ix.accounts||[]).map(i=>typeof i==='number'?keys[i]:String(i));
  return {data,accounts};
 }
 return null;
}
function kindFromInstruction(name){
 return {stake:'stake',unstake:'unstake',deposit_escrow:'escrow',refund_escrow:'refund',settle:'settle'}[name]||null;
}
function positionFromInstruction(kind,keys,ix){
 if(kind==='stake'||kind==='unstake')return ix.accounts[6];
 if(kind==='escrow'||kind==='refund')return ix.accounts[7];
 throw new Error('Unsupported kind.');
}

export {PublicKey};
