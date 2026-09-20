CREATE TYPE "public"."exit_type" AS ENUM('sold', 'died', 'slaughtered', 'lost');--> statement-breakpoint
CREATE TYPE "public"."observation_category" AS ENUM('feeding', 'movement', 'behavior', 'respiratory', 'digestive', 'appearance', 'udder', 'reproductive', 'note', 'other');--> statement-breakpoint
CREATE TYPE "public"."severity" AS ENUM('normal', 'mild', 'moderate', 'severe');--> statement-breakpoint
CREATE TABLE "exit_records" (
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
	"type" "exit_type" NOT NULL,
	"exited_at" date NOT NULL,
	"reason" text,
	"price" numeric(12, 2),
	"buyer" text,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "observation_tags" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"farm_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"sync_seq" bigint DEFAULT 0 NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	"delete_reason" text,
	"category" "observation_category" NOT NULL,
	"label" text NOT NULL,
	"is_seed" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "observations" (
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
	"animal_id" uuid,
	"group_id" uuid,
	"observed_at" timestamp with time zone NOT NULL,
	"category" "observation_category" NOT NULL,
	"severity" "severity" DEFAULT 'normal' NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"note" text,
	"photo_path" text
);
--> statement-breakpoint
ALTER TABLE "exit_records" ADD CONSTRAINT "exit_records_farm_id_farms_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exit_records" ADD CONSTRAINT "exit_records_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exit_records" ADD CONSTRAINT "exit_records_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exit_records" ADD CONSTRAINT "exit_records_animal_id_animals_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."animals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observation_tags" ADD CONSTRAINT "observation_tags_farm_id_farms_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observation_tags" ADD CONSTRAINT "observation_tags_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observation_tags" ADD CONSTRAINT "observation_tags_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observations" ADD CONSTRAINT "observations_farm_id_farms_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observations" ADD CONSTRAINT "observations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observations" ADD CONSTRAINT "observations_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observations" ADD CONSTRAINT "observations_animal_id_animals_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."animals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observations" ADD CONSTRAINT "observations_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "exit_records_animal_idx" ON "exit_records" USING btree ("animal_id");--> statement-breakpoint
CREATE INDEX "exit_records_farm_sync_idx" ON "exit_records" USING btree ("farm_id","sync_seq");--> statement-breakpoint
CREATE UNIQUE INDEX "observation_tags_farm_cat_label_uq" ON "observation_tags" USING btree ("farm_id","category","label");--> statement-breakpoint
CREATE INDEX "observation_tags_farm_sync_idx" ON "observation_tags" USING btree ("farm_id","sync_seq");--> statement-breakpoint
CREATE INDEX "observations_animal_idx" ON "observations" USING btree ("animal_id","observed_at");--> statement-breakpoint
CREATE INDEX "observations_farm_observed_idx" ON "observations" USING btree ("farm_id","observed_at");--> statement-breakpoint
CREATE INDEX "observations_farm_sync_idx" ON "observations" USING btree ("farm_id","sync_seq");