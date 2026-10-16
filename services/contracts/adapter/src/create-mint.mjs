import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Keypair} from '@solana/web3.js';
import {createMint,getOrCreateAssociatedTokenAccount,mintTo} from '@solana/spl-token';
import {loadAdapterEnv} from './env.mjs';
import {connection as adapterConnection} from './rpc.mjs';

loadAdapterEnv();

const DECIMALS=Number(process.env.GAME_TOKEN_DECIMALS||9);
const AMOUNT=BigInt(process.env.GAME_TOKEN_MINT_AMOUNT||'1000000');
const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function decode58(s){
 if(typeof s!=='string'||!s)throw new Error('Secret key required.');
 const a=[0];
 for(const c of s){
  let carry=alphabet.indexOf(c);
  if(carry<0)throw new Error('Invalid base58 secret.');
  for(let i=0;i<a.length;i++){carry+=a[i]*58;a[i]=carry&255;carry>>=8;}
  while(carry){a.push(carry&255);carry>>=8;}
 }
 for(let i=0;i<s.length-1&&s[i]==='1';i++)a.push(0);
 return Uint8Array.from(a.reverse());
}

function loadPayer(){
 const raw=process.env.DEVNET_PAYER_SECRET||process.env.SETTLEMENT_KEYPAIR_JSON;
 if(raw){
  if(raw.trim().startsWith('['))return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
  const bytes=decode58(raw.trim());
  if(bytes.length===64)return Keypair.fromSecretKey(bytes);
  if(bytes.length===32)return Keypair.fromSeed(bytes);
  throw new Error('Secret must be a 32-byte seed or 64-byte keypair.');
 }
 const path=process.env.AUTHORITY_KEYPAIR_PATH||process.env.SETTLEMENT_KEYPAIR_PATH;
 if(!path)throw new Error('Set DEVNET_PAYER_SECRET or AUTHORITY_KEYPAIR_PATH.');
 return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path,'utf8'))));
}

process.env.SOLANA_RPC_URL||= 'https://api.devnet.solana.com';
const payer=await loadPayer();
const conn=adapterConnection(process.env);
const balance=await conn.getBalance(payer.publicKey);
if(balance<50_000_000){
 try{const sig=await conn.requestAirdrop(payer.publicKey,1_000_000_000);await conn.confirmTransaction(sig,'confirmed');}
 catch{/* faucet is often rate-limited; continue if the wallet already has SOL */}
}
const lamports=await conn.getBalance(payer.publicKey);
if(lamports<50_000_000)throw new Error('Wallet needs ~0.05 SOL on devnet to create the mint. Current lamports: '+lamports);

const mint=await createMint(conn,payer,payer.publicKey,null,DECIMALS,undefined,{commitment:'confirmed'});
const ata=await getOrCreateAssociatedTokenAccount(conn,payer,mint,payer.publicKey);
const units=AMOUNT*10n**BigInt(DECIMALS);
await mintTo(conn,payer,mint,ata.address,payer,units,[],{commitment:'confirmed'});

const keyPath=resolve(fileURLToPath(new URL('../.dev-keypair.json',import.meta.url)));
writeFileSync(keyPath,JSON.stringify([...payer.secretKey]));

const result={
 ok:true,
 cluster:'devnet',
 wallet:payer.publicKey.toBase58(),
 mint:mint.toBase58(),
 ata:ata.address.toBase58(),
 decimals:DECIMALS,
 minted:AMOUNT.toString(),
 keypairPath:keyPath
};
console.log(JSON.stringify(result,null,2));
