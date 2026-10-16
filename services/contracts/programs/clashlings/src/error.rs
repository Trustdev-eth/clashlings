use anchor_lang::prelude::*;

#[error_code]
pub enum ArenaError {
    #[msg("The arena program is paused.")]
    Paused,
    #[msg("Amount must be greater than zero.")]
    ZeroAmount,
    #[msg("Card index must be 0–11.")]
    InvalidCard,
    #[msg("Target level must be 2–5.")]
    InvalidLevel,
    #[msg("Side must be 0 or 1.")]
    InvalidSide,
    #[msg("Winner must be -1 (draw), 0, or 1.")]
    InvalidWinner,
    #[msg("Lock duration is below the one-day minimum.")]
    LockTooShort,
    #[msg("This staking position is still locked.")]
    StillLocked,
    #[msg("This staking position was already withdrawn.")]
    AlreadyWithdrawn,
    #[msg("This escrow was already deposited.")]
    EscrowFilled,
    #[msg("This escrow is not locked.")]
    EscrowNotLocked,
    #[msg("Escrow amounts for a match must match.")]
    EscrowAmountMismatch,
    #[msg("Both sides must lock before settlement.")]
    IncompleteEscrow,
    #[msg("This match was already settled.")]
    AlreadySettled,
    #[msg("A refunded escrow cannot be settled.")]
    EscrowRefunded,
    #[msg("Both sides are locked; only a cancelled match can be refunded.")]
    RefundNotAllowed,
    #[msg("This match was cancelled.")]
    MatchCancelled,
    #[msg("Settlement authority cannot be the default pubkey.")]
    InvalidAuthority,
    #[msg("Only the original wallet can withdraw or refund.")]
    WrongWallet,
    #[msg("Arithmetic overflow.")]
    Overflow,
    #[msg("Mint does not match the configured game token.")]
    WrongMint,
}
