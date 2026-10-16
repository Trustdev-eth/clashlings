import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {encode58,sha256} from '../lib/security.js';
import {adapter,contractConfig,tokenOracleRequired} from '../lib/contracts.js';
import {payouts,intentHash,matchHash,instructionName,encodeStakeData,decodeStakePosition,decodeMatch,refundAllowed,DISCRIMINATORS} from '../services/contracts/adapter/src/logic.mjs';
const mint=encode58(new Uint8Array(32).fill(2)),program=encode58(new Uint8Array(32).fill(3));

test('token settlement pays the winner 2×, the loser 0, and a draw 1× each',()=>{
 const a={wallet:'Alice111111111111111111111111111111111111111',side:0},b={wallet:'Bob11111111111111111111111111111111111111111',side:1};
 assert.deepEqual(payouts(0,'25000000000',[a,b]),[{wallet:a.wallet,amountUnits:'50000000000'},{wallet:b.wallet,amountUnits:'0'}]);
 assert.deepEqual(payouts(1,'25000000000',[a,b]),[{wallet:a.wallet,amountUnits:'0'},{wallet:b.wallet,amountUnits:'50000000000'}]);
 assert.deepEqual(payouts(-1,'25000000000',[a,b]),[{wallet:a.wallet,amountUnits:'25000000000'},{wallet:b.wallet,amountUnits:'25000000000'}]);
 assert.throws(()=>payouts(2,'1',[a,b]));
});

test('intent IDs that are already SHA-256 stay 32 bytes, and match IDs are hashed',async()=>{
 const id=await sha256('trainer:token:action-one');
 assert.equal(intentHash(id).length,32);
 assert.notEqual(Buffer.compare(intentHash(id),intentHash('other')),0);
 assert.equal(matchHash('6951ff14-0146-44e7-bab2-cc30ce39830c').length,32);
 assert.equal(Buffer.compare(matchHash('a'),matchHash('a')),0);
});

test('Anchor discriminators match sha256(global:<name>)',()=>{
 for(const name of Object.keys(DISCRIMINATORS)){
  const expected=createHash('sha256').update('global:'+name).digest().subarray(0,8);
  assert.equal(Buffer.compare(DISCRIMINATORS[name],expected),0,name);
 }
});

test('fully locked matches cannot be refunded until cancelled',()=>{
 assert.equal(refundAllowed(0b01,false,false),true);
 assert.equal(refundAllowed(0b11,false,false),false);
 assert.equal(refundAllowed(0b11,true,false),true);
 assert.equal(refundAllowed(0b11,true,true),false);
 const body=Buffer.concat([
  Buffer.alloc(8,1),Buffer.alloc(32,2),Buffer.alloc(8),Buffer.alloc(32,3),Buffer.alloc(32,4),
  Buffer.from([3,0,1,7])
 ]);
 const parsed=decodeMatch(body);
 assert.equal(parsed.sides,3);
 assert.equal(parsed.settled,false);
 assert.equal(parsed.cancelled,true);
});

test('stake instruction data starts with the Anchor discriminator and round-trips the position layout',()=>{
 const hash=Buffer.alloc(32,7),data=encodeStakeData({intentHash:hash,amount:'300000000000',card:0,targetLevel:2});
 assert.equal(instructionName(data),'stake');
 assert.equal(Buffer.compare(data.subarray(0,8),DISCRIMINATORS.stake),0);
 const account=Buffer.concat([Buffer.alloc(8,1),Buffer.alloc(32,2),Buffer.alloc(32,3),Buffer.from(data.subarray(40,48)),Buffer.from([0,2]),Buffer.alloc(8),Buffer.from([0,1]),hash]);
 const parsed=decodeStakePosition(account);
 assert.equal(parsed.amount,'300000000000');
 assert.equal(parsed.card,0);
 assert.equal(parsed.targetLevel,2);
 assert.equal(parsed.withdrawn,false);
});

test('localhost adapter URL is configured without enabling live token battles',()=>{
 const cfg=contractConfig({GAME_TOKEN_MINT:mint,GAME_PROGRAM_ID:program,GAME_TOKEN_DECIMALS:'9',CONTRACT_ADAPTER_KEY:'k',CONTRACT_ADAPTER_URL:'http://127.0.0.1:8788'});
 assert.equal(cfg.configured,true);
 assert.equal(cfg.enabled,false);
 assert.equal(cfg.chain,'solana:mainnet');
 assert.equal(contractConfig({GAME_TOKEN_MINT:mint,GAME_PROGRAM_ID:program,GAME_TOKEN_DECIMALS:'9',CONTRACT_ADAPTER_KEY:'k',CONTRACT_ADAPTER_URL:'ftp://127.0.0.1:8788'}).configured,false);
});

test('token battles enable with the live flag and realtime, without a Pyth key',()=>{
 const env={GAME_TOKEN_MINT:mint,GAME_PROGRAM_ID:program,GAME_TOKEN_DECIMALS:'9',CONTRACT_ADAPTER_KEY:'k',CONTRACT_ADAPTER_URL:'http://127.0.0.1:8788',LIVE_TOKEN_ENABLED:'true',REALTIME_URL:'http://127.0.0.1:8787',REALTIME_SHARED_SECRET:'secret',GAME_TOKEN_CHAIN:'solana:devnet'};
 const cfg=contractConfig(env);
 assert.equal(cfg.configured,true);
 assert.equal(cfg.enabled,true);
 assert.equal(tokenOracleRequired(env),false);
 assert.equal(tokenOracleRequired({}),true);
});

test('the backend forwards the adapter error body to the game API',async()=>{
 const env={GAME_TOKEN_MINT:mint,GAME_PROGRAM_ID:program,GAME_TOKEN_DECIMALS:'9',CONTRACT_ADAPTER_KEY:'k',CONTRACT_ADAPTER_URL:'https://contracts.test',CONTRACTS:{async fetch(){return Response.json({error:'Side must be 0 or 1.'},{status:400});}}};
 await assert.rejects(()=>adapter(env,'prepare',{id:'x',kind:'escrow',side:'1'}),/Side must be 0 or 1/);
});
