-- Pool depletion recovery + expanded task taxonomy

-- 1. Queue for guaranteed minimums the pool couldn't cover at completion time.
--    A backfill worker retries these FIFO whenever the pool is replenished.
CREATE TABLE IF NOT EXISTS "pool_pending_minimums" (
  "id" serial PRIMARY KEY NOT NULL,
  "request_id" integer NOT NULL,
  "helper_id" integer NOT NULL,
  "amount" real NOT NULL,
  "request_title" text DEFAULT '' NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "created_at" timestamp with time zone DEFAULT NOW() NOT NULL,
  "paid_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_pool_pending_minimum_request"
  ON "pool_pending_minimums" ("request_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pool_pending_minimums_status"
  ON "pool_pending_minimums" ("status", "created_at");
--> statement-breakpoint

-- 2. Low-balance alert threshold (admin-tunable)
INSERT INTO "system_settings" ("key", "value")
VALUES ('pool_low_balance_threshold', '25')
ON CONFLICT ("key") DO NOTHING;
--> statement-breakpoint

-- 3. Expanded task taxonomy — "almost any legal task"
ALTER TYPE "public"."help_request_category" ADD VALUE IF NOT EXISTS 'moving_labor';
--> statement-breakpoint
ALTER TYPE "public"."help_request_category" ADD VALUE IF NOT EXISTS 'pet_care';
--> statement-breakpoint
ALTER TYPE "public"."help_request_category" ADD VALUE IF NOT EXISTS 'childcare';
--> statement-breakpoint
ALTER TYPE "public"."help_request_category" ADD VALUE IF NOT EXISTS 'senior_care';
--> statement-breakpoint
ALTER TYPE "public"."help_request_category" ADD VALUE IF NOT EXISTS 'yard_work';
--> statement-breakpoint
ALTER TYPE "public"."help_request_category" ADD VALUE IF NOT EXISTS 'tutoring';
--> statement-breakpoint
ALTER TYPE "public"."help_request_category" ADD VALUE IF NOT EXISTS 'cleaning';
--> statement-breakpoint
ALTER TYPE "public"."help_request_category" ADD VALUE IF NOT EXISTS 'meal_prep';
--> statement-breakpoint
ALTER TYPE "public"."help_request_category" ADD VALUE IF NOT EXISTS 'paperwork';
--> statement-breakpoint
ALTER TYPE "public"."help_request_category" ADD VALUE IF NOT EXISTS 'business_services';
