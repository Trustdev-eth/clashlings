import test from 'node:test';
import assert from 'node:assert/strict';
import {Keypair,PublicKey} from '@solana/web3.js';
import {encode58,signedHeaders} from '../../../../lib/security.js';
import {validateTransactionEnvelope} from '../../../../lib/contracts.js';
import {assembleUserTransaction,programId,userInstruction} from '../src/program.mjs';
import {payouts} from '../src/logic.mjs';
import {handleAdapterRequest} from '../src/server.mjs';

const wallet=Keypair.generate(),mint=Keypair.generate();
const env={GAME_PROGRAM_ID:programId({}).toBase58(),GAME_TOKEN_MINT:mint.publicKey.toBase58(),GAME_TOKEN_DECIMALS:'9'};
const cfg={mint:env.GAME_TOKEN_MINT,programId:env.GAME_PROGRAM_ID};

test('prepared stake, unstake, escrow and refund envelopes pass the game wallet/mint/program guard',()=>{
 const walletKey=wallet.publicKey.toBase58();
 const stake=userInstruction('stake',env,{id:'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',wallet:walletKey,amountUnits:'300000000000',card:0,targetLevel:2});
 assert.equal(validateTransactionEnvelope(assembleUserTransaction(stake.ix,wallet.publicKey,'11111111111111111111111111111111'),cfg,walletKey),true);
 const unstake=userInstruction('unstake',env,{wallet:walletKey,position:stake.position.toBase58(),amountUnits:'300000000000'});
 assert.equal(validateTransactionEnvelope(assembleUserTransaction(unstake.ix,wallet.publicKey,'11111111111111111111111111111111'),cfg,walletKey),true);
 const escrow=userInstruction('escrow',env,{wallet:walletKey,amountUnits:'25000000000',matchId:'6951ff14-0146-44e7-bab2-cc30ce39830c',side:0});
 assert.equal(validateTransactionEnvelope(assembleUserTransaction(escrow.ix,wallet.publicKey,'11111111111111111111111111111111'),cfg,walletKey),true);
 const refund=userInstruction('refund',env,{wallet:walletKey,amountUnits:'25000000000',matchId:'6951ff14-0146-44e7-bab2-cc30ce39830c',side:0});
 assert.equal(validateTransactionEnvelope(assembleUserTransaction(refund.ix,wallet.publicKey,'11111111111111111111111111111111'),cfg,walletKey),true);
});

test('a stake envelope is rejected for the wrong wallet or mint',()=>{
 const built=userInstruction('stake',env,{id:'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',wallet:wallet.publicKey.toBase58(),amountUnits:'1',card:1,targetLevel:2});
 const serialized=assembleUserTransaction(built.ix,wallet.publicKey,'11111111111111111111111111111111');
 assert.throws(()=>validateTransactionEnvelope(serialized,cfg,mint.publicKey.toBase58()));
 assert.throws(()=>validateTransactionEnvelope(serialized,{...cfg,mint:env.GAME_PROGRAM_ID},wallet.publicKey.toBase58()));
});

test('stake positions are unique per intent and settlement math is conserved',()=>{
 const a=userInstruction('stake',env,{id:'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',wallet:wallet.publicKey.toBase58(),amountUnits:'1',card:0,targetLevel:2});
 const b=userInstruction('stake',env,{id:'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',wallet:wallet.publicKey.toBase58(),amountUnits:'1',card:0,targetLevel:3});
 assert.notEqual(a.position.toBase58(),b.position.toBase58());
 const people=[{wallet:'A',side:0},{wallet:'B',side:1}],paid=payouts(0,'10',people);
 assert.equal(paid.reduce((n,p)=>n+BigInt(p.amountUnits),0n),20n);
 assert.ok(PublicKey.isOnCurve(wallet.publicKey));
 assert.equal(encode58(wallet.publicKey.toBytes()).length>30,true);
});

test('adapter health is public and signed routes require the game HMAC',async()=>{
 const adapterEnv={...env,CONTRACT_ADAPTER_KEY:'adapter-hmac-secret'};
 const health=await handleAdapterRequest(new Request('http://adapter.local/health'),adapterEnv);
 assert.equal(health.status,200);
 assert.equal((await health.json()).ok,true);
 const denied=await handleAdapterRequest(new Request('http://adapter.local/v1/prepare',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}),adapterEnv);
 assert.equal(denied.status,401);
 const body=JSON.stringify({kind:'stake',wallet:wallet.publicKey.toBase58(),amountUnits:'1'});
 const headers=await signedHeaders(body,adapterEnv.CONTRACT_ADAPTER_KEY);
 const invalid=await handleAdapterRequest(new Request('http://adapter.local/v1/prepare',{method:'POST',headers,body}),adapterEnv);
 assert.equal(invalid.status,400);
 assert.match((await invalid.json()).error,/Card index/);
});
