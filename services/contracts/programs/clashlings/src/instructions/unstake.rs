use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount, TransferChecked};

use crate::error::ArenaError;
use crate::state::{Config, StakePosition};

#[derive(Accounts)]
pub struct Unstake<'info> {
    #[account(mut)]
    pub wallet: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump, has_one = mint, has_one = vault)]
    pub config: Account<'info, Config>,
    pub mint: Account<'info, Mint>,
    #[account(
        init_if_needed,
        payer = wallet,
        associated_token::mint = mint,
        associated_token::authority = wallet
    )]
    pub user_ata: Account<'info, TokenAccount>,
    #[account(mut, address = config.vault, constraint = vault.mint == mint.key() @ ArenaError::WrongMint)]
    pub vault: Account<'info, TokenAccount>,
    /// CHECK: PDA signer for the vault.
    #[account(seeds = [b"vault"], bump = config.vault_bump)]
    pub vault_authority: UncheckedAccount<'info>,
    #[account(
        mut,
        seeds = [b"stake", position.intent_hash.as_ref()],
        bump = position.bump,
        has_one = mint
    )]
    pub position: Account<'info, StakePosition>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn unstake(ctx: Context<Unstake>) -> Result<()> {
    require!(ctx.accounts.wallet.key() == ctx.accounts.position.owner, ArenaError::WrongWallet);
    require!(!ctx.accounts.position.withdrawn, ArenaError::AlreadyWithdrawn);
    require!(Clock::get()?.unix_timestamp >= ctx.accounts.position.lock_until, ArenaError::StillLocked);

    let amount = ctx.accounts.position.amount;
    let bump = [ctx.accounts.config.vault_bump];
    let signer_seeds: &[&[u8]] = &[b"vault", &bump];

    token::transfer_checked(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.vault.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.user_ata.to_account_info(),
                authority: ctx.accounts.vault_authority.to_account_info(),
            },
            &[signer_seeds],
        ),
        amount,
        ctx.accounts.mint.decimals,
    )?;

    ctx.accounts.position.withdrawn = true;
    Ok(())
}
