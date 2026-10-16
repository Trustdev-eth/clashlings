use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{Mint, Token, TokenAccount};

use crate::error::ArenaError;
use crate::state::{Config, MIN_LOCK_SECONDS};

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    /// CHECK: PDA signer for the token vault. Seeds are fixed.
    #[account(seeds = [b"vault"], bump)]
    pub vault_authority: UncheckedAccount<'info>,
    pub mint: Account<'info, Mint>,
    #[account(
        init,
        payer = authority,
        associated_token::mint = mint,
        associated_token::authority = vault_authority
    )]
    pub vault: Account<'info, TokenAccount>,
    #[account(init, payer = authority, space = 8 + Config::INIT_SPACE, seeds = [b"config"], bump)]
    pub config: Account<'info, Config>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn initialize(
    ctx: Context<Initialize>,
    settlement_authority: Pubkey,
    lock_seconds: i64,
) -> Result<()> {
    require!(lock_seconds >= MIN_LOCK_SECONDS, ArenaError::LockTooShort);
    require!(settlement_authority != Pubkey::default(), ArenaError::InvalidAuthority);
    let config = &mut ctx.accounts.config;
    config.authority = ctx.accounts.authority.key();
    config.settlement_authority = settlement_authority;
    config.mint = ctx.accounts.mint.key();
    config.vault = ctx.accounts.vault.key();
    config.lock_seconds = lock_seconds;
    config.paused = false;
    config.bump = ctx.bumps.config;
    config.vault_bump = ctx.bumps.vault_authority;
    Ok(())
}
