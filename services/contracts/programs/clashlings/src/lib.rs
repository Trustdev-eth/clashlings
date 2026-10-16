//! Clashlings arena staking and match-escrow program.
//!
//! Tokens never leave the program vault except as:
//! - the original staker's withdrawal after `lock_until`
//! - a depositor refund of an incomplete or cancelled match
//! - settlement paid by `settlement_authority` (2× / 0 / 1× draw)
//!
//! Match winners are not computed on-chain. The settlement key is trusted.

use anchor_lang::prelude::*;

pub mod error;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("95knjFtSkTZS6vj7aJgFa5Ty8ArDKZmSnwfGyqAhLZom");

#[program]
pub mod clashlings {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, settlement_authority: Pubkey, lock_seconds: i64) -> Result<()> {
        instructions::initialize::initialize(ctx, settlement_authority, lock_seconds)
    }

    pub fn set_paused(ctx: Context<AdminConfig>, paused: bool) -> Result<()> {
        instructions::admin::set_paused(ctx, paused)
    }

    pub fn set_settlement_authority(ctx: Context<AdminConfig>, settlement_authority: Pubkey) -> Result<()> {
        instructions::admin::set_settlement_authority(ctx, settlement_authority)
    }

    pub fn set_lock_seconds(ctx: Context<AdminConfig>, lock_seconds: i64) -> Result<()> {
        instructions::admin::set_lock_seconds(ctx, lock_seconds)
    }

    pub fn stake(ctx: Context<Stake>, intent_hash: [u8; 32], amount: u64, card: u8, target_level: u8) -> Result<()> {
        instructions::stake::stake(ctx, intent_hash, amount, card, target_level)
    }

    pub fn unstake(ctx: Context<Unstake>) -> Result<()> {
        instructions::unstake::unstake(ctx)
    }

    pub fn deposit_escrow(ctx: Context<DepositEscrow>, match_hash: [u8; 32], side: u8, amount: u64) -> Result<()> {
        instructions::escrow::deposit_escrow(ctx, match_hash, side, amount)
    }

    pub fn refund_escrow(ctx: Context<RefundEscrow>, match_hash: [u8; 32], side: u8) -> Result<()> {
        instructions::refund::refund_escrow(ctx, match_hash, side)
    }

    pub fn settle(ctx: Context<Settle>, match_hash: [u8; 32], winner: i8) -> Result<()> {
        instructions::settle::settle(ctx, match_hash, winner)
    }

    pub fn cancel_match(ctx: Context<CancelMatch>, match_hash: [u8; 32]) -> Result<()> {
        instructions::cancel::cancel_match(ctx, match_hash)
    }
}
