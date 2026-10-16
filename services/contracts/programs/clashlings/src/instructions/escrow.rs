use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, TransferChecked};

use crate::error::ArenaError;
use crate::state::{Config, Escrow, MatchEscrow, ESCROW_LOCKED};

#[derive(Accounts)]
#[instruction(match_hash: [u8; 32], side: u8)]
pub struct DepositEscrow<'info> {
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
    /// CHECK: PDA signer for the vault.
    #[account(seeds = [b"vault"], bump = config.vault_bump)]
    pub vault_authority: UncheckedAccount<'info>,
    #[account(
        init_if_needed,
        payer = wallet,
        space = 8 + MatchEscrow::INIT_SPACE,
        seeds = [b"match", match_hash.as_ref()],
        bump
    )]
    pub match_escrow: Account<'info, MatchEscrow>,
    #[account(
        init,
        payer = wallet,
        space = 8 + Escrow::INIT_SPACE,
        seeds = [b"escrow", match_hash.as_ref(), &[side]],
        bump
    )]
    pub escrow: Account<'info, Escrow>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn deposit_escrow(ctx: Context<DepositEscrow>, match_hash: [u8; 32], side: u8, amount: u64) -> Result<()> {
    require!(!ctx.accounts.config.paused, ArenaError::Paused);
    require!(amount > 0, ArenaError::ZeroAmount);
    require!(side <= 1, ArenaError::InvalidSide);

    let match_escrow = &mut ctx.accounts.match_escrow;
    if match_escrow.sides == 0 {
        match_escrow.mint = ctx.accounts.mint.key();
        match_escrow.amount = amount;
        match_escrow.settled = false;
        match_escrow.cancelled = false;
        match_escrow.bump = ctx.bumps.match_escrow;
    }
    require!(match_escrow.mint == ctx.accounts.mint.key(), ArenaError::WrongMint);
    require!(match_escrow.amount == amount, ArenaError::EscrowAmountMismatch);
    require!(!match_escrow.settled, ArenaError::AlreadySettled);
    require!(!match_escrow.cancelled, ArenaError::MatchCancelled);
    require!(match_escrow.sides & (1 << side) == 0, ArenaError::EscrowFilled);

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

    if side == 0 {
        match_escrow.owner_0 = ctx.accounts.wallet.key();
    } else {
        match_escrow.owner_1 = ctx.accounts.wallet.key();
    }
    match_escrow.sides |= 1 << side;

    let escrow = &mut ctx.accounts.escrow;
    escrow.owner = ctx.accounts.wallet.key();
    escrow.mint = ctx.accounts.mint.key();
    escrow.match_hash = match_hash;
    escrow.side = side;
    escrow.amount = amount;
    escrow.status = ESCROW_LOCKED;
    escrow.bump = ctx.bumps.escrow;
    Ok(())
}
