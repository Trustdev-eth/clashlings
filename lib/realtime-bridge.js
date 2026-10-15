import {signToken,signedHeaders} from './security.js';
const localRealtime=url=>/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(url||'');
export const realtimeReady=env=>!!(env.REALTIME_URL&&env.REALTIME_SHARED_SECRET&&(/^https:\/\//.test(env.REALTIME_URL)||localRealtime(env.REALTIME_URL)));
export async function realtimeTicket(row,owner,origin,env,now=Date.now()){
 if(!realtimeReady(env))throw Object.assign(new Error('The realtime service is not configured.'),{status:503});
 const side=row.p0===owner?0:row.p1===owner?1:null;if(side===null)throw Object.assign(new Error('Battle not found.'),{status:404});
 const ticket=await signToken({aud:'arena-room',match:row.id,player:owner,side,origin,exp:now+60000,jti:crypto.randomUUID()},env.REALTIME_SHARED_SECRET),url=new URL(`/matches/${row.id}/socket`,env.REALTIME_URL);url.protocol=localRealtime(env.REALTIME_URL)?'ws:':'wss:';url.searchParams.set('ticket',ticket);return {url:url.href,expiresAt:now+60000};
}
export async function roomRequest(row,owner,action,env){
 if(!realtimeReady(env))throw Object.assign(new Error('The realtime service is reconnecting. Your match will resume on the same server.'),{status:503});
 const body=JSON.stringify({player:owner,side:row.p0===owner?0:1,action}),headers=await signedHeaders(body,env.REALTIME_SHARED_SECRET),url=new URL(`/matches/${row.id}/${action?'command':'snapshot'}`,env.REALTIME_URL),r=await (env.REALTIME?.fetch?env.REALTIME.fetch(new Request(url,{method:'POST',headers,body})):fetch(url,{method:'POST',headers,body,signal:AbortSignal.timeout(7000)}));let data;try{data=await r.json();}catch{throw Object.assign(new Error('The match server is reconnecting.'),{status:503});}if(!r.ok)throw Object.assign(new Error(data.error||'The match server is unavailable.'),{status:r.status});return data;
}
const healthCache=new Map();
export async function realtimeHealthy(env){
 if(!realtimeReady(env))return false;const key=env.REALTIME_URL,old=healthCache.get(key);if(old&&Date.now()-old.at<2000)return old.ok;
 try{const response=env.REALTIME?.fetch?await env.REALTIME.fetch(new Request(new URL('/health',key))):await fetch(new URL('/health',key),{signal:AbortSignal.timeout(2500)}),data=await response.json(),ok=response.ok&&data.ok===true&&data.protocol===1;healthCache.set(key,{ok,at:Date.now()});return ok;}catch{healthCache.set(key,{ok:false,at:Date.now()});return false;}
}
