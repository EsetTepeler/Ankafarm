CREATE TABLE `reminders` (
	`id` text PRIMARY KEY NOT NULL,
	`farm_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text,
	`sync_seq` integer DEFAULT 0 NOT NULL,
	`deleted_at` text,
	`deleted_by` text,
	`delete_reason` text,
	`title` text NOT NULL,
	`due_at` text NOT NULL,
	`animal_id` text,
	`group_id` text,
	`note` text,
	`done_at` text
);
--> statement-breakpoint
CREATE INDEX `reminders_due_idx` ON `reminders` (`due_at`);