CREATE TABLE `likes` (
	`upload_id` text NOT NULL,
	`viewer_id` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	PRIMARY KEY(`upload_id`, `viewer_id`)
);
--> statement-breakpoint
CREATE TABLE `view_events` (
	`id` text PRIMARY KEY NOT NULL,
	`upload_id` text NOT NULL,
	`country` text,
	`city` text,
	`referrer` text,
	`device` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_view_events_upload_id` ON `view_events` (`upload_id`);