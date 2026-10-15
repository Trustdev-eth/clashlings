CREATE UNIQUE INDEX `wins_player_day_idx` ON `daily_wins` (`player_id`,`day`);--> statement-breakpoint
CREATE INDEX `holds_match_idx` ON `holds` (`match_id`);--> statement-breakpoint
CREATE INDEX `ledger_player_time_idx` ON `ledger` (`player_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `matches_queue_idx` ON `matches` (`asset`,`mode`,`status`,`stake`,`created_at`);--> statement-breakpoint
CREATE INDEX `matches_expiry_idx` ON `matches` (`status`,`expires_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `rewards_player_day_key_idx` ON `reward_claims` (`player_id`,`day`,`reward_key`);--> statement-breakpoint
CREATE INDEX `token_intents_match_idx` ON `token_intents` (`match_id`,`kind`,`status`);--> statement-breakpoint
CREATE INDEX `token_intents_player_idx` ON `token_intents` (`player_id`,`status`);--> statement-breakpoint
CREATE INDEX `token_positions_player_idx` ON `token_positions` (`player_id`,`status`,`lock_until`);--> statement-breakpoint
CREATE INDEX `wallet_challenge_rate_idx` ON `wallet_challenges` (`wallet`,`created_at`);--> statement-breakpoint
CREATE INDEX `wallet_challenge_expiry_idx` ON `wallet_challenges` (`expires_at`);--> statement-breakpoint
CREATE INDEX `wallet_session_expiry_idx` ON `wallet_sessions` (`expires_at`);