CREATE TABLE "city_neighborhoods" (
	"id" serial PRIMARY KEY NOT NULL,
	"city_key" text NOT NULL,
	"city_display" text NOT NULL,
	"neighborhood_id" text NOT NULL,
	"name" text NOT NULL,
	"emoji" text DEFAULT '📍' NOT NULL,
	"description" text NOT NULL,
	"source" text DEFAULT 'generated' NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "city_neighborhoods_city_key_neighborhood_id_idx" ON "city_neighborhoods" USING btree ("city_key","neighborhood_id");