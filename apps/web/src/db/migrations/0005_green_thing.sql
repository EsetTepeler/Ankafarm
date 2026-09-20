CREATE TABLE `exit_records` (
	`id` text PRIMARY KEY NOT NULL,
	`farm_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text,
	`sync_seq` integer DEFAULT 0 NOT NULL,
	`deleted_at` text,
	`deleted_by` text,
	`delete_reason` text,
	`source` text DEFAULT 'app' NOT NULL,
	`device_id` text,
	`recorded_at` text,
	`animal_id` text NOT NULL,
	`type` text NOT NULL,
	`exited_at` text NOT NULL,
	`reason` text,
	`price` real,
	`buyer` text,
	`notes` text
);
--> statement-breakpoint
CREATE INDEX `exit_records_animal_idx` ON `exit_records` (`animal_id`);--> statement-breakpoint
CREATE TABLE `observation_tags` (
	`id` text PRIMARY KEY NOT NULL,
	`farm_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text,
	`sync_seq` integer DEFAULT 0 NOT NULL,
	`deleted_at` text,
	`deleted_by` text,
	`delete_reason` text,
	`category` text NOT NULL,
	`label` text NOT NULL,
	`is_seed` integer DEFAULT false NOT NULL,
	`active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE INDEX `observation_tags_category_idx` ON `observation_tags` (`category`);--> statement-breakpoint
CREATE TABLE `observations` (
	`id` text PRIMARY KEY NOT NULL,
	`farm_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text,
	`sync_seq` integer DEFAULT 0 NOT NULL,
	`deleted_at` text,
	`deleted_by` text,
	`delete_reason` text,
	`source` text DEFAULT 'app' NOT NULL,
	`device_id` text,
	`recorded_at` text,
	`animal_id` text,
	`group_id` text,
	`observed_at` text NOT NULL,
	`category` text NOT NULL,
	`severity` text DEFAULT 'normal' NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`note` text,
	`photo_path` text
);
--> statement-breakpoint
CREATE INDEX `observations_animal_idx` ON `observations` (`animal_id`,`observed_at`);--> statement-breakpoint
CREATE INDEX `observations_observed_idx` ON `observations` (`observed_at`);