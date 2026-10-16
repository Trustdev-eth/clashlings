use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount, TransferChecked};

use crate::error::ArenaError;
use crate::state::{refund_allowed, Config, Escrow, MatchEscrow, ESCROW_LOCKED, ESCROW_REFUNDED};

#[derive(Accounts)]
#[instruction(match_hash: [u8; 32], side: u8)]
pub struct RefundEscrow<'info> {
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
    #[account(mut, seeds = [b"match", match_hash.as_ref()], bump = match_escrow.bump)]
    pub match_escrow: Account<'info, MatchEscrow>,
    #[account(
        mut,
        seeds = [b"escrow", match_hash.as_ref(), &[side]],
        bump = escrow.bump,
        has_one = mint
    )]
    pub escrow: Account<'info, Escrow>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn refund_escrow(ctx: Context<RefundEscrow>, _match_hash: [u8; 32], side: u8) -> Result<()> {
    require!(side <= 1, ArenaError::InvalidSide);
    require!(ctx.accounts.wallet.key() == ctx.accounts.escrow.owner, ArenaError::WrongWallet);
    require!(ctx.accounts.escrow.side == side, ArenaError::InvalidSide);
    require!(ctx.accounts.escrow.status == ESCROW_LOCKED, ArenaError::EscrowNotLocked);
    require!(!ctx.accounts.match_escrow.settled, ArenaError::AlreadySettled);
    require!(
        refund_allowed(
            ctx.accounts.match_escrow.sides,
            ctx.accounts.match_escrow.cancelled,
            ctx.accounts.match_escrow.settled
        ),
        ArenaError::RefundNotAllowed
    );

    let amount = ctx.accounts.escrow.amount;
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

    ctx.accounts.escrow.status = ESCROW_REFUNDED;
    Ok(())
}
