CREATE TYPE "public"."birth_difficulty" AS ENUM('easy', 'assisted', 'hard', 'cesarean');--> statement-breakpoint
CREATE TYPE "public"."breeding_method" AS ENUM('natural', 'ai');--> statement-breakpoint
CREATE TYPE "public"."pregnancy_result" AS ENUM('pending', 'positive', 'negative');--> statement-breakpoint
CREATE TABLE "breeding_records" (
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
	"female_id" uuid NOT NULL,
	"male_id" uuid,
	"method" "breeding_method" DEFAULT 'natural' NOT NULL,
	"mated_at" date NOT NULL,
	"expected_birth_at" date NOT NULL,
	"pregnancy_checked_at" date,
	"pregnancy_result" "pregnancy_result" DEFAULT 'pending' NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "lambing_records" (
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
	"mother_id" uuid NOT NULL,
	"father_id" uuid,
	"breeding_id" uuid,
	"born_at" date NOT NULL,
	"difficulty" "birth_difficulty" DEFAULT 'easy' NOT NULL,
	"live_count" integer DEFAULT 0 NOT NULL,
	"stillborn_count" integer DEFAULT 0 NOT NULL,
	"notes" text
);
--> statement-breakpoint
ALTER TABLE "breeding_records" ADD CONSTRAINT "breeding_records_farm_id_farms_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "breeding_records" ADD CONSTRAINT "breeding_records_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "breeding_records" ADD CONSTRAINT "breeding_records_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "breeding_records" ADD CONSTRAINT "breeding_records_female_id_animals_id_fk" FOREIGN KEY ("female_id") REFERENCES "public"."animals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "breeding_records" ADD CONSTRAINT "breeding_records_male_id_animals_id_fk" FOREIGN KEY ("male_id") REFERENCES "public"."animals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lambing_records" ADD CONSTRAINT "lambing_records_farm_id_farms_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lambing_records" ADD CONSTRAINT "lambing_records_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lambing_records" ADD CONSTRAINT "lambing_records_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lambing_records" ADD CONSTRAINT "lambing_records_mother_id_animals_id_fk" FOREIGN KEY ("mother_id") REFERENCES "public"."animals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lambing_records" ADD CONSTRAINT "lambing_records_father_id_animals_id_fk" FOREIGN KEY ("father_id") REFERENCES "public"."animals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lambing_records" ADD CONSTRAINT "lambing_records_breeding_id_breeding_records_id_fk" FOREIGN KEY ("breeding_id") REFERENCES "public"."breeding_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "breeding_records_female_idx" ON "breeding_records" USING btree ("female_id","mated_at");--> statement-breakpoint
CREATE INDEX "breeding_records_male_idx" ON "breeding_records" USING btree ("male_id");--> statement-breakpoint
CREATE INDEX "breeding_records_farm_sync_idx" ON "breeding_records" USING btree ("farm_id","sync_seq");--> statement-breakpoint
CREATE INDEX "lambing_records_mother_idx" ON "lambing_records" USING btree ("mother_id","born_at");--> statement-breakpoint
CREATE INDEX "lambing_records_farm_sync_idx" ON "lambing_records" USING btree ("farm_id","sync_seq");