use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, TransferChecked};

use crate::error::ArenaError;
use crate::state::{Config, StakePosition, CARD_COUNT, LOCK_SKEW_SECONDS, MAX_LEVEL, MIN_LEVEL};

#[derive(Accounts)]
#[instruction(intent_hash: [u8; 32])]
pub struct Stake<'info> {
    #[account(mut)]
    pub wallet: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump, has_one = mint, has_one = vault)]
    pub config: Account<'info, Config>,
    pub mint: Account<'info, Mint>,
    #[account(
        mut,
        constraint = user_ata.owner == wallet.key() @ ArenaError::WrongWallet,
        constraint = user_ata.mint == mint.key() @ ArenaError::WrongMint
    )]
    pub user_ata: Account<'info, TokenAccount>,
    #[account(mut, address = config.vault, constraint = vault.mint == mint.key() @ ArenaError::WrongMint)]
    pub vault: Account<'info, TokenAccount>,
    /// CHECK: PDA signer for the vault. Address is derived from fixed seeds.
    #[account(seeds = [b"vault"], bump = config.vault_bump)]
    pub vault_authority: UncheckedAccount<'info>,
    #[account(
        init,
        payer = wallet,
        space = 8 + StakePosition::INIT_SPACE,
        seeds = [b"stake", intent_hash.as_ref()],
        bump
    )]
    pub position: Account<'info, StakePosition>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn stake(
    ctx: Context<Stake>,
    intent_hash: [u8; 32],
    amount: u64,
    card: u8,
    target_level: u8,
) -> Result<()> {
    require!(!ctx.accounts.config.paused, ArenaError::Paused);
    require!(amount > 0, ArenaError::ZeroAmount);
    require!(card < CARD_COUNT, ArenaError::InvalidCard);
    require!(target_level >= MIN_LEVEL && target_level <= MAX_LEVEL, ArenaError::InvalidLevel);

    let now = Clock::get()?.unix_timestamp;
    let lock_until = now
        .checked_add(ctx.accounts.config.lock_seconds)
        .and_then(|t| t.checked_add(LOCK_SKEW_SECONDS))
        .ok_or(ArenaError::Overflow)?;

    token::transfer_checked(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.user_ata.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
                authority: ctx.accounts.wallet.to_account_info(),
            },
        ),
        amount,
        ctx.accounts.mint.decimals,
    )?;

    let position = &mut ctx.accounts.position;
    position.owner = ctx.accounts.wallet.key();
    position.mint = ctx.accounts.mint.key();
    position.amount = amount;
    position.card = card;
    position.target_level = target_level;
    position.lock_until = lock_until;
    position.withdrawn = false;
    position.bump = ctx.bumps.position;
    position.intent_hash = intent_hash;
    Ok(())
}
