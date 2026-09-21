CREATE TABLE `health_protocols` (
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
	`active` integer DEFAULT true NOT NULL,
	`notes` text
);
--> statement-breakpoint
CREATE TABLE `protocol_items` (
	`id` text PRIMARY KEY NOT NULL,
	`farm_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text,
	`sync_seq` integer DEFAULT 0 NOT NULL,
	`deleted_at` text,
	`deleted_by` text,
	`delete_reason` text,
	`protocol_id` text NOT NULL,
	`type` text NOT NULL,
	`product_name` text,
	`trigger` text NOT NULL,
	`value` integer NOT NULL,
	`repeat` integer DEFAULT true NOT NULL,
	`notes` text
);
--> statement-breakpoint
CREATE INDEX `protocol_items_protocol_idx` ON `protocol_items` (`protocol_id`);