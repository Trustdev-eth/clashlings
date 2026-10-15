export const SPIN_PRIZES=[{credits:10,weight:40},{credits:25,weight:30},{credits:50,weight:20},{credits:100,weight:8},{credits:250,weight:2}];
export const WIN_REWARDS=[{wins:5,credits:75},{wins:20,credits:300},{wins:100,credits:1500}];
export const utcDay=(now=Date.now())=>new Date(now).toISOString().slice(0,10);
export function spinPrize(randomInt){let n=randomInt??crypto.getRandomValues(new Uint32Array(1))[0];while(n>=4294967200)n=crypto.getRandomValues(new Uint32Array(1))[0];let choice=n%100;for(const prize of SPIN_PRIZES){if(choice<prize.weight)return prize.credits;choice-=prize.weight;}return 10;}
export async function rewardStatus(db,owner,now){const day=utcDay(now),rows=(await db.prepare('SELECT reward_key,amount FROM reward_claims WHERE player_id=? AND day=?').bind(owner,day).all()).results,wins=await db.prepare('SELECT wins FROM daily_wins WHERE player_id=? AND day=?').bind(owner,day).first();return {day,resetAt:Date.parse(day+'T00:00:00.000Z')+86400000,wins:wins?.wins||0,spin:{claimed:rows.some(r=>r.reward_key==='spin'),prizes:SPIN_PRIZES},milestones:WIN_REWARDS.map(r=>({...r,claimed:rows.some(c=>c.reward_key==='wins:'+r.wins)})),currency:'credits'};}
export async function claimReward(db,owner,kind,now){
 const day=utcDay(now),reward=kind==='spin'?null:WIN_REWARDS.find(r=>'wins:'+r.wins===kind);if(kind!=='spin'&&!reward)throw Object.assign(new Error('Choose a valid reward.'),{status:400});
 if(reward){const record=await db.prepare('SELECT wins FROM daily_wins WHERE player_id=? AND day=?').bind(owner,day).first();if((record?.wins||0)<reward.wins)throw Object.assign(new Error('Win more player battles to unlock this reward.'),{status:409});}
 const amount=reward?.credits??spinPrize(),id=owner+':reward:'+day+':'+kind;
 const changes=await db.batch([
  db.prepare('INSERT OR IGNORE INTO reward_claims (id,player_id,day,reward_key,amount,created_at) VALUES (?,?,?,?,?,?)').bind(id,owner,day,kind,amount,now),
  db.prepare('UPDATE players SET balance=balance+?,revision=revision+1 WHERE id=? AND changes()>0').bind(amount,owner),
  db.prepare("INSERT OR IGNORE INTO ledger (id,player_id,delta,kind,created_at) SELECT ?,?,?,'daily_reward',? WHERE changes()>0").bind(id,owner,amount,now)
 ]);
 const existing=await db.prepare('SELECT amount FROM reward_claims WHERE id=?').bind(id).first();return {credits:existing.amount,alreadyClaimed:!changes[0].meta.changes,...await rewardStatus(db,owner,now)};
}
