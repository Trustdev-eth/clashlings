ALTER TABLE `token_intents` ADD `position_ref` text;--> statement-breakpoint
ALTER TABLE `token_positions` ADD `position` text;--> statement-breakpoint
CREATE UNIQUE INDEX `token_positions_position_unique` ON `token_positions` (`position`);