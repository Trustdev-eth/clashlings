use anchor_lang::prelude::*;

pub const CARD_COUNT: u8 = 12;
pub const MIN_LEVEL: u8 = 2;
pub const MAX_LEVEL: u8 = 5;
pub const MIN_LOCK_SECONDS: i64 = 86_400;
/// Extra seconds added to each new lock so game-side millisecond checks still pass
/// when Solana block time is slightly behind the adapter clock (15s verify skew).
pub const LOCK_SKEW_SECONDS: i64 = 60;
pub const ESCROW_LOCKED: u8 = 0;
pub const ESCROW_REFUNDED: u8 = 1;
pub const ESCROW_SETTLED: u8 = 2;

#[account]
#[derive(InitSpace)]
pub struct Config {
    pub authority: Pubkey,
    pub settlement_authority: Pubkey,
    pub mint: Pubkey,
    pub vault: Pubkey,
    pub lock_seconds: i64,
    pub paused: bool,
    pub bump: u8,
    pub vault_bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct StakePosition {
    pub owner: Pubkey,
    pub mint: Pubkey,
    pub amount: u64,
    pub card: u8,
    pub target_level: u8,
    pub lock_until: i64,
    pub withdrawn: bool,
    pub bump: u8,
    pub intent_hash: [u8; 32],
}

#[account]
#[derive(InitSpace)]
pub struct Escrow {
    pub owner: Pubkey,
    pub mint: Pubkey,
    pub match_hash: [u8; 32],
    pub side: u8,
    pub amount: u64,
    pub status: u8,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct MatchEscrow {
    pub mint: Pubkey,
    pub amount: u64,
    pub owner_0: Pubkey,
    pub owner_1: Pubkey,
    pub sides: u8,
    pub settled: bool,
    pub cancelled: bool,
    pub bump: u8,
}

pub fn payout_amount(winner: i8, side: u8, stake: u64) -> Result<u64> {
    require!(winner == -1 || winner == 0 || winner == 1, crate::error::ArenaError::InvalidWinner);
    require!(side <= 1, crate::error::ArenaError::InvalidSide);
    if winner == -1 {
        return Ok(stake);
    }
    if winner as u8 == side {
        return stake.checked_mul(2).ok_or(error!(crate::error::ArenaError::Overflow));
    }
    Ok(0)
}

/// Fully locked matches can be refunded only after the settlement authority cancels them.
/// Incomplete deposits (one side) may always walk away.
pub fn refund_allowed(sides: u8, cancelled: bool, settled: bool) -> bool {
    !settled && (sides != 0b11 || cancelled)
}

#[cfg(test)]
mod tests {
    use super::payout_amount;

    #[test]
    fn winner_takes_the_pot() {
        assert_eq!(payout_amount(0, 0, 25).unwrap(), 50);
        assert_eq!(payout_amount(0, 1, 25).unwrap(), 0);
        assert_eq!(payout_amount(1, 1, 100).unwrap(), 200);
        assert_eq!(payout_amount(1, 0, 100).unwrap(), 0);
    }

    #[test]
    fn draw_returns_each_entry() {
        assert_eq!(payout_amount(-1, 0, 50).unwrap(), 50);
        assert_eq!(payout_amount(-1, 1, 50).unwrap(), 50);
    }

    #[test]
    fn rejects_invalid_winner() {
        assert!(payout_amount(2, 0, 10).is_err());
    }

    #[test]
    fn refunds_require_cancel_once_both_sides_lock() {
        use super::refund_allowed;
        assert!(refund_allowed(0b01, false, false));
        assert!(refund_allowed(0b10, false, false));
        assert!(!refund_allowed(0b11, false, false));
        assert!(refund_allowed(0b11, true, false));
        assert!(!refund_allowed(0b11, true, true));
        assert!(!refund_allowed(0b01, false, true));
    }
}
