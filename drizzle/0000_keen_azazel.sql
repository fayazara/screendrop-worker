CREATE TABLE `uploads` (
	`id` text PRIMARY KEY NOT NULL,
	`filename` text NOT NULL,
	`content_type` text NOT NULL,
	`size` integer NOT NULL,
	`width` integer,
	`height` integer,
	`r2_key` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`media_type` text DEFAULT 'image' NOT NULL,
	`duration` real
);
--> statement-breakpoint
CREATE INDEX `idx_uploads_created_at` ON `uploads` (`created_at`);