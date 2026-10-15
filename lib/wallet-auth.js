import {decode58,base64url,fromBase64url,sha256} from './security.js';
const cookieName='__Host-arena-session',json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store',...headers}});
const encoder=new TextEncoder();
function cookie(request){return request.headers.get('cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName+'='))?.slice(cookieName.length+1);}
export async function sessionIdentity(request,db,now=Date.now()){
 const token=cookie(request);if(!token||!/^[\w-]{43}$/.test(token))return null;
 const row=await db.prepare('SELECT s.player_id,s.wallet,s.expires_at FROM wallet_sessions s WHERE s.token_hash=? AND s.expires_at>?').bind(await sha256(token),now).first();return row?{owner:row.player_id,wallet:row.wallet,expiresAt:row.expires_at}:null;
}
export async function walletAuth(request,env,path,body,now=Date.now()){
 const db=env.DB,url=new URL(request.url),siteOrigin=env.SITE_ORIGIN||url.origin;
 if(url.origin!==siteOrigin)return json({error:'Wallet authentication domain is not configured for this origin.'},403);
 if(request.method==='GET'&&path==='session'){const s=await sessionIdentity(request,db,now);return json({authenticated:!!s,wallet:s?.wallet||null});}
 if(request.method!=='POST'||request.headers.get('origin')!==siteOrigin)return json({error:'Use this site to sign in.'},403);
 if(path==='logout'){const token=cookie(request);if(token)await db.prepare('DELETE FROM wallet_sessions WHERE token_hash=?').bind(await sha256(token)).run();return json({ok:true},200,{'Set-Cookie':`${cookieName}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`});}
 if(path==='challenge'){
  try{if(decode58(body.address).length!==32)throw new Error();}catch{return json({error:'Choose a valid Solana wallet address.'},400);}
  const address=body.address,issued=new Date(now).toISOString(),expires=now+5*60*1000,id=crypto.randomUUID(),nonce=base64url(crypto.getRandomValues(new Uint8Array(24))).replace(/[-_]/g,'A');
  const limit=await db.prepare('SELECT count(*) n FROM wallet_challenges WHERE wallet=? AND created_at>?').bind(address,now-60000).first();if(limit.n>=6)return json({error:'Too many sign-in requests. Wait a minute.'},429);
  const message=`${url.host} wants you to sign in with your Solana account:\n${address}\n\nSign in to Clashlings. This request does not transfer funds.\n\nURI: ${siteOrigin}\nVersion: 1\nChain ID: mainnet\nNonce: ${nonce}\nIssued At: ${issued}\nExpiration Time: ${new Date(expires).toISOString()}\nRequest ID: ${id}`;
  const link=request.headers.get('oai-authenticated-user-id')||null;
  await db.batch([db.prepare('DELETE FROM wallet_challenges WHERE expires_at<?').bind(now-3600000),db.prepare('INSERT INTO wallet_challenges (id,wallet,message,origin,expires_at,created_at,link_owner) VALUES (?,?,?,?,?,?,?)').bind(id,address,message,siteOrigin,expires,now,link)]);
  return json({id,address,message,expiresAt:expires});
 }
 if(path==='verify'){
  if(typeof body.id!=='string'||body.id.length>64||typeof body.signature!=='string'||body.signature.length>120)return json({error:'Invalid wallet proof.'},400);
  const challenge=await db.prepare('SELECT * FROM wallet_challenges WHERE id=? AND consumed=0 AND expires_at>?').bind(body.id,now).first();if(!challenge||challenge.origin!==siteOrigin)return json({error:'Sign-in request expired or already used.'},401);
  try{const signature=fromBase64url(body.signature);if(signature.length!==64)throw new Error();const key=await crypto.subtle.importKey('raw',decode58(challenge.wallet),{name:'Ed25519'},false,['verify']);if(!await crypto.subtle.verify('Ed25519',key,signature,encoder.encode(challenge.message)))throw new Error();}catch{return json({error:'The wallet signature could not be verified.'},401);}
  const consumed=await db.prepare('UPDATE wallet_challenges SET consumed=1 WHERE id=? AND consumed=0 AND expires_at>?').bind(challenge.id,now).run();if(!consumed.meta.changes)return json({error:'This sign-in request was already used.'},401);
  const existing=await db.prepare('SELECT player_id FROM wallet_links WHERE wallet=?').bind(challenge.wallet).first();
  const headerOwner=request.headers.get('oai-authenticated-user-id'),linkAllowed=headerOwner&&challenge.link_owner===headerOwner&&await db.prepare('SELECT id FROM players WHERE id=?').bind(headerOwner).first();
  const owner=existing?.player_id||(linkAllowed?headerOwner:'wallet:'+challenge.wallet);
  await db.prepare('INSERT OR IGNORE INTO wallet_links (wallet,player_id,created_at) VALUES (?,?,?)').bind(challenge.wallet,owner,now).run();
  const linked=await db.prepare('SELECT player_id FROM wallet_links WHERE wallet=?').bind(challenge.wallet).first(),token=base64url(crypto.getRandomValues(new Uint8Array(32))),expiration=now+86400000;
  await db.batch([db.prepare('DELETE FROM wallet_sessions WHERE expires_at<?').bind(now),db.prepare('INSERT INTO wallet_sessions (token_hash,player_id,wallet,created_at,expires_at) VALUES (?,?,?,?,?)').bind(await sha256(token),linked.player_id,challenge.wallet,now,expiration)]);
  return json({ok:true,wallet:challenge.wallet},200,{'Set-Cookie':`${cookieName}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400`});
 }
 return json({error:'Wallet route not found.'},404);
}
