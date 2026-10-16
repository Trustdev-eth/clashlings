const encoder=new TextEncoder(),alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export const b64=bytes=>btoa(String.fromCharCode(...bytes));
export const unb64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
export const base64url=b=>b64(b).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
export const fromBase64url=s=>unb64(s.replace(/-/g,'+').replace(/_/g,'/'));
export function decode58(s){if(typeof s!=='string'||s.length<32||s.length>88)throw new Error('Invalid base58');const a=[0];for(const c of s){let carry=alphabet.indexOf(c);if(carry<0)throw new Error('Invalid base58');for(let i=0;i<a.length;i++){carry+=a[i]*58;a[i]=carry&255;carry>>=8;}while(carry){a.push(carry&255);carry>>=8;}}for(let i=0;i<s.length-1&&s[i]==='1';i++)a.push(0);return Uint8Array.from(a.reverse());}
export function encode58(bytes){const a=[0];for(const b of bytes){let carry=b;for(let i=0;i<a.length;i++){carry+=a[i]<<8;a[i]=carry%58;carry=Math.floor(carry/58);}while(carry){a.push(carry%58);carry=Math.floor(carry/58);}}let out='';for(let i=0;i<bytes.length-1&&bytes[i]===0;i++)out+='1';return out+a.reverse().map(i=>alphabet[i]).join('');}
export async function sha256(s){return base64url(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(s))));}
async function key(secret){return crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);}
export async function signToken(payload,secret){const data=base64url(encoder.encode(JSON.stringify(payload))),sig=await crypto.subtle.sign('HMAC',await key(secret),encoder.encode(data));return data+'.'+base64url(new Uint8Array(sig));}
export async function verifyToken(token,secret,{aud,now=Date.now()}={}){try{if(typeof token!=='string'||token.length>4096||!secret)return null;const [data,sig,...extra]=token.split('.');if(extra.length||!await crypto.subtle.verify('HMAC',await key(secret),fromBase64url(sig),encoder.encode(data)))return null;const p=JSON.parse(new TextDecoder().decode(fromBase64url(data)));return Number.isFinite(p.exp)&&p.exp>=now&&(!aud||p.aud===aud)?p:null;}catch{return null;}}
export async function signedHeaders(body,secret,now=Date.now()) {return {'Content-Type':'application/json','x-arena-auth':await signToken({aud:'arena-service',exp:now+30000,hash:await sha256(body),nonce:crypto.randomUUID()},secret)};}
export async function verifyService(request,body,secret,now=Date.now()){const p=await verifyToken(request.headers.get('x-arena-auth'),secret,{aud:'arena-service',now});return !!(p&&p.hash===await sha256(body));}
const LOOPBACK=new Set(['localhost','127.0.0.1','[::1]','::1']);
export function sameSiteOrigin(a,b){
 if(typeof a!=='string'||typeof b!=='string'||!a||!b)return false;
 if(a===b)return true;
 try{
  const x=new URL(a),y=new URL(b);
  if(x.protocol!==y.protocol||x.port!==y.port)return false;
  if(x.hostname===y.hostname)return true;
  return LOOPBACK.has(x.hostname)&&LOOPBACK.has(y.hostname);
 }catch{return false;}
}
