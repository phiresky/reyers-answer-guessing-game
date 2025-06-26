CREATE TABLE `answers` (
	`id` text PRIMARY KEY NOT NULL,
	`game_id` text NOT NULL,
	`player_id` text NOT NULL,
	`answer` text NOT NULL,
	`submitted_at` integer NOT NULL,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `games` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`round` integer NOT NULL,
	`question` text NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`status` text DEFAULT 'active' NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `guesses` (
	`id` text PRIMARY KEY NOT NULL,
	`game_id` text NOT NULL,
	`guesser_id` text NOT NULL,
	`target_player_id` text NOT NULL,
	`guess` text NOT NULL,
	`rating` real,
	`submitted_at` integer NOT NULL,
	`rated_at` integer,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`guesser_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`target_player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `players` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`name` text NOT NULL,
	`country` text,
	`session_id` text NOT NULL,
	`is_creator` integer DEFAULT false NOT NULL,
	`last_seen` integer NOT NULL,
	`status` text DEFAULT 'online' NOT NULL,
	`total_score` real DEFAULT 0 NOT NULL,
	`joined_at` integer NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`status` text DEFAULT 'lobby' NOT NULL,
	`creator_id` text NOT NULL,
	`current_round` integer DEFAULT 0 NOT NULL,
	`total_rounds` integer DEFAULT 3 NOT NULL,
	`round_time_limit` integer DEFAULT 120 NOT NULL,
	`initial_prompt` text DEFAULT 'Intriguing Hypothetical Scenarios' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rooms_code_unique` ON `rooms` (`code`);