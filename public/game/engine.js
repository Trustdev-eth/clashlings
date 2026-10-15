import {TOKENS} from './tokens.js';
export const W=600,H=760,STEP=.1,ROUND=150,STARTING_CREDITS=1000;
export const UPGRADE_COSTS=[0,100,200,350,550];
const BASE_CARDS=[
 {id:0,name:'Emberfox',type:'Fire',role:'Splash fighter',cost:3,hp:540,dmg:86,speed:65,range:46,rate:.85,splash:48,color:'#ff985f',desc:'A quick flame-tailed fighter. Scorches nearby enemies with every attack.'},
 {id:1,name:'Voltkit',type:'Electric',role:'Ranged stunner',cost:3,hp:360,dmg:72,speed:57,range:135,rate:.9,airHit:true,stun:.25,color:'#f9cf42',desc:'Lightning bolts briefly stun their target. Can attack flying creatures.'},
 {id:2,name:'Mossback',type:'Nature',role:'Armored tank',cost:4,hp:1450,dmg:95,speed:32,range:45,rate:1.25,color:'#9fce78',desc:'A sturdy garden guardian. Soaks up damage while your ranged creatures fire.'},
 {id:3,name:'Frostfin',type:'Ice',role:'Slow specialist',cost:3,hp:510,dmg:60,speed:45,range:120,rate:1,slow:1.8,airHit:true,color:'#8fd3ef',desc:'Frost projectiles slow targets for 1.8 seconds. Excellent on defense.'},
 {id:4,name:'Nightwing',type:'Shadow',role:'Flying swarm',cost:2,hp:140,dmg:31,speed:86,range:40,rate:.6,air:true,count:3,airHit:true,color:'#b09de6',desc:'Deploys three quick bats. They fly over the river and overwhelm lone targets.'},
 {id:5,name:'Pebblebeast',type:'Earth',role:'Tower breaker',cost:5,hp:1900,dmg:168,speed:28,range:45,rate:1.35,siege:true,color:'#a9b5a7',desc:'A crystal golem that ignores creatures and heads straight for enemy towers.'},
 {id:6,name:'Bloomimp',type:'Nature',role:'Team healer',cost:3,hp:410,dmg:32,speed:41,range:110,rate:1.1,heal:45,color:'#dfb5c8',desc:'Heals nearby allies while sending sprout bolts at enemies.'},
 {id:7,name:'Wavewyrm',type:'Water',role:'Flying artillery',cost:5,hp:890,dmg:104,speed:42,range:136,rate:1.25,splash:56,air:true,airHit:true,color:'#83d5cc',desc:'A flying water dragon. Splash attacks punish tightly packed defenders.'},
 {id:8,name:'Ironhorn',type:'Metal',role:'Charging bruiser',cost:4,hp:1060,dmg:116,speed:55,range:44,rate:1.05,charge:true,color:'#bdc6d8',desc:'An armored rhinoceros. Its first attack deals double damage.'},
 {id:9,name:'Glimmer',type:'Light',role:'Flying support',cost:2,hp:230,dmg:38,speed:61,range:118,rate:.75,air:true,airHit:true,heal:18,color:'#f5e6ae',desc:'A luminous moth. Flies above the field, healing allies and firing light.'},
 {id:10,name:'Fizzblob',type:'Water',role:'Splitting slime',cost:2,hp:520,dmg:49,speed:46,range:44,rate:.85,split:true,color:'#94dbcd',desc:'A bouncy slime that splits into two smaller slimes when defeated.'},
 {id:11,name:'Stormtalon',type:'Electric',role:'Aerial hunter',cost:4,hp:640,dmg:90,speed:78,range:122,rate:.8,air:true,airHit:true,color:'#a3bee3',desc:'A lightning hawk with fast ranged attacks. Hunts ground and air targets.'}
];
export const CARDS=BASE_CARDS.map((c,i)=>({...c,name:TOKENS[i].name,symbol:TOKENS[i].symbol,color:TOKENS[i].color,desc:TOKENS[i].identity+' '+c.desc,type:i===0?'Metal':c.type}));
export const DEFAULT_DECK=[0,1,2,3,4,5,7,10],BOT_DECK=[0,1,2,4,6,7,8,11];
export const validDeck=d=>Array.isArray(d)&&d.length===8&&new Set(d).size===8&&d.every(i=>Number.isInteger(i)&&CARDS[i]);
export const stats=(id,level=1)=>{const c=CARDS[id],m=1+(Math.max(1,Math.min(5,level))-1)*.1;return {...c,hp:Math.round(c.hp*m),dmg:Math.round(c.dmg*m),heal:c.heal?Math.round(c.heal*m):0};};
export function random(g){let x=g.seed|0;x^=x<<13;x^=x>>>17;x^=x<<5;g.seed=x>>>0;return g.seed/4294967296;}
export function newGame({names=['Trainer','Sage Bot'],decks=[DEFAULT_DECK,BOT_DECK],levels=[Array(12).fill(1),Array(12).fill(1)],seed=91241}={}){
 if(!decks.every(validDeck))throw new Error('Choose eight different creatures.');
 const towers=[];for(let p=0;p<2;p++)for(let k=0;k<3;k++)towers.push({id:`t${p}${k}`,p,x:k===2?300:k===0?135:465,y:p===0?(k===2?686:589):(k===2?74:171),hp:k===2?3000:2000,maxHp:k===2?3000:2000,king:k===2,cd:0,range:k===2?152:166});
 return {seed:seed||1,names,levels,time:0,status:'playing',winner:null,elixir:[5,5],decks,hand:decks.map(d=>d.slice(0,4)),queue:decks.map(d=>d.slice(4)),towers,units:[],effects:[],score:[0,0],nextId:1,botClock:2,fxSeq:0};
}
export function deploymentZones(g,p){
 const own=p===0?{x:38,y:412,w:524,h:222}:{x:38,y:126,w:524,h:222};
 const zones=[own];
 for(const tower of g.towers||[]){if(tower.p===p||tower.king||tower.hp>0)continue;const left=tower.x<300;zones.push({x:left?38:306,y:p===0?210:412,w:256,h:138,lane:left?'left':'right'});}
 return zones;
}
export function canDeployAt(g,p,x,y){return Number.isFinite(x)&&Number.isFinite(y)&&deploymentZones(g,p).some(z=>x>=z.x&&x<=z.x+z.w&&y>=z.y&&y<=z.y+z.h);}
export function deploy(g,p,slot,x,y){
 if(g.status!=='playing')return {ok:false,error:'The battle has ended.'};
 if((p!==0&&p!==1)||!Number.isInteger(slot)||slot<0||slot>3||!Number.isFinite(x)||!Number.isFinite(y))return {ok:false,error:'Invalid deployment.'};
 if(!canDeployAt(g,p,x,y))return {ok:false,error:'Deploy in your blue area. Destroy a rival side tower to unlock that lane.'};
 const c=stats(g.hand[p][slot],g.levels[p][g.hand[p][slot]]);
 if(g.elixir[p]+1e-7<c.cost)return {ok:false,error:'Need more elixir.'};
 if(g.units.length>110)return {ok:false,error:'Arena is full.'};
 g.elixir[p]-=c.cost;for(let k=0;k<(c.count||1);k++)spawn(g,c,p,x+(k-((c.count||1)-1)/2)*18,y+k*5);
 const old=g.hand[p][slot];g.hand[p][slot]=g.queue[p].shift();g.queue[p].push(old);effect(g,{kind:'spawn',x,y,p,ttl:.65,color:c.color});return {ok:true};
}
function effect(g,data){g.fxSeq=(g.fxSeq||0)+1;g.effects.push({...data,id:g.fxSeq});}
function spawn(g,c,p,x,y,baby=false){const hp=baby?Math.round(c.hp*.35):c.hp;g.units.push({id:g.nextId++,card:c.id,p,x,y,hp,maxHp:hp,cd:.3,slow:0,stun:0,charged:!!c.charge,baby,healCd:.5,age:0});}
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
function move(u,x,y,s){const d=Math.hypot(x-u.x,y-u.y);if(d>.01){u.action='move';u.facingX=x-u.x;u.facingY=y-u.y;u.x+=(x-u.x)/d*Math.min(s,d);u.y+=(y-u.y)/d*Math.min(s,d);}}
function damage(g,u,target,c,mult=1){const hit=t=>{t.hp-=c.dmg*mult*(g.market?.multipliers?.[u.card]??1)*(u.baby?.48:1);if('card'in t){t.slow=Math.max(t.slow,c.slow||0);t.stun=Math.max(t.stun,c.stun||0);}};hit(target);if(c.splash)for(const t of g.units)if(t.p!==u.p&&t.id!==target.id&&t.hp>0&&dist(t,target)<c.splash&&(c.airHit||!CARDS[t.card].air))hit(t);effect(g,{kind:c.range>80?'bolt':'hit',attacker:u.id,victim:target.id,card:u.card,type:c.type,power:c.dmg*mult*(g.market?.multipliers?.[u.card]??1)*(u.baby?.48:1),splash:c.splash||0,attackerAir:!!c.air,targetAir:'card' in target&&!!CARDS[target.card].air,x:u.x,y:u.y,tx:target.x,ty:target.y,p:u.p,color:c.color,ttl:.65});}
export function step(g,dt=STEP){
 if(g.status!=='playing')return;g.time+=dt;const rate=g.time>=ROUND-40?.85:.43;for(let p=0;p<2;p++)g.elixir[p]=Math.min(10,g.elixir[p]+dt*rate);g.effects=g.effects.filter(e=>(e.ttl-=dt)>0).slice(-120);
 for(const u of g.units){if(u.hp<=0)continue;const c=stats(u.card,g.levels[u.p][u.card]);u.action='idle';u.age+=dt;u.cd-=dt;u.healCd-=dt;u.slow=Math.max(0,u.slow-dt);u.stun=Math.max(0,u.stun-dt);
  if(c.heal&&u.healCd<=0){for(const a of g.units)if(a.p===u.p&&a.hp>0&&dist(u,a)<100){const before=a.hp;a.hp=Math.min(a.maxHp,a.hp+c.heal);if(a.hp>before)effect(g,{kind:'heal',x:a.x,y:a.y,p:u.p,color:'#80ddb3',ttl:.6});}u.healCd=c.rate;}if(u.stun>0)continue;
  let target=null,best=Infinity;if(!c.siege)for(const v of g.units){if(v.hp<=0||v.p===u.p||(!c.airHit&&CARDS[v.card].air))continue;const d=dist(u,v);if(d<best&&d<170){best=d;target=v;}}
  if(!target)for(const t of g.towers){if(t.p===u.p||t.hp<=0)continue;const d=dist(u,t);if(d<best){best=d;target=t;}}if(!target)continue;
  if(best<=c.range+('king'in target?26:12)){u.action='attack';u.facingX=target.x-u.x;u.facingY=target.y-u.y;if(u.cd<=0){damage(g,u,target,c,u.charged?2:1);u.charged=false;u.cd=c.rate;}}
  else {const speed=c.speed*dt*(u.slow>0?.55:1)*(u.charged?1.2:1);let tx=target.x,ty=target.y;if(!c.air&&((u.y>402&&target.y<358)||(u.y<358&&target.y>402)||(u.y>=358&&u.y<=402))){tx=u.x<300?135:465;ty=u.p===0?338:422;}move(u,tx,ty,speed);}
 }
 for(const t of g.towers){if(t.hp<=0)continue;t.cd-=dt;if(t.cd>0)continue;let target=null,near=t.range;for(const u of g.units){if(u.p===t.p||u.hp<=0)continue;const d=dist(t,u);if(d<near){near=d;target=u;}}if(target){target.hp-=t.king?72:58;t.cd=.8;effect(g,{kind:'bolt',attacker:t.id,victim:target.id,power:t.king?72:58,type:'Electric',targetAir:!!CARDS[target.card].air,x:t.x,y:t.y,tx:target.x,ty:target.y,color:t.p===0?'#469eff':'#f17868',ttl:.65});}}
 const dead=g.units.filter(u=>u.hp<=0);g.units=g.units.filter(u=>u.hp>0);for(const u of dead){const c=stats(u.card,g.levels[u.p][u.card]);effect(g,{kind:'poof',victim:u.id,x:u.x,y:u.y,p:u.p,color:c.color,ttl:.6});if(c.split&&!u.baby){spawn(g,c,u.p,u.x-13,u.y,true);spawn(g,c,u.p,u.x+13,u.y,true);}}
 for(let p=0;p<2;p++)g.score[p]=g.towers.filter(t=>t.p!==p&&t.hp<=0).length;const kings=g.towers.filter(t=>t.king&&t.hp<=0);if(kings.length){g.status='ended';g.winner=kings.length===2?-1:1-kings[0].p;}
 if(g.time+1e-8>=ROUND&&g.status==='playing'){g.status='ended';if(g.score[0]!==g.score[1])g.winner=g.score[0]>g.score[1]?0:1;else{const hp=[0,0];for(const t of g.towers)hp[t.p]+=Math.max(0,t.hp);g.winner=hp[0]===hp[1]?-1:hp[0]>hp[1]?0:1;}}
}
export function advance(g,seconds){const n=Math.max(0,Math.min(1600,Math.floor(seconds/STEP+1e-6)));for(let i=0;i<n;i++)step(g);return n*STEP;}
export function bot(g,p=1,difficulty='normal',dt=STEP){g.botClock-=dt;if(g.botClock>0||g.status!=='playing')return;g.botClock=difficulty==='easy'?2.8:1.3;const a=g.hand[p].map((id,slot)=>({c:CARDS[id],slot})).filter(x=>x.c.cost<=g.elixir[p]);if(!a.length)return;let pick=a[Math.floor(random(g)*a.length)],x=random(g)<.5?135:465,y=p===1?230:530;const enemies=g.units.filter(u=>u.p!==p&&(p===1?u.y<320:u.y>440));if(enemies.length&&difficulty!=='easy'){const v=enemies[0];x=Math.min(550,Math.max(50,v.x+30));y=p===1?Math.min(325,Math.max(140,v.y-55)):Math.min(620,Math.max(425,v.y+55));pick=a.find(z=>CARDS[v.card].air?z.c.airHit:z.c.splash)||pick;}deploy(g,p,pick.slot,x,y);}
