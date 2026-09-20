CREATE TABLE `breeding_records` (
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
	`female_id` text NOT NULL,
	`male_id` text,
	`method` text DEFAULT 'natural' NOT NULL,
	`mated_at` text NOT NULL,
	`expected_birth_at` text NOT NULL,
	`pregnancy_checked_at` text,
	`pregnancy_result` text DEFAULT 'pending' NOT NULL,
	`notes` text
);
--> statement-breakpoint
CREATE INDEX `breeding_records_female_idx` ON `breeding_records` (`female_id`,`mated_at`);--> statement-breakpoint
CREATE INDEX `breeding_records_male_idx` ON `breeding_records` (`male_id`);--> statement-breakpoint
CREATE TABLE `lambing_records` (
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
	`mother_id` text NOT NULL,
	`father_id` text,
	`breeding_id` text,
	`born_at` text NOT NULL,
	`difficulty` text DEFAULT 'easy' NOT NULL,
	`live_count` integer DEFAULT 0 NOT NULL,
	`stillborn_count` integer DEFAULT 0 NOT NULL,
	`notes` text
);
--> statement-breakpoint
CREATE INDEX `lambing_records_mother_idx` ON `lambing_records` (`mother_id`,`born_at`);