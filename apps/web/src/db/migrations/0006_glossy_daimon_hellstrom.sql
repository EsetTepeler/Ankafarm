CREATE TABLE `consumptions` (
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
	`item_id` text NOT NULL,
	`consumed_on` text NOT NULL,
	`quantity` real NOT NULL,
	`group_id` text,
	`animal_id` text,
	`notes` text
);
--> statement-breakpoint
CREATE INDEX `consumptions_item_idx` ON `consumptions` (`item_id`,`consumed_on`);--> statement-breakpoint
CREATE INDEX `consumptions_date_idx` ON `consumptions` (`consumed_on`);--> statement-breakpoint
CREATE TABLE `expenses` (
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
	`spent_at` text NOT NULL,
	`amount` real NOT NULL,
	`description` text,
	`animal_id` text,
	`document_path` text
);
--> statement-breakpoint
CREATE INDEX `expenses_date_idx` ON `expenses` (`spent_at`);--> statement-breakpoint
CREATE TABLE `incomes` (
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
	`received_at` text NOT NULL,
	`amount` real NOT NULL,
	`description` text,
	`animal_id` text
);
--> statement-breakpoint
CREATE INDEX `incomes_date_idx` ON `incomes` (`received_at`);--> statement-breakpoint
CREATE TABLE `purchases` (
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
	`item_id` text NOT NULL,
	`purchased_at` text NOT NULL,
	`quantity` real NOT NULL,
	`unit_price` real,
	`total` real,
	`supplier` text,
	`document_path` text,
	`notes` text
);
--> statement-breakpoint
CREATE INDEX `purchases_item_idx` ON `purchases` (`item_id`,`purchased_at`);--> statement-breakpoint
CREATE INDEX `purchases_date_idx` ON `purchases` (`purchased_at`);--> statement-breakpoint
CREATE TABLE `stock_items` (
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
	`category` text NOT NULL,
	`unit` text NOT NULL,
	`min_stock` real,
	`track_stock` integer DEFAULT true NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`notes` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stock_items_name_uq` ON `stock_items` (`name`);