CREATE TABLE "chapter_reads" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "chapter_id" uuid NOT NULL REFERENCES "chapters"("id") ON DELETE CASCADE,
  "read_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "chapter_reads_user_chapter_unique" UNIQUE("user_id","chapter_id")
);

CREATE INDEX "chapter_reads_user_idx" ON "chapter_reads" ("user_id");

CREATE TABLE "wiki_favorites" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "wiki_entry_id" uuid NOT NULL REFERENCES "wiki_entries"("id") ON DELETE CASCADE,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "wiki_favorites_user_entry_unique" UNIQUE("user_id","wiki_entry_id")
);

CREATE INDEX "wiki_favorites_user_idx" ON "wiki_favorites" ("user_id");
