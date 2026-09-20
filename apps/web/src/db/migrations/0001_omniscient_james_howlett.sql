DROP INDEX `animals_tag_uq`;--> statement-breakpoint
CREATE UNIQUE INDEX `animals_tag_uq` ON `animals` (`farm_id`,`tag_no`) WHERE "animals"."deleted_at" is null;