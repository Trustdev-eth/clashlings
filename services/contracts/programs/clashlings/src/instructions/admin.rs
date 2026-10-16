use anchor_lang::prelude::*;

use crate::error::ArenaError;
use crate::state::{Config, MIN_LOCK_SECONDS};

#[derive(Accounts)]
pub struct AdminConfig<'info> {
    pub authority: Signer<'info>,
    #[account(mut, seeds = [b"config"], bump = config.bump, has_one = authority)]
    pub config: Account<'info, Config>,
}

pub fn set_paused(ctx: Context<AdminConfig>, paused: bool) -> Result<()> {
    ctx.accounts.config.paused = paused;
    Ok(())
}

pub fn set_settlement_authority(ctx: Context<AdminConfig>, settlement_authority: Pubkey) -> Result<()> {
    require!(settlement_authority != Pubkey::default(), ArenaError::InvalidAuthority);
    ctx.accounts.config.settlement_authority = settlement_authority;
    Ok(())
}

pub fn set_lock_seconds(ctx: Context<AdminConfig>, lock_seconds: i64) -> Result<()> {
    require!(lock_seconds >= MIN_LOCK_SECONDS, ArenaError::LockTooShort);
    ctx.accounts.config.lock_seconds = lock_seconds;
    Ok(())
}
