export async function rewardStatus(db,owner){
 const p=await db.prepare('SELECT token_earned,wins,losses FROM players WHERE id=?').bind(owner).first();
 const entries=(await db.prepare("SELECT delta,kind,match_id,created_at FROM ledger WHERE player_id=? AND kind IN ('token_win','token_draw') ORDER BY created_at DESC,rowid DESC LIMIT 20").bind(owner).all()).results;
 return {currency:'GAME',tokenEarned:p?.token_earned||0,wins:p?.wins||0,losses:p?.losses||0,entries};
}
