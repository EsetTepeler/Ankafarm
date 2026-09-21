CREATE INDEX `animals_tag_idx` ON `animals` (`tag_no`);--> statement-breakpoint
CREATE INDEX `health_records_due_idx` ON `health_records` (`next_due_at`);--> statement-breakpoint
CREATE INDEX `health_records_withdrawal_idx` ON `health_records` (`withdrawal_until`);