import {Keypair,PublicKey,Transaction} from '@solana/web3.js';
import {readFileSync} from 'node:fs';
import {loadAdapterEnv} from './env.mjs';
import {MIN_LOCK_SECONDS} from './logic.mjs';
import {initializeInstruction,mintKey} from './program.mjs';
import {connection,resolveKeypairPath,sendAndConfirm} from './rpc.mjs';

loadAdapterEnv();
const env=process.env;
const authority=Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(resolveKeypairPath(env.AUTHORITY_KEYPAIR_PATH||env.SETTLEMENT_KEYPAIR_PATH),'utf8'))));
const settlement=env.SETTLEMENT_AUTHORITY?new PublicKey(env.SETTLEMENT_AUTHORITY):authority.publicKey;
const lockSeconds=Math.max(MIN_LOCK_SECONDS,Number(env.STAKE_LOCK_SECONDS)||604800);
const conn=connection(env);
const tx=new Transaction();
tx.feePayer=authority.publicKey;
tx.add(initializeInstruction(env,authority,settlement,lockSeconds));
const signature=await sendAndConfirm(conn,tx,[authority]);
console.log(JSON.stringify({ok:true,signature,mint:mintKey(env).toBase58(),settlementAuthority:settlement.toBase58(),lockSeconds},null,2));
