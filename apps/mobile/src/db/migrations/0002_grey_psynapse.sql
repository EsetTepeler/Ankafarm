CREATE TABLE `weight_records` (
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
	`weighed_at` text NOT NULL,
	`weight_kg` real NOT NULL,
	`note` text
);
--> statement-breakpoint
CREATE INDEX `weight_records_animal_idx` ON `weight_records` (`animal_id`,`weighed_at`);