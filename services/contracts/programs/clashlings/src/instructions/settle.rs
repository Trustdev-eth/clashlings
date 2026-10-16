use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount, TransferChecked};

use crate::error::ArenaError;
use crate::state::{payout_amount, Config, Escrow, MatchEscrow, ESCROW_LOCKED, ESCROW_SETTLED};

#[derive(Accounts)]
#[instruction(match_hash: [u8; 32])]
pub struct Settle<'info> {
    #[account(mut)]
    pub settlement_authority: Signer<'info>,
    #[account(
        seeds = [b"config"],
        bump = config.bump,
        has_one = mint,
        has_one = vault,
        has_one = settlement_authority
    )]
    pub config: Account<'info, Config>,
    pub mint: Account<'info, Mint>,
    #[account(mut, seeds = [b"match", match_hash.as_ref()], bump = match_escrow.bump, has_one = mint)]
    pub match_escrow: Account<'info, MatchEscrow>,
    #[account(
        mut,
        seeds = [b"escrow", match_hash.as_ref(), &[0u8]],
        bump = escrow_0.bump,
        constraint = escrow_0.side == 0 @ ArenaError::InvalidSide
    )]
    pub escrow_0: Account<'info, Escrow>,
    #[account(
        mut,
        seeds = [b"escrow", match_hash.as_ref(), &[1u8]],
        bump = escrow_1.bump,
        constraint = escrow_1.side == 1 @ ArenaError::InvalidSide
    )]
    pub escrow_1: Account<'info, Escrow>,
    #[account(mut, address = config.vault, constraint = vault.mint == mint.key() @ ArenaError::WrongMint)]
    pub vault: Account<'info, TokenAccount>,
    /// CHECK: PDA signer for the vault.
    #[account(seeds = [b"vault"], bump = config.vault_bump)]
    pub vault_authority: UncheckedAccount<'info>,
    /// CHECK: original side-0 wallet recorded at deposit.
    #[account(address = match_escrow.owner_0)]
    pub wallet_0: UncheckedAccount<'info>,
    /// CHECK: original side-1 wallet recorded at deposit.
    #[account(address = match_escrow.owner_1)]
    pub wallet_1: UncheckedAccount<'info>,
    #[account(
        init_if_needed,
        payer = settlement_authority,
        associated_token::mint = mint,
        associated_token::authority = wallet_0
    )]
    pub ata_0: Account<'info, TokenAccount>,
    #[account(
        init_if_needed,
        payer = settlement_authority,
        associated_token::mint = mint,
        associated_token::authority = wallet_1
    )]
    pub ata_1: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn settle(ctx: Context<Settle>, _match_hash: [u8; 32], winner: i8) -> Result<()> {
    require!(winner == -1 || winner == 0 || winner == 1, ArenaError::InvalidWinner);
    require!(!ctx.accounts.match_escrow.settled, ArenaError::AlreadySettled);
    require!(!ctx.accounts.match_escrow.cancelled, ArenaError::MatchCancelled);
    require!(ctx.accounts.match_escrow.sides == 0b11, ArenaError::IncompleteEscrow);
    require!(ctx.accounts.escrow_0.status == ESCROW_LOCKED, ArenaError::EscrowRefunded);
    require!(ctx.accounts.escrow_1.status == ESCROW_LOCKED, ArenaError::EscrowRefunded);
    require!(ctx.accounts.escrow_0.amount == ctx.accounts.match_escrow.amount, ArenaError::EscrowAmountMismatch);
    require!(ctx.accounts.escrow_1.amount == ctx.accounts.match_escrow.amount, ArenaError::EscrowAmountMismatch);
    require!(ctx.accounts.escrow_0.owner == ctx.accounts.wallet_0.key(), ArenaError::WrongWallet);
    require!(ctx.accounts.escrow_1.owner == ctx.accounts.wallet_1.key(), ArenaError::WrongWallet);

    let stake = ctx.accounts.match_escrow.amount;
    let pay0 = payout_amount(winner, 0, stake)?;
    let pay1 = payout_amount(winner, 1, stake)?;
    let bump = [ctx.accounts.config.vault_bump];
    let signer_seeds: &[&[u8]] = &[b"vault", &bump];

    pay_out(&ctx, pay0, true, signer_seeds)?;
    pay_out(&ctx, pay1, false, signer_seeds)?;

    ctx.accounts.escrow_0.status = ESCROW_SETTLED;
    ctx.accounts.escrow_1.status = ESCROW_SETTLED;
    ctx.accounts.match_escrow.settled = true;
    Ok(())
}

fn pay_out(ctx: &Context<Settle>, amount: u64, side_zero: bool, signer_seeds: &[&[u8]]) -> Result<()> {
    if amount == 0 {
        return Ok(());
    }
    let destination = if side_zero {
        ctx.accounts.ata_0.to_account_info()
    } else {
        ctx.accounts.ata_1.to_account_info()
    };
    token::transfer_checked(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.vault.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                to: destination,
                authority: ctx.accounts.vault_authority.to_account_info(),
            },
            &[signer_seeds],
        ),
        amount,
        ctx.accounts.mint.decimals,
    )
}
