CREATE TABLE `comments` (
	`id` text PRIMARY KEY NOT NULL,
	`upload_id` text NOT NULL,
	`viewer_id` text NOT NULL,
	`author_name` text NOT NULL,
	`text` text NOT NULL,
	`timestamp` real,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_comments_upload_id` ON `comments` (`upload_id`);--> statement-breakpoint
ALTER TABLE `uploads` ADD `title` text;--> statement-breakpoint
ALTER TABLE `uploads` ADD `poster_key` text;--> statement-breakpoint
ALTER TABLE `uploads` ADD `transcript_key` text;--> statement-breakpoint
ALTER TABLE `uploads` ADD `chapters` text;--> statement-breakpoint
ALTER TABLE `uploads` ADD `views` integer DEFAULT 0 NOT NULL;