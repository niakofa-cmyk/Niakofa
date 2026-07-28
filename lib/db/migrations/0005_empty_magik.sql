CREATE TABLE "region_crisis_resources" (
	"id" serial PRIMARY KEY NOT NULL,
	"region_key" text NOT NULL,
	"region_display" text NOT NULL,
	"state_code" text,
	"country_code" text DEFAULT 'US' NOT NULL,
	"resources" text DEFAULT '[]' NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"notes" text,
	"verified_by" integer,
	"verified_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "region_crisis_resources_region_key_idx" ON "region_crisis_resources" USING btree ("region_key");--> statement-breakpoint
CREATE INDEX "region_crisis_resources_state_idx" ON "region_crisis_resources" USING btree ("state_code");--> statement-breakpoint
CREATE INDEX "region_crisis_resources_verified_idx" ON "region_crisis_resources" USING btree ("verified");