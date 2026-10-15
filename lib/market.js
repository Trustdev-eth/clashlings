import {TOKENS,quoteMaxAgeMs} from '../public/game/tokens.js';
const memory=new Map(),flights=new Map();
const COINGECKO_IDS={BTC:'bitcoin',SOL:'solana',ETH:'ethereum',XRP:'ripple',BONK:'bonk',PEPE:'pepe',DOGE:'dogecoin',WIF:'dogwifcoin',POPCAT:'popcat',MEW:'cat-in-a-dogs-world',BRETT:'based-brett'};
const PUBLIC_CRYPTO='https://api.coingecko.com/api/v3/simple/price';
const PUBLIC_NVDA='https://query1.finance.yahoo.com/v8/finance/chart/NVDA';
const publicHeaders={'Accept':'application/json','User-Agent':'ClashlingsMarketArena/0.1'};
const freshFrame=(frame,now)=>({...frame,prices:frame.prices.map((p,i)=>{
 if(p.status!=='live'||!Number.isFinite(p.publishTime))return p;
 const max=quoteMaxAgeMs(frame.source,TOKENS[i]?.asset);
 return now-p.publishTime*1000>max||p.publishTime*1000>now+5000?{...p,status:TOKENS[i]?.asset==='equity'?'closed-or-stale':'stale'}:p;
})});
const neutral=(reason,now,source='Public')=>({source,status:reason,asOf:now,prices:TOKENS.map(t=>({symbol:t.symbol,status:reason,price:null,publishTime:null,feedId:null}))});
export function parsePrice(row,expected,now=Date.now(),maxAge=45){
 const p=row?.price,id=String(row?.id||'').replace(/^0x/,'').toLowerCase();if(!p||id!==expected||!/^\d{1,30}$/.test(String(p.price))||!/^\d{1,30}$/.test(String(p.conf))||!Number.isInteger(p.expo)||p.expo< -18||p.expo>12)return null;
 const price=Number(p.price)*10**p.expo,confidence=Number(p.conf)*10**p.expo,publishTime=p.publish_time;
 if(!Number.isFinite(price)||price<=0||!Number.isFinite(confidence)||confidence<0||confidence/price>.02||!Number.isInteger(publishTime)||publishTime*1000>now+5000||now-publishTime*1000>maxAge*1000)return null;
 return {price,confidence,publishTime,feedId:id,status:'live'};
}
export function parsePublicQuote(price,publishTime,now=Date.now(),maxAgeMs=180000){
 const ts=Math.trunc(Number(publishTime));
 if(!Number.isFinite(price)||price<=0||!Number.isFinite(ts)||ts<=0)return null;
 if(ts*1000>now+5000||now-ts*1000>maxAgeMs)return null;
 return {price,publishTime:ts,status:'live'};
}
export async function getMarket(env,now=Date.now(),fetcher=fetch){
 if(env.MARKET_SOURCE==='off')return neutral('unconfigured',now);
 if(env.PYTH_API_KEY)return getPythMarket(env,now,fetcher);
 return getPublicMarket(env,now,fetcher);
}
async function getPythMarket(env,now,fetcher){
 const db=env.DB,key=env.PYTH_ENDPOINT||'https://pyth.dourolabs.app/hermes',cached=memory.get(key);if(cached&&now-cached.asOf<10000)return freshFrame(cached,now);
 if(flights.has(key))return flights.get(key);
 const work=(async()=>{
  const row=await db.prepare("SELECT * FROM market_cache WHERE cache_key='roster'").first();
  if(row&&now-row.updated_at<10000){const result=JSON.parse(row.payload);memory.set(key,result);return freshFrame(result,now);}
  await db.prepare("INSERT OR IGNORE INTO market_cache (cache_key,payload,updated_at,lease_until,feeds) VALUES ('roster','{}',0,0,'{}')").run();
  const lease=await db.prepare("UPDATE market_cache SET lease_until=? WHERE cache_key='roster' AND lease_until<?").bind(now+12000,now).run();
  if(!lease.meta.changes)return row?.payload&&row.payload!=='{}'?freshFrame(JSON.parse(row.payload),now):neutral('unavailable',now,'Pyth');
  try{
   const origin=new URL(key);if(origin.protocol!=='https:')throw new Error('HTTPS Pyth endpoint required');
   let feeds={...Object.fromEntries(TOKENS.filter(t=>t.feedId).map(t=>[t.feed,t.feedId])),...JSON.parse(row?.feeds||'{}')};
   if(env.PYTH_FEED_IDS){const overrides=JSON.parse(env.PYTH_FEED_IDS);for(const t of TOKENS){const id=overrides[t.symbol];if(id&&/^(0x)?[a-fA-F0-9]{64}$/.test(id))feeds[t.feed]=id.replace(/^0x/,'').toLowerCase();}}
   const headers={Authorization:'Bearer '+env.PYTH_API_KEY};
   if(TOKENS.some(t=>!feeds[t.feed])){
    const r=await fetcher(key+'/v2/price_feeds',{headers,signal:AbortSignal.timeout(4000)});if(!r.ok)throw new Error('Pyth catalog unavailable');const catalog=await r.json();
    if(!Array.isArray(catalog))throw new Error('Invalid Pyth catalog');for(const t of TOKENS){const matches=catalog.filter(f=>f.attributes?.symbol===t.feed&&/^(0x)?[a-fA-F0-9]{64}$/.test(f.id));if(matches.length===1)feeds[t.feed]=matches[0].id.replace(/^0x/,'').toLowerCase();}
   }
   const query=new URLSearchParams({parsed:'true'});for(const t of TOKENS)if(feeds[t.feed])query.append('ids[]',feeds[t.feed]);
   const r=await fetcher(key+'/v2/updates/price/latest?'+query,{headers,signal:AbortSignal.timeout(4000)});if(!r.ok)throw new Error('Pyth feed unavailable');const body=await r.json();if(!Array.isArray(body.parsed))throw new Error('Invalid Pyth prices');
   const prior=row?.payload&&row.payload!=='{}'?JSON.parse(row.payload):null;
   const prices=TOKENS.map((t,i)=>{const id=feeds[t.feed],raw=body.parsed.find(p=>String(p.id).replace(/^0x/,'').toLowerCase()===id),parsed=id?parsePrice(raw,id,now):null;
    if(!parsed||parsed.publishTime<(prior?.prices?.[i]?.publishTime||0))return {symbol:t.symbol,feedId:id||null,price:null,publishTime:null,status:t.asset==='equity'?'closed-or-stale':id?'stale':'unsupported'};
    return {symbol:t.symbol,...parsed};});
   const result={source:'Pyth',status:prices.some(p=>p.status==='live')?'live':'unavailable',asOf:now,prices};
   await db.prepare("UPDATE market_cache SET payload=?,updated_at=?,lease_until=0,feeds=? WHERE cache_key='roster'").bind(JSON.stringify(result),now,JSON.stringify(feeds)).run();memory.set(key,result);return result;
  }catch{await db.prepare("UPDATE market_cache SET lease_until=? WHERE cache_key='roster'").bind(now+10000).run();console.warn('Market refresh unavailable');return neutral('unavailable',now,'Pyth');}
 })();flights.set(key,work);try{return await work;}finally{flights.delete(key);}
}
async function getPublicMarket(env,now,fetcher){
 const db=env.DB,key='public-roster',cached=memory.get(key);if(cached&&now-cached.asOf<10000)return freshFrame(cached,now);
 if(flights.has(key))return flights.get(key);
 const work=(async()=>{
  const row=db?await db.prepare("SELECT * FROM market_cache WHERE cache_key='public-roster'").first():null;
  if(row&&now-row.updated_at<10000){const result=JSON.parse(row.payload);memory.set(key,result);return freshFrame(result,now);}
  if(db){
   await db.prepare("INSERT OR IGNORE INTO market_cache (cache_key,payload,updated_at,lease_until,feeds) VALUES ('public-roster','{}',0,0,'{}')").run();
   const lease=await db.prepare("UPDATE market_cache SET lease_until=? WHERE cache_key='public-roster' AND lease_until<?").bind(now+12000,now).run();
   if(!lease.meta.changes)return row?.payload&&row.payload!=='{}'?freshFrame(JSON.parse(row.payload),now):neutral('unavailable',now);
  }
  try{
   const ids=Object.values(COINGECKO_IDS).join(',');
   const cryptoUrl=PUBLIC_CRYPTO+'?ids='+encodeURIComponent(ids)+'&vs_currencies=usd&include_last_updated_at=true';
   const equityUrl=PUBLIC_NVDA+'?interval=1m&range=1d';
   const [cryptoRes,equityRes]=await Promise.all([
    fetcher(cryptoUrl,{headers:publicHeaders,signal:AbortSignal.timeout(4000)}),
    fetcher(equityUrl,{headers:publicHeaders,signal:AbortSignal.timeout(4000)}).catch(()=>null)
   ]);
   if(!cryptoRes?.ok)throw new Error('Public crypto feed unavailable');
   const crypto=await cryptoRes.json();
   if(!crypto||typeof crypto!=='object'||Array.isArray(crypto))throw new Error('Invalid public prices');
   let nvda=null;
   if(equityRes?.ok){
    try{const meta=(await equityRes.json())?.chart?.result?.[0]?.meta;nvda=parsePublicQuote(Number(meta?.regularMarketPrice),Number(meta?.regularMarketTime),now,quoteMaxAgeMs('Public','equity'));}catch{}
   }
   const prices=TOKENS.map(t=>{
    if(t.asset==='equity')return nvda?{symbol:t.symbol,feedId:'yahoo:NVDA',...nvda}:{symbol:t.symbol,feedId:null,price:null,publishTime:null,status:'closed-or-stale'};
    const id=COINGECKO_IDS[t.symbol],parsed=id?parsePublicQuote(Number(crypto[id]?.usd),Number(crypto[id]?.last_updated_at),now,quoteMaxAgeMs('Public','crypto')):null;
    if(!parsed)return {symbol:t.symbol,feedId:id?'coingecko:'+id:null,price:null,publishTime:null,status:id?'stale':'unsupported'};
    return {symbol:t.symbol,feedId:'coingecko:'+id,...parsed};
   });
   const result={source:'Public',status:prices.some(p=>p.status==='live')?'live':'unavailable',asOf:now,prices};
   if(db)await db.prepare("UPDATE market_cache SET payload=?,updated_at=?,lease_until=0,feeds='{}' WHERE cache_key='public-roster'").bind(JSON.stringify(result),now).run();
   memory.set(key,result);return result;
  }catch{if(db)await db.prepare("UPDATE market_cache SET lease_until=? WHERE cache_key='public-roster'").bind(now+10000).run();console.warn('Market refresh unavailable');return row?.payload&&row.payload!=='{}'?freshFrame(JSON.parse(row.payload),now):neutral('unavailable',now);}
 })();flights.set(key,work);try{return await work;}finally{flights.delete(key);}
}
