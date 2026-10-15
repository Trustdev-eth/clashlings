// Stable card IDs preserve existing decks; price references are not asset custody.
export const TOKENS = [
 {symbol:'BTC',name:'Bitwarden',feed:'Crypto.BTC/USD',asset:'crypto',color:'#f4ae38',baseStake:300,identity:'A gold-armored bull. Scarcity, strength, and a coin-forged shield.',feedId:'e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43'},
 {symbol:'SOL',name:'Solstrider',feed:'Crypto.SOL/USD',asset:'crypto',color:'#59e6c4',baseStake:220,identity:'A neon fox with three luminous tail fins. Fast, agile electric attacks.',feedId:'ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d'},
 {symbol:'ETH',name:'Etherion',feed:'Crypto.ETH/USD',asset:'crypto',color:'#a29cff',baseStake:320,identity:'A crystal tortoise carrying an ether-diamond shell. Resilient team defense.',feedId:'ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace'},
 {symbol:'XRP',name:'Ripplefin',feed:'Crypto.XRP/USD',asset:'crypto',color:'#80d7f8',baseStake:180,identity:'A blue penguin whose ripple crest sends slowing waves across the field.'},
 {symbol:'BONK',name:'Bonkpack',feed:'Crypto.BONK/USD',asset:'crypto',color:'#f1ab5f',baseStake:100,identity:'Three playful Shiba gliders. A fast, cheeky airborne ambush.'},
 {symbol:'NVDA',name:'Tensorforge',feed:'Equity.US.NVDA/USD',asset:'equity',color:'#8add56',baseStake:500,identity:'An emerald chip golem with luminous circuits. Heavy tower-breaking compute.'},
 {symbol:'PEPE',name:'Pepesage',feed:'Crypto.PEPE/USD',asset:'crypto',color:'#90d77a',baseStake:180,identity:'A friendly frog sage with a lily-pad staff. Restores nearby allies.'},
 {symbol:'DOGE',name:'Dogewyrm',feed:'Crypto.DOGE/USD',asset:'crypto',color:'#ecc77a',baseStake:420,identity:'A smiling golden Shiba dragon. Sends wide cloud-breath blasts.'},
 {symbol:'WIF',name:'Hatguard',feed:'Crypto.WIF/USD',asset:'crypto',color:'#e3a2ba',baseStake:280,identity:'A beanie-wearing Shiba bruiser. Leads with an armored charging strike.'},
 {symbol:'POPCAT',name:'Popwing',feed:'Crypto.POPCAT/USD',asset:'crypto',color:'#89dddc',baseStake:140,identity:'A wide-mouthed cat moth with patterned wings and supporting light bursts.'},
 {symbol:'MEW',name:'Mewdrop',feed:'Crypto.MEW/USD',asset:'crypto',color:'#d0f0e4',baseStake:120,identity:'A glossy cat slime with pink ears. Splits into two smaller companions.'},
 {symbol:'BRETT',name:'Brettbolt',feed:'Crypto.BRETT/USD',asset:'crypto',color:'#6ba5f4',baseStake:360,identity:'A grinning blue punk hawk with lightning feathers. A relentless aerial hunter.'}
];
export const MARKET_INTERVAL=5, MARKET_SENSITIVITY=200, MIN_DAMAGE_MULT=.85, MAX_DAMAGE_MULT=1.15;
export const quoteMaxAgeMs=(source,asset)=>asset==='equity'?900000:source==='Pyth'?45000:180000;
export const LEVEL_STAKE_FACTORS=[0,0,1,3,7,15];
export const stakeRequirement=(card,level)=>TOKENS[card]&&Number.isInteger(level)&&level>=1&&level<=5?TOKENS[card].baseStake*LEVEL_STAKE_FACTORS[level]:null;
export function damageMultiplier(start,current){if(!Number.isFinite(start)||start<=0||!Number.isFinite(current)||current<=0)return 1;return Math.max(MIN_DAMAGE_MULT,Math.min(MAX_DAMAGE_MULT,1+((current-start)/start)*MARKET_SENSITIVITY));}
export function marketBaseline(frame,now=Date.now()){
 const rows=TOKENS.map((_,id)=>frame?.prices?.[id]?.status==='live'?frame.prices[id]:null);
 return {startedAt:now,baseline:rows.map(p=>p?{price:p.price,publishTime:p.publishTime,feedId:p.feedId}:null),multipliers:TOKENS.map(()=>1),status:rows.map(p=>p?'live':'no-baseline'),current:rows,sequence:0,nextUpdate:MARKET_INTERVAL,history:[],source:frame?.source||'Public'};
}
export function updateMarket(g,frame,at=g.time){
 if(!g.market)return false;const m=g.market;if(at+1e-6<m.nextUpdate)return false;
 const boundary=m.nextUpdate,wall=m.startedAt+boundary*1000;
 m.multipliers=TOKENS.map((_,i)=>{const p=frame?.prices?.[i],base=m.baseline[i],previous=m.current?.[i];if(!base){m.status[i]='no-baseline';return 1;}if(!p||p.status!=='live'||p.publishTime*1000>wall+5000||wall-p.publishTime*1000>quoteMaxAgeMs(m.source,TOKENS[i].asset)||p.publishTime<(previous?.publishTime||base.publishTime)){m.status[i]='stale';return 1;}m.status[i]='live';return damageMultiplier(base.price,p.price);});
 m.current=TOKENS.map((_,i)=>m.status[i]==='live'?frame.prices[i]:m.current?.[i]||null);m.sequence++;m.history.push({at:boundary,multipliers:[...m.multipliers],status:[...m.status],prices:m.current.map(p=>p?{price:p.price,publishTime:p.publishTime,feedId:p.feedId}:null)});m.history=m.history.slice(-8);m.nextUpdate+=MARKET_INTERVAL;return true;
}
