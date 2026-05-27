CREATE TABLE "chapter_reads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"chapter_id" uuid NOT NULL,
	"read_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chapter_reads_user_chapter_unique" UNIQUE("user_id","chapter_id")
);
--> statement-breakpoint
CREATE TABLE "wiki_favorites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"wiki_entry_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wiki_favorites_user_entry_unique" UNIQUE("user_id","wiki_entry_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "chapter_reads" ADD CONSTRAINT "chapter_reads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "chapter_reads" ADD CONSTRAINT "chapter_reads_chapter_id_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapters"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "wiki_favorites" ADD CONSTRAINT "wiki_favorites_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "wiki_favorites" ADD CONSTRAINT "wiki_favorites_wiki_entry_id_wiki_entries_id_fk" FOREIGN KEY ("wiki_entry_id") REFERENCES "public"."wiki_entries"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX "chapter_reads_user_idx" ON "chapter_reads" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "wiki_favorites_user_idx" ON "wiki_favorites" USING btree ("user_id");
