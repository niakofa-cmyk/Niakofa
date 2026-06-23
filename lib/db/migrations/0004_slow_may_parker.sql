ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "geog" geography(Point, 4326);--> statement-breakpoint
ALTER TABLE "help_requests" ADD COLUMN IF NOT EXISTS "geog" geography(Point, 4326);
