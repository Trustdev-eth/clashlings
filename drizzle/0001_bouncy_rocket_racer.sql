CREATE TABLE `daily_wins` (
	`id` text PRIMARY KEY NOT NULL,
	`player_id` text NOT NULL,
	`day` text NOT NULL,
	`wins` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `market_cache` (
	`cache_key` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`updated_at` integer NOT NULL,
	`lease_until` integer DEFAULT 0 NOT NULL,
	`feeds` text DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `reward_claims` (
	`id` text PRIMARY KEY NOT NULL,
	`player_id` text NOT NULL,
	`day` text NOT NULL,
	`reward_key` text NOT NULL,
	`amount` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `token_intents` (
	`id` text PRIMARY KEY NOT NULL,
	`player_id` text NOT NULL,
	`wallet` text NOT NULL,
	`kind` text NOT NULL,
	`card` integer,
	`target_level` integer,
	`amount_units` text NOT NULL,
	`match_id` text,
	`side` integer,
	`status` text NOT NULL,
	`signature` text,
	`receipt` text,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `token_intents_signature_unique` ON `token_intents` (`signature`);--> statement-breakpoint
CREATE TABLE `token_positions` (
	`id` text PRIMARY KEY NOT NULL,
	`player_id` text NOT NULL,
	`wallet` text NOT NULL,
	`card` integer NOT NULL,
	`target_level` integer NOT NULL,
	`amount_units` text NOT NULL,
	`lock_until` integer NOT NULL,
	`status` text NOT NULL,
	`receipt` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `token_settlements` (
	`match_id` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`receipt` text,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `wallet_challenges` (
	`id` text PRIMARY KEY NOT NULL,
	`wallet` text NOT NULL,
	`message` text NOT NULL,
	`origin` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`link_owner` text,
	`consumed` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `wallet_links` (
	`wallet` text PRIMARY KEY NOT NULL,
	`player_id` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `wallet_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`player_id` text NOT NULL,
	`wallet` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `matches` ADD `transport` text DEFAULT 'http' NOT NULL;--> statement-breakpoint
ALTER TABLE `matches` ADD `asset` text DEFAULT 'credits' NOT NULL;--> statement-breakpoint
ALTER TABLE `matches` ADD `stake_units` text;--> statement-breakpoint
ALTER TABLE `matches` ADD `funding` text DEFAULT '{}' NOT NULL;