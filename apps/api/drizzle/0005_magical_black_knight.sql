CREATE TYPE "public"."health_type" AS ENUM('vaccine', 'medication', 'deworming', 'disease', 'exam', 'hoof', 'shearing', 'other');--> statement-breakpoint
CREATE TABLE "health_records" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"farm_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"sync_seq" bigint DEFAULT 0 NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	"delete_reason" text,
	"source" text DEFAULT 'app' NOT NULL,
	"device_id" uuid,
	"recorded_at" timestamp with time zone,
	"animal_id" uuid NOT NULL,
	"type" "health_type" NOT NULL,
	"product_name" text,
	"dose" numeric(10, 3),
	"dose_unit" text,
	"applied_at" timestamp with time zone NOT NULL,
	"vet_name" text,
	"next_due_at" date,
	"withdrawal_days" integer,
	"withdrawal_until" date,
	"cost" numeric(12, 2),
	"batch_id" uuid,
	"notes" text
);
--> statement-breakpoint
ALTER TABLE "health_records" ADD CONSTRAINT "health_records_farm_id_farms_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_records" ADD CONSTRAINT "health_records_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_records" ADD CONSTRAINT "health_records_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_records" ADD CONSTRAINT "health_records_animal_id_animals_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."animals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "health_records_animal_idx" ON "health_records" USING btree ("animal_id","applied_at");--> statement-breakpoint
CREATE INDEX "health_records_batch_idx" ON "health_records" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "health_records_farm_sync_idx" ON "health_records" USING btree ("farm_id","sync_seq");