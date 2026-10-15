DROP TRIGGER IF EXISTS ledger_validate;
--> statement-breakpoint
DROP TRIGGER IF EXISTS ledger_apply;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `holds` (
	`id` text PRIMARY KEY NOT NULL,
	`player_id` text NOT NULL,
	`match_id` text NOT NULL,
	`stake` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `holds_player_id_unique` ON `holds` (`player_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `ledger` (
	`id` text PRIMARY KEY NOT NULL,
	`player_id` text NOT NULL,
	`delta` integer NOT NULL,
	`kind` text NOT NULL,
	`match_id` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `matches` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text,
	`p0` text NOT NULL,
	`p1` text,
	`status` text NOT NULL,
	`state` text NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	`last_tick` integer NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`mode` text NOT NULL,
	`stake` integer NOT NULL,
	`settled` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `matches_code_unique` ON `matches` (`code`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `players` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`deck` text NOT NULL,
	`levels` text NOT NULL,
	`balance` integer DEFAULT 0 NOT NULL CHECK(`balance`>=0),
	`revision` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`wins` integer DEFAULT 0 NOT NULL,
	`losses` integer DEFAULT 0 NOT NULL,
	`trophies` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS matches_waiting ON matches(status,mode,stake,expires_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS ledger_trainer ON ledger(player_id,created_at);
