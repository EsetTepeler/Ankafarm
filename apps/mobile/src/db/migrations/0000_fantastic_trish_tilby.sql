CREATE TABLE `animals` (
	`id` text PRIMARY KEY NOT NULL,
	`farm_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text,
	`sync_seq` integer DEFAULT 0 NOT NULL,
	`deleted_at` text,
	`deleted_by` text,
	`delete_reason` text,
	`tag_no` text NOT NULL,
	`rfid` text,
	`name` text,
	`species` text NOT NULL,
	`breed_id` text,
	`breed_note` text,
	`sex` text NOT NULL,
	`origin` text NOT NULL,
	`acquired_at` text,
	`source` text,
	`purchase_price` real,
	`birth_date` text,
	`birth_date_estimated` integer DEFAULT false NOT NULL,
	`birth_type` text,
	`birth_id` text,
	`mother_id` text,
	`father_id` text,
	`status` text DEFAULT 'active' NOT NULL,
	`group_id` text,
	`photo_path` text,
	`notes` text,
	`current_weight` real,
	`is_pregnant` integer DEFAULT false NOT NULL,
	`expected_birth_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `animals_tag_uq` ON `animals` (`farm_id`,`tag_no`);--> statement-breakpoint
CREATE INDEX `animals_status_idx` ON `animals` (`status`);--> statement-breakpoint
CREATE INDEX `animals_group_idx` ON `animals` (`group_id`);--> statement-breakpoint
CREATE INDEX `animals_mother_idx` ON `animals` (`mother_id`);--> statement-breakpoint
CREATE TABLE `breeds` (
	`id` text PRIMARY KEY NOT NULL,
	`farm_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text,
	`sync_seq` integer DEFAULT 0 NOT NULL,
	`deleted_at` text,
	`deleted_by` text,
	`delete_reason` text,
	`name` text NOT NULL,
	`species` text NOT NULL,
	`is_seed` integer DEFAULT false NOT NULL,
	`active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE INDEX `breeds_species_idx` ON `breeds` (`species`,`name`);--> statement-breakpoint
CREATE TABLE `group_movements` (
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
	`from_group_id` text,
	`to_group_id` text NOT NULL,
	`moved_at` text NOT NULL,
	`reason` text
);
--> statement-breakpoint
CREATE INDEX `group_movements_animal_idx` ON `group_movements` (`animal_id`,`moved_at`);--> statement-breakpoint
CREATE TABLE `groups` (
	`id` text PRIMARY KEY NOT NULL,
	`farm_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text,
	`sync_seq` integer DEFAULT 0 NOT NULL,
	`deleted_at` text,
	`deleted_by` text,
	`delete_reason` text,
	`name` text NOT NULL,
	`kind` text DEFAULT 'pen' NOT NULL,
	`capacity` integer,
	`active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE `meta` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text
);
--> statement-breakpoint
CREATE TABLE `outbox` (
	`mutation_id` text PRIMARY KEY NOT NULL,
	`table` text NOT NULL,
	`op` text NOT NULL,
	`row_id` text NOT NULL,
	`payload` text NOT NULL,
	`client_created_at` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`rejection_code` text
);
--> statement-breakpoint
CREATE INDEX `outbox_status_idx` ON `outbox` (`status`,`client_created_at`);--> statement-breakpoint
CREATE TABLE `sync_cursors` (
	`table` text PRIMARY KEY NOT NULL,
	`cursor` integer DEFAULT 0 NOT NULL
);
