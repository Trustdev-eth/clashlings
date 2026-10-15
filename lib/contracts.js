import {TOKENS,stakeRequirement} from '../public/game/tokens.js';
import {decode58,encode58,unb64,sha256,signedHeaders} from './security.js';
import {realtimeReady} from './realtime-bridge.js';
const error=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
export function contractConfig(env){
 const decimals=Number(env.GAME_TOKEN_DECIMALS??9);let addresses=false;try{addresses=decode58(env.GAME_TOKEN_MINT).length===32&&decode58(env.GAME_PROGRAM_ID).length===32;}catch{}
 const configured=addresses&&Number.isInteger(decimals)&&decimals>=0&&decimals<=12&&!!env.CONTRACT_ADAPTER_KEY&&/^https:\/\//.test(env.CONTRACT_ADAPTER_URL||'');
 return {configured,enabled:configured&&env.LIVE_TOKEN_ENABLED==='true'&&realtimeReady(env)&&!!env.PYTH_API_KEY,mint:env.GAME_TOKEN_MINT||null,programId:env.GAME_PROGRAM_ID||null,decimals,symbol:env.GAME_TOKEN_SYMBOL||'GAME',chain:'solana:mainnet',lockSeconds:Math.max(86400,Number(env.STAKE_LOCK_SECONDS)||604800)};
}
export const toUnits=(amount,decimals)=>{if(!Number.isSafeInteger(amount)||amount<=0)error('Invalid token amount.');return (BigInt(amount)*10n**BigInt(decimals)).toString();};
export async function adapter(env,operation,data){
 const config=contractConfig(env);if(!config.configured)error('Token contracts are not connected yet.',503);
 const body=JSON.stringify({...data,programId:config.programId,mint:config.mint,decimals:config.decimals,chain:config.chain}),headers=await signedHeaders(body,env.CONTRACT_ADAPTER_KEY),r=await (env.CONTRACTS?.fetch?env.CONTRACTS.fetch(new Request(new URL('/v1/'+operation,env.CONTRACT_ADAPTER_URL),{method:'POST',headers,body})):fetch(new URL('/v1/'+operation,env.CONTRACT_ADAPTER_URL),{method:'POST',headers,body,signal:AbortSignal.timeout(8000)}));
 if(!r.ok)error('The token service could not complete this request. Check your wallet transaction before retrying.',503);let result;try{result=await r.json();}catch{error('Invalid token service response.',502);}return result;
}
export async function tokenLevels(db,owner,now=Date.now()){
 const positions=(await db.prepare("SELECT * FROM token_positions WHERE player_id=? AND status='active'").bind(owner).all()).results,levels=Array(12).fill(1),locked=Array(12).fill('0');
 for(let card=0;card<12;card++){const sum=positions.filter(p=>p.card===card).reduce((n,p)=>n+BigInt(p.amount_units),0n);locked[card]=sum.toString();for(let level=2;level<=5;level++){// Position receipts store units, so requirements use the receipt's verified decimals.
   const sample=positions.find(p=>p.card===card),decimals=sample?JSON.parse(sample.receipt).decimals:9;
   if(sum>=BigInt(toUnits(stakeRequirement(card,level),decimals)))levels[card]=level;
  }}return {levels,locked,positions:positions.map(p=>({id:p.id,card:p.card,amountUnits:p.amount_units,lockUntil:p.lock_until}))};
}
// Constrain the unsigned envelope before it reaches a wallet. Contract instruction
// semantics remain the configured adapter/program's responsibility (see its spec).
export function validateTransactionEnvelope(serialized,cfg,wallet){
 let bytes;try{bytes=unb64(serialized);}catch{error('Invalid Solana transaction.',502);}
 if(bytes.length<100||bytes.length>4096)error('Invalid transaction size.',502);let offset=0;
 const take=n=>{if(n<0||offset+n>bytes.length)error('Truncated transaction.',502);const result=bytes.slice(offset,offset+n);offset+=n;return result;};
 const short=()=>{let out=0;for(let n=0;n<3;n++){const b=take(1)[0];out|=(b&127)<<(7*n);if(!(b&128))return out;}error('Invalid transaction length.',502);};
 const signatures=short();if(signatures<1||signatures>8)error('Invalid transaction signatures.',502);take(signatures*64);let versioned=false;
 if(bytes[offset]&128){versioned=true;if(take(1)[0]!==128)error('Unsupported transaction version.',502);}
 const header=take(3);if(header[0]!==signatures)error('Invalid signer count.',502);const count=short();if(count<3||count>64)error('Invalid transaction accounts.',502);const keys=Array.from({length:count},()=>encode58(take(32)));if(keys[0]!==wallet||!keys.includes(cfg.mint))error('The transaction wallet or mint does not match.',502);take(32);
 const instructions=short();if(instructions<1||instructions>12)error('Invalid instruction count.',502);let game=false;
 for(let n=0;n<instructions;n++){const program=keys[take(1)[0]],accounts=take(short()),data=take(short());if(accounts.some(i=>i>=keys.length))error('Lookup-table accounts are not enabled.',502);if(program===cfg.programId){game=true;if(!accounts.includes(0)||!accounts.includes(keys.indexOf(cfg.mint))||!data.length)error('Game instruction is missing its wallet or mint.',502);}else if(program!=='ComputeBudget111111111111111111111111111111')error('Unexpected transaction program.',502);}
 if(versioned&&short()!==0)error('Use a transaction with static account keys.',502);if(offset!==bytes.length||!game)error('Invalid game transaction.',502);return true;
}
export async function prepareIntent(db,env,owner,wallet,data,now=Date.now()){
 if(!wallet)error('Sign in with a Solana wallet first.',401);const cfg=contractConfig(env);if(!cfg.configured)error('Token staking is awaiting the game-token contracts.',503);
 if(typeof data.actionId!=='string'||!/^[a-zA-Z0-9-]{8,64}$/.test(data.actionId))error('Transaction request ID required.');
 const id=await sha256(owner+':token:'+data.actionId),existing=await db.prepare('SELECT * FROM token_intents WHERE id=? AND player_id=?').bind(id,owner).first();
 if(existing){if(existing.status==='prepared'&&existing.expires_at>now&&existing.receipt)return {...JSON.parse(existing.receipt),intentId:id};if(existing.status==='confirmed')return {intentId:id,confirmed:true};error('This transaction request expired. Start again.',409);}
 let amountUnits=data.amountUnits,card=data.card??null,targetLevel=data.targetLevel??null;
 if(data.kind==='stake'){
  if(!Number.isInteger(card)||!TOKENS[card])error('Choose a character.');const current=await tokenLevels(db,owner,now);targetLevel=current.levels[card]+1;if(targetLevel>5)error('Maximum staking level reached.');
  const required=BigInt(toUnits(stakeRequirement(card,targetLevel),cfg.decimals)),locked=BigInt(current.locked[card]);amountUnits=(required-locked).toString();if(BigInt(amountUnits)<=0n)error('Refresh your staking level.',409);
 }
 if(!/^\d{1,30}$/.test(String(amountUnits))||BigInt(amountUnits)<=0n)error('Invalid staking requirement.');
 const expiresAt=now+180000,intent={id,kind:data.kind,wallet,amountUnits,card,targetLevel,matchId:data.matchId??null,side:data.side??null,position:data.positionRef??null,createdAt:now,lockUntil:data.kind==='stake'?now+cfg.lockSeconds*1000:null,expiresAt};
 await db.prepare('INSERT INTO token_intents (id,player_id,wallet,kind,card,target_level,amount_units,match_id,side,position_ref,status,created_at,expires_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,owner,wallet,intent.kind,card,targetLevel,amountUnits,intent.matchId,intent.side,intent.position,'preparing',now,expiresAt).run();
 try{
  const proposal=await adapter(env,'prepare',intent);if(typeof proposal.transaction!=='string'||proposal.transaction.length<40||proposal.transaction.length>24000||!/^[A-Za-z0-9+/]+=*$/.test(proposal.transaction)||proposal.intentId!==id)error('Invalid prepared transaction.',502);
  validateTransactionEnvelope(proposal.transaction,cfg,wallet);const actualExpiry=Number.isFinite(proposal.expiresAt)?Math.min(expiresAt,proposal.expiresAt):expiresAt;if(actualExpiry<now+5000)error('Prepared transaction expired. Try again.',502);
  const result={intentId:id,transaction:proposal.transaction,expiresAt:actualExpiry,amountUnits,card,targetLevel,mint:cfg.mint,symbol:cfg.symbol,decimals:cfg.decimals,chain:cfg.chain,kind:intent.kind,lockUntil:intent.lockUntil};
  await db.prepare("UPDATE token_intents SET status='prepared',receipt=?,expires_at=? WHERE id=?").bind(JSON.stringify(result),actualExpiry,id).run();return result;
 }catch(e){await db.prepare("UPDATE token_intents SET status='failed' WHERE id=?").bind(id).run();throw e;}
}
export async function verifyIntent(db,env,owner,id,signature,now=Date.now()){
 const row=await db.prepare('SELECT * FROM token_intents WHERE id=? AND player_id=?').bind(id,owner).first();if(!row)error('Transaction request not found.',404);if(row.status==='confirmed')return {row,receipt:JSON.parse(row.receipt),duplicate:true};
 if(row.status!=='prepared')error('Transaction request expired. Contact support with its wallet signature.',409);
 try{if(decode58(signature).length!==64)throw new Error();}catch{error('Invalid transaction signature.');}
 const cfg=contractConfig(env),receipt=await adapter(env,'verify',{intentId:id,kind:row.kind,wallet:row.wallet,signature,amountUnits:row.amount_units,card:row.card,targetLevel:row.target_level,matchId:row.match_id,side:row.side,position:row.position_ref,createdAt:row.created_at,expiresAt:row.expires_at});
 const valid=receipt.finalized===true&&receipt.success===true&&receipt.intentId===id&&receipt.signature===signature&&receipt.kind===row.kind&&receipt.programId===cfg.programId&&receipt.mint===cfg.mint&&receipt.decimals===cfg.decimals&&receipt.wallet===row.wallet&&receipt.amountUnits===row.amount_units&&typeof receipt.position==='string'&&receipt.position.length>=32&&Number.isSafeInteger(receipt.blockTime)&&receipt.blockTime>=row.created_at-15000&&receipt.blockTime<=row.expires_at+15000;
 if(receipt.finalized!==true&&receipt.success!==false)return {pending:true,row};
 if(!valid)error('The finalized token receipt did not match this request. No level or battle entry was granted.',409);
 if(row.kind==='stake'&&(receipt.locked!==true||receipt.card!==row.card||receipt.targetLevel!==row.target_level||!Number.isSafeInteger(receipt.lockUntil)||receipt.lockUntil<row.created_at+cfg.lockSeconds*1000))error('The staking lock or character does not match.',409);
 if(row.kind==='escrow'&&(receipt.matchId!==row.match_id||receipt.side!==row.side||receipt.locked!==true))error('The battle escrow is not confirmed.',409);
 if(row.kind==='unstake'&&(receipt.position!==row.position_ref||receipt.withdrawn!==true))error('The unstaking receipt does not match.',409);
 if(row.kind==='refund'&&(receipt.matchId!==row.match_id||receipt.refunded!==true||receipt.position!==row.position_ref))error('The refund is not finalized.',409);
 const statements=[db.prepare("UPDATE token_intents SET status='confirmed',signature=?,receipt=? WHERE id=? AND status='prepared'").bind(signature,JSON.stringify(receipt),id)];
 if(row.kind==='stake')statements.push(db.prepare("INSERT INTO token_positions (id,position,player_id,wallet,card,target_level,amount_units,lock_until,status,receipt) SELECT ?,?,?,?,?,?,?,?,'active',? WHERE changes()>0").bind(id,receipt.position,owner,row.wallet,row.card,row.target_level,row.amount_units,receipt.lockUntil,JSON.stringify(receipt)));
 if(row.kind==='unstake')statements.push(db.prepare("UPDATE token_positions SET status='withdrawn' WHERE player_id=? AND position=? AND changes()>0").bind(owner,row.position_ref));
 await db.batch(statements);return {row:{...row,status:'confirmed'},receipt,duplicate:false};
}
export async function syncStakes(db,env,owner,now=Date.now()){
 const positions=(await db.prepare("SELECT * FROM token_positions WHERE player_id=? AND status='active'").bind(owner).all()).results;if(!positions.length)return;
 const cfg=contractConfig(env);
 for(const wallet of new Set(positions.map(p=>p.wallet))){
  const group=positions.filter(p=>p.wallet===wallet),result=await adapter(env,'positions',{wallet,positions:group.map(p=>({intentId:p.id,position:p.position}))});
  if(result.finalized!==true||!Array.isArray(result.positions))error('Staking positions could not be refreshed.',503);
  const invalid=[];for(const p of group){const live=result.positions.find(r=>r.position===p.position);if(!live||live.active!==true||live.wallet!==wallet||live.mint!==cfg.mint||live.programId!==cfg.programId||live.amountUnits!==p.amount_units||live.lockUntil!==p.lock_until)invalid.push(db.prepare("UPDATE token_positions SET status='inactive' WHERE id=?").bind(p.id));}if(invalid.length)await db.batch(invalid);
 }
}
