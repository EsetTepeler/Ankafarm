CREATE TABLE `health_records` (
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
	`product_name` text,
	`dose` real,
	`dose_unit` text,
	`applied_at` text NOT NULL,
	`vet_name` text,
	`next_due_at` text,
	`withdrawal_days` integer,
	`withdrawal_until` text,
	`cost` real,
	`batch_id` text,
	`notes` text
);
--> statement-breakpoint
CREATE INDEX `health_records_animal_idx` ON `health_records` (`animal_id`,`applied_at`);--> statement-breakpoint
CREATE INDEX `health_records_batch_idx` ON `health_records` (`batch_id`);