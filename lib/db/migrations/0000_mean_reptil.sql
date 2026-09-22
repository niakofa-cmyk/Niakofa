CREATE TYPE "public"."help_request_category" AS ENUM('groceries', 'transportation', 'errands', 'home_repair', 'medical', 'emergency', 'other', 'stock_shelves', 'event_setup', 'delivery_run', 'tech_support');--> statement-breakpoint
CREATE TYPE "public"."help_request_payment_type" AS ENUM('immediate', 'pay_it_forward', 'goodwill');--> statement-breakpoint
CREATE TYPE "public"."help_request_status" AS ENUM('open', 'claimed', 'en_route', 'arrived', 'completed', 'pay_it_forward_pending', 'cancelled', 'expired');--> statement-breakpoint
CREATE TYPE "public"."help_request_urgency" AS ENUM('low', 'medium', 'high', 'emergency');--> statement-breakpoint
CREATE TYPE "public"."payment_state" AS ENUM('unpaid', 'authorized', 'escrowed', 'pending_contribution', 'partially_repaid', 'sponsored', 'completed', 'disputed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."payment_transaction_payment_type" AS ENUM('immediate', 'pay_it_forward', 'goodwill');--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('pending', 'under_review', 'resolved_dismissed', 'resolved_warned', 'resolved_banned');--> statement-breakpoint
CREATE TYPE "public"."report_type" AS ENUM('suspicious_request', 'suspicious_helper', 'fraud', 'harassment', 'fake_profile', 'dangerous_behavior', 'spam', 'sos', 'other');--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"avatar_url" text,
	"is_helper" boolean DEFAULT false NOT NULL,
	"helper_mode_active" boolean DEFAULT false NOT NULL,
	"helper_status" text,
	"helper_skills" text[],
	"helper_languages" text[],
	"helper_qualifications" text[],
	"helper_bio" text,
	"helper_vehicle" text,
	"helper_social_links" text,
	"lat" real,
	"lng" real,
	"heading" real,
	"speed" real,
	"trust_score" real DEFAULT 50,
	"help_count" integer DEFAULT 0 NOT NULL,
	"neighborhood" text,
	"city" text,
	"benevolence_wallet" numeric(10, 2) DEFAULT 0 NOT NULL,
	"goodwill_score" integer DEFAULT 0 NOT NULL,
	"specialties" text[],
	"phone_masked" text,
	"quick_replies" text[],
	"identity_verified" boolean DEFAULT false NOT NULL,
	"identity_verification_status" text DEFAULT 'unverified',
	"background_check_status" text DEFAULT 'not_started',
	"background_check_completed_at" timestamp,
	"stripe_identity_session_id" text,
	"panic_contacts" text[],
	"passive_check_interval_min" integer DEFAULT 30,
	"is_admin" boolean DEFAULT false NOT NULL,
	"password_hash" text,
	"token_version" integer DEFAULT 0 NOT NULL,
	"approval_status" text DEFAULT 'pending' NOT NULL,
	"approval_reviewed_by" integer,
	"approval_reviewed_at" timestamp,
	"account_type" text DEFAULT 'individual' NOT NULL,
	"organization_name" text,
	"organization_description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "help_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"category" "help_request_category" DEFAULT 'other' NOT NULL,
	"urgency" "help_request_urgency" DEFAULT 'medium' NOT NULL,
	"status" "help_request_status" DEFAULT 'open' NOT NULL,
	"payment_type" "help_request_payment_type" DEFAULT 'pay_it_forward' NOT NULL,
	"requester_id" integer NOT NULL,
	"helper_id" integer,
	"lat" real NOT NULL,
	"lng" real NOT NULL,
	"neighborhood" text,
	"pay_it_forward_amount" numeric(10, 2),
	"pledge_amount" numeric(10, 2),
	"pledge_paid" numeric(10, 2) DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"claimed_at" timestamp,
	"en_route_at" timestamp,
	"arrived_at" timestamp,
	"completed_at" timestamp,
	"cancelled_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"request_id" integer,
	"type" text NOT NULL,
	"amount" numeric(10, 2) DEFAULT 0 NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scheduled_payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"request_id" integer NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"scheduled_date" timestamp NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"notif_nearby_requests" boolean DEFAULT true NOT NULL,
	"notif_emergency" boolean DEFAULT true NOT NULL,
	"notif_task_accepted" boolean DEFAULT true NOT NULL,
	"notif_wallet_updates" boolean DEFAULT true NOT NULL,
	"notif_community_activity" boolean DEFAULT false NOT NULL,
	"notif_pledge_reminders" boolean DEFAULT true NOT NULL,
	"privacy_profile_visible" boolean DEFAULT true NOT NULL,
	"privacy_live_location" boolean DEFAULT false NOT NULL,
	"privacy_activity_sharing" boolean DEFAULT true NOT NULL,
	"privacy_anonymous_giving" boolean DEFAULT false NOT NULL,
	"service_radius_miles" real DEFAULT 10 NOT NULL,
	"max_travel_miles" real DEFAULT 15,
	"specialties" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_settings_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "payment_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"request_id" integer NOT NULL,
	"helper_id" integer,
	"requester_id" integer NOT NULL,
	"amount" numeric(10, 2) DEFAULT 0 NOT NULL,
	"state" "payment_state" DEFAULT 'unpaid' NOT NULL,
	"payment_type" "payment_transaction_payment_type" DEFAULT 'pay_it_forward' NOT NULL,
	"stripe_payment_intent_id" text,
	"stripe_transfer_id" text,
	"stripe_charge_id" text,
	"amount_repaid" numeric(10, 2) DEFAULT 0 NOT NULL,
	"sponsored_by" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stripe_accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"stripe_account_id" text NOT NULL,
	"account_type" text DEFAULT 'express' NOT NULL,
	"charges_enabled" boolean DEFAULT false NOT NULL,
	"payouts_enabled" boolean DEFAULT false NOT NULL,
	"details_submitted" boolean DEFAULT false NOT NULL,
	"onboarding_url" text,
	"onboarding_url_expires" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "stripe_accounts_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "stripe_accounts_stripe_account_id_unique" UNIQUE("stripe_account_id")
);
--> statement-breakpoint
CREATE TABLE "gratitude_posts" (
	"id" serial PRIMARY KEY NOT NULL,
	"request_id" integer,
	"author_id" integer NOT NULL,
	"author_name" text NOT NULL,
	"author_avatar" text,
	"helper_id" integer,
	"helper_name" text,
	"message" text NOT NULL,
	"request_title" text,
	"likes" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gratitude_likes" (
	"id" serial PRIMARY KEY NOT NULL,
	"post_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"reporter_id" integer,
	"reported_user_id" integer,
	"reported_request_id" integer,
	"type" "report_type" NOT NULL,
	"description" text NOT NULL,
	"status" "report_status" DEFAULT 'pending' NOT NULL,
	"admin_notes" text,
	"reviewed_by" integer,
	"reviewed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "civic_resources" (
	"id" serial PRIMARY KEY NOT NULL,
	"state" text NOT NULL,
	"county" text NOT NULL,
	"city" text,
	"org_name" text NOT NULL,
	"description" text,
	"url" text NOT NULL,
	"phone" text,
	"category" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"request_id" integer NOT NULL,
	"sender_id" integer NOT NULL,
	"content" text NOT NULL,
	"sent_at" timestamp DEFAULT now() NOT NULL,
	"read_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"endpoint" text NOT NULL,
	"subscription" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "push_subscriptions_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
CREATE TABLE "ratings" (
	"id" serial PRIMARY KEY NOT NULL,
	"request_id" integer NOT NULL,
	"rater_id" integer NOT NULL,
	"ratee_id" integer NOT NULL,
	"stars" integer NOT NULL,
	"review" text,
	"role" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ratings_rater_request_unique" UNIQUE("request_id","rater_id"),
	CONSTRAINT "ratings_stars_range" CHECK ("ratings"."stars" BETWEEN 1 AND 5)
);
--> statement-breakpoint
CREATE TABLE "civic_suggestions" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"category" text,
	"description" text,
	"phone" text,
	"website" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"admin_notes" text,
	"reviewed_by" integer,
	"reviewed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recurring_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"category" text DEFAULT 'other' NOT NULL,
	"payment_type" text DEFAULT 'goodwill' NOT NULL,
	"pay_it_forward_amount" numeric(10, 2),
	"lat" real NOT NULL,
	"lng" real NOT NULL,
	"neighborhood" text,
	"recurrence" text DEFAULT 'weekly' NOT NULL,
	"day_of_week" integer,
	"time_of_day" text DEFAULT '09:00' NOT NULL,
	"next_fire_at" timestamp NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"last_fired_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crisis_state" (
	"id" serial PRIMARY KEY NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"message" text DEFAULT '' NOT NULL,
	"level" text DEFAULT 'warning' NOT NULL,
	"resources" text,
	"activated_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "password_reset_codes" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"failed_attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "help_requests" ADD CONSTRAINT "help_requests_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "help_requests" ADD CONSTRAINT "help_requests_helper_id_users_id_fk" FOREIGN KEY ("helper_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_payments" ADD CONSTRAINT "scheduled_payments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_helper_id_users_id_fk" FOREIGN KEY ("helper_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stripe_accounts" ADD CONSTRAINT "stripe_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gratitude_posts" ADD CONSTRAINT "gratitude_posts_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gratitude_posts" ADD CONSTRAINT "gratitude_posts_helper_id_users_id_fk" FOREIGN KEY ("helper_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gratitude_likes" ADD CONSTRAINT "gratitude_likes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reported_user_id_users_id_fk" FOREIGN KEY ("reported_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_rater_id_users_id_fk" FOREIGN KEY ("rater_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_ratee_id_users_id_fk" FOREIGN KEY ("ratee_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "civic_suggestions" ADD CONSTRAINT "civic_suggestions_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_requests" ADD CONSTRAINT "recurring_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset_codes" ADD CONSTRAINT "password_reset_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "users_is_helper_idx" ON "users" USING btree ("is_helper");--> statement-breakpoint
CREATE INDEX "users_helper_mode_active_idx" ON "users" USING btree ("helper_mode_active");--> statement-breakpoint
CREATE INDEX "users_helper_status_idx" ON "users" USING btree ("helper_status");--> statement-breakpoint
CREATE INDEX "users_approval_status_idx" ON "users" USING btree ("approval_status");--> statement-breakpoint
CREATE INDEX "users_account_type_idx" ON "users" USING btree ("account_type");--> statement-breakpoint
CREATE INDEX "help_requests_status_idx" ON "help_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "help_requests_requester_id_idx" ON "help_requests" USING btree ("requester_id");--> statement-breakpoint
CREATE INDEX "help_requests_helper_id_idx" ON "help_requests" USING btree ("helper_id");--> statement-breakpoint
CREATE INDEX "help_requests_created_at_idx" ON "help_requests" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "help_requests_lat_lng_idx" ON "help_requests" USING btree ("lat","lng");--> statement-breakpoint
CREATE INDEX "transactions_user_id_idx" ON "transactions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "transactions_request_id_idx" ON "transactions" USING btree ("request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "gratitude_likes_post_user_unique" ON "gratitude_likes" USING btree ("post_id","user_id");--> statement-breakpoint
CREATE INDEX "reports_reporter_id_idx" ON "reports" USING btree ("reporter_id");--> statement-breakpoint
CREATE INDEX "reports_reported_user_id_idx" ON "reports" USING btree ("reported_user_id");--> statement-breakpoint
CREATE INDEX "reports_reported_request_id_idx" ON "reports" USING btree ("reported_request_id");--> statement-breakpoint
CREATE INDEX "reports_status_idx" ON "reports" USING btree ("status");--> statement-breakpoint
CREATE INDEX "reports_created_at_idx" ON "reports" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "chat_messages_request_id_idx" ON "chat_messages" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "recurring_requests_user_id_idx" ON "recurring_requests" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "recurring_requests_next_fire_at_idx" ON "recurring_requests" USING btree ("next_fire_at");--> statement-breakpoint
CREATE INDEX "recurring_requests_active_idx" ON "recurring_requests" USING btree ("active");--> statement-breakpoint
CREATE INDEX "password_reset_codes_user_id_idx" ON "password_reset_codes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "password_reset_codes_expires_at_idx" ON "password_reset_codes" USING btree ("expires_at");