use anchor_lang::prelude::*;

use crate::error::ArenaError;
use crate::state::MatchEscrow;

#[derive(Accounts)]
#[instruction(match_hash: [u8; 32])]
pub struct CancelMatch<'info> {
    pub settlement_authority: Signer<'info>,
    #[account(
        seeds = [b"config"],
        bump = config.bump,
        has_one = settlement_authority
    )]
    pub config: Account<'info, crate::state::Config>,
    #[account(mut, seeds = [b"match", match_hash.as_ref()], bump = match_escrow.bump)]
    pub match_escrow: Account<'info, MatchEscrow>,
}

pub fn cancel_match(ctx: Context<CancelMatch>, _match_hash: [u8; 32]) -> Result<()> {
    require!(!ctx.accounts.match_escrow.settled, ArenaError::AlreadySettled);
    ctx.accounts.match_escrow.cancelled = true;
    Ok(())
}
