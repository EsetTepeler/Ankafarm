CREATE TYPE "public"."protocol_trigger" AS ENUM('age_days', 'interval_days', 'fixed_month');--> statement-breakpoint
CREATE TABLE "health_protocols" (
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
	"active" boolean DEFAULT true NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "protocol_items" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"farm_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"sync_seq" bigint DEFAULT 0 NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	"delete_reason" text,
	"protocol_id" uuid NOT NULL,
	"type" "health_type" NOT NULL,
	"product_name" text,
	"trigger" "protocol_trigger" NOT NULL,
	"value" integer NOT NULL,
	"repeat" boolean DEFAULT true NOT NULL,
	"notes" text
);
--> statement-breakpoint
ALTER TABLE "health_protocols" ADD CONSTRAINT "health_protocols_farm_id_farms_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_protocols" ADD CONSTRAINT "health_protocols_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_protocols" ADD CONSTRAINT "health_protocols_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "protocol_items" ADD CONSTRAINT "protocol_items_farm_id_farms_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "protocol_items" ADD CONSTRAINT "protocol_items_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "protocol_items" ADD CONSTRAINT "protocol_items_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "protocol_items" ADD CONSTRAINT "protocol_items_protocol_id_health_protocols_id_fk" FOREIGN KEY ("protocol_id") REFERENCES "public"."health_protocols"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "health_protocols_farm_sync_idx" ON "health_protocols" USING btree ("farm_id","sync_seq");--> statement-breakpoint
CREATE INDEX "protocol_items_protocol_idx" ON "protocol_items" USING btree ("protocol_id");--> statement-breakpoint
CREATE INDEX "protocol_items_farm_sync_idx" ON "protocol_items" USING btree ("farm_id","sync_seq");