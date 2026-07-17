CREATE TABLE "nia_conversations" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"session_id" text NOT NULL,
	"user_message" text NOT NULL,
	"nia_response" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nia_memories" (
	"user_id" integer PRIMARY KEY NOT NULL,
	"memory" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "nia_conversations" ADD CONSTRAINT "nia_conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "nia_memories" ADD CONSTRAINT "nia_memories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "nia_conversations_session_idx" ON "nia_conversations" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "nia_conversations_created_at_idx" ON "nia_conversations" USING btree ("created_at");
