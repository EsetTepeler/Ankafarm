CREATE TABLE `attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`farm_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text,
	`sync_seq` integer DEFAULT 0 NOT NULL,
	`deleted_at` text,
	`deleted_by` text,
	`delete_reason` text,
	`entity_table` text NOT NULL,
	`entity_id` text NOT NULL,
	`kind` text DEFAULT 'photo' NOT NULL,
	`mime` text NOT NULL,
	`size` integer NOT NULL,
	`caption` text,
	`storage_path` text
);
--> statement-breakpoint
CREATE INDEX `attachments_entity_idx` ON `attachments` (`entity_table`,`entity_id`);--> statement-breakpoint
CREATE TABLE `upload_queue` (
	`attachment_id` text PRIMARY KEY NOT NULL,
	`mime` text NOT NULL,
	`data` text NOT NULL,
	`created_at` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error` text
);
--> statement-breakpoint
CREATE INDEX `upload_queue_status_idx` ON `upload_queue` (`status`);