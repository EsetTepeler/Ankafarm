CREATE TYPE "public"."animal_status" AS ENUM('active', 'sold', 'dead', 'slaughtered', 'lost');--> statement-breakpoint
CREATE TYPE "public"."birth_type" AS ENUM('single', 'twin', 'triplet', 'quad');--> statement-breakpoint
CREATE TYPE "public"."group_kind" AS ENUM('pen', 'pasture', 'quarantine', 'nursery');--> statement-breakpoint
CREATE TYPE "public"."origin" AS ENUM('born_here', 'purchased');--> statement-breakpoint
CREATE TYPE "public"."sex" AS ENUM('female', 'male', 'castrated');--> statement-breakpoint
CREATE TYPE "public"."species" AS ENUM('sheep', 'goat');--> statement-breakpoint
CREATE TABLE "animals" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"farm_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"sync_seq" bigint DEFAULT 0 NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	"delete_reason" text,
	"tag_no" text NOT NULL,
	"rfid" text,
	"name" text,
	"species" "species" NOT NULL,
	"breed_id" uuid,
	"breed_note" text,
	"sex" "sex" NOT NULL,
	"origin" "origin" NOT NULL,
	"acquired_at" date,
	"source" text,
	"purchase_price" numeric(12, 2),
	"birth_date" date,
	"birth_date_estimated" boolean DEFAULT false NOT NULL,
	"birth_type" "birth_type",
	"birth_id" uuid,
	"mother_id" uuid,
	"father_id" uuid,
	"status" "animal_status" DEFAULT 'active' NOT NULL,
	"group_id" uuid,
	"photo_path" text,
	"notes" text,
	"current_weight" numeric(6, 2),
	"is_pregnant" boolean DEFAULT false NOT NULL,
	"expected_birth_at" date
);
--> statement-breakpoint
CREATE TABLE "breeds" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"farm_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"sync_seq" bigint DEFAULT 0 NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	"delete_reason" text,
	"name" text NOT NULL,
	"species" "species" NOT NULL,
	"is_seed" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "group_movements" (
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
	"from_group_id" uuid,
	"to_group_id" uuid NOT NULL,
	"moved_at" timestamp with time zone NOT NULL,
	"reason" text
);
--> statement-breakpoint
CREATE TABLE "groups" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"farm_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"sync_seq" bigint DEFAULT 0 NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	"delete_reason" text,
	"name" text NOT NULL,
	"kind" "group_kind" DEFAULT 'pen' NOT NULL,
	"capacity" integer,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "applied_mutations" (
	"mutation_id" uuid PRIMARY KEY NOT NULL,
	"farm_id" uuid NOT NULL,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid,
	"device_id" uuid
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"farm_id" uuid NOT NULL,
	"table_name" text NOT NULL,
	"record_id" uuid NOT NULL,
	"action" text NOT NULL,
	"old_data" jsonb,
	"new_data" jsonb,
	"user_id" uuid,
	"device_id" uuid,
	"mutation_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "predictions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"farm_id" uuid NOT NULL,
	"animal_id" uuid,
	"type" text NOT NULL,
	"predicted_value" numeric(14, 4),
	"predicted_payload" jsonb,
	"confidence" numeric(4, 3),
	"predicted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"target_date" timestamp with time zone,
	"model_version" text NOT NULL,
	"source" text DEFAULT 'rule' NOT NULL,
	"actual_value" numeric(14, 4),
	"actual_source_table" text,
	"actual_source_id" uuid,
	"evaluated_at" timestamp with time zone,
	"error" numeric(14, 4),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "animals" ADD CONSTRAINT "animals_farm_id_farms_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "animals" ADD CONSTRAINT "animals_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "animals" ADD CONSTRAINT "animals_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "animals" ADD CONSTRAINT "animals_breed_id_breeds_id_fk" FOREIGN KEY ("breed_id") REFERENCES "public"."breeds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "animals" ADD CONSTRAINT "animals_mother_id_animals_id_fk" FOREIGN KEY ("mother_id") REFERENCES "public"."animals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "animals" ADD CONSTRAINT "animals_father_id_animals_id_fk" FOREIGN KEY ("father_id") REFERENCES "public"."animals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "animals" ADD CONSTRAINT "animals_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "breeds" ADD CONSTRAINT "breeds_farm_id_farms_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "breeds" ADD CONSTRAINT "breeds_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "breeds" ADD CONSTRAINT "breeds_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_movements" ADD CONSTRAINT "group_movements_farm_id_farms_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_movements" ADD CONSTRAINT "group_movements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_movements" ADD CONSTRAINT "group_movements_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_movements" ADD CONSTRAINT "group_movements_animal_id_animals_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."animals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_movements" ADD CONSTRAINT "group_movements_from_group_id_groups_id_fk" FOREIGN KEY ("from_group_id") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_movements" ADD CONSTRAINT "group_movements_to_group_id_groups_id_fk" FOREIGN KEY ("to_group_id") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_farm_id_farms_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applied_mutations" ADD CONSTRAINT "applied_mutations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "predictions" ADD CONSTRAINT "predictions_farm_id_farms_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "animals_farm_tag_uq" ON "animals" USING btree ("farm_id","tag_no") WHERE "animals"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "animals_farm_status_idx" ON "animals" USING btree ("farm_id","status");--> statement-breakpoint
CREATE INDEX "animals_farm_sync_idx" ON "animals" USING btree ("farm_id","sync_seq");--> statement-breakpoint
CREATE INDEX "animals_mother_idx" ON "animals" USING btree ("mother_id");--> statement-breakpoint
CREATE INDEX "animals_father_idx" ON "animals" USING btree ("father_id");--> statement-breakpoint
CREATE UNIQUE INDEX "breeds_farm_species_name_uq" ON "breeds" USING btree ("farm_id","species","name");--> statement-breakpoint
CREATE INDEX "breeds_farm_sync_idx" ON "breeds" USING btree ("farm_id","sync_seq");--> statement-breakpoint
CREATE INDEX "group_movements_animal_idx" ON "group_movements" USING btree ("animal_id","moved_at");--> statement-breakpoint
CREATE INDEX "group_movements_farm_sync_idx" ON "group_movements" USING btree ("farm_id","sync_seq");--> statement-breakpoint
CREATE INDEX "groups_farm_sync_idx" ON "groups" USING btree ("farm_id","sync_seq");--> statement-breakpoint
CREATE INDEX "audit_log_farm_created_idx" ON "audit_log" USING btree ("farm_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_log_record_idx" ON "audit_log" USING btree ("table_name","record_id");--> statement-breakpoint
CREATE INDEX "predictions_farm_animal_idx" ON "predictions" USING btree ("farm_id","animal_id","type");