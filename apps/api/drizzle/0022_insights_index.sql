DROP INDEX "insights_farm_animal_type_uq";--> statement-breakpoint
CREATE INDEX "insights_farm_type_idx" ON "insights" USING btree ("farm_id","type");