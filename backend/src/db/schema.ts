import { pgTable, text, boolean, timestamp, uuid, uniqueIndex, index, integer, jsonb } from 'drizzle-orm/pg-core';

// ---------- USERS ----------
// Better Auth manages id/email/name/image/emailVerified. We add role/tier/banned columns.
export const users = pgTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  image: text('image'),
  emailVerified: boolean('email_verified').notNull().default(false),

  // Our additions
  role: text('role').notNull().default('user'), // 'user' | 'moderator' | 'admin'
  tier: text('tier').notNull().default('free'), // reserved for future membership tiers
  isBanned: boolean('is_banned').notNull().default(false),
  bannedAt: timestamp('banned_at', { withTimezone: true }),
  bannedReason: text('banned_reason'),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ---------- SESSIONS ----------
// Cookie-token-to-user mapping. Managed by Better Auth.
export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ---------- ACCOUNTS ----------
// OAuth provider links (empty initially; populated when social logins enabled).
export const accounts = pgTable('accounts', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
  scope: text('scope'),
  idToken: text('id_token'),
  password: text('password'), // for email+password account type
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ---------- VERIFICATIONS ----------
// Email-verification and password-reset tokens.
export const verifications = pgTable('verifications', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(), // typically the email
  value: text('value').notNull(),           // the token
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ---------- USER PERMISSIONS ----------
export const userPermissions = pgTable(
  'user_permissions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    permission: text('permission').notNull(),
    grantedBy: text('granted_by').references(() => users.id, { onDelete: 'set null' }),
    grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uqUserPerm: uniqueIndex('user_permissions_user_perm_unique').on(t.userId, t.permission),
  }),
);

// ---------- PERMISSION APPLICATIONS ----------
export const permissionApplications = pgTable(
  'permission_applications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    permission: text('permission').notNull(),
    justification: text('justification').notNull(),
    status: text('status').notNull().default('pending'),
    reviewedBy: text('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    reviewNote: text('review_note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    statusIdx: index('permission_applications_status_created_at').on(t.status, t.createdAt),
  }),
);

// ---------- API TOKENS ----------
export const apiTokens = pgTable(
  'api_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    prefix: text('prefix').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    prefixIdx: index('api_tokens_prefix_idx').on(t.prefix),
  }),
);

// ---------- AUDIT LOG ----------
export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actorUserId: text('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    targetType: text('target_type'),
    targetId: text('target_id'),
    metadata: text('metadata'),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    actorIdx: index('audit_log_actor_created_at').on(t.actorUserId, t.createdAt),
    actionIdx: index('audit_log_action_created_at').on(t.action, t.createdAt),
  }),
);

// ---------- BOOKS ----------
export const books = pgTable('books', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  coverImageUrl: text('cover_image_url'),
  externalLinks: jsonb('external_links').notNull().default({}),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  isPublished: boolean('is_published').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ---------- CHAPTERS ----------
export const chapters = pgTable(
  'chapters',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    bookId: uuid('book_id').notNull().references(() => books.id, { onDelete: 'cascade' }),
    chapterNumber: integer('chapter_number').notNull(),
    slug: text('slug').notNull(),
    title: text('title').notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uqBookSlug: uniqueIndex('chapters_book_slug_unique').on(t.bookId, t.slug),
  }),
);

// ---------- WIKI ENTRIES ----------
export const wikiEntries = pgTable(
  'wiki_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    category: text('category').notNull(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    frontMatter: jsonb('front_matter').notNull().default({}),
    body: text('body').notNull().default(''),
    isPublished: boolean('is_published').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uqCategorySlug: uniqueIndex('wiki_entries_category_slug_unique').on(t.category, t.slug),
  }),
);

// ---------- WIKI REVISIONS ----------
export const wikiRevisions = pgTable('wiki_revisions', {
  id: uuid('id').primaryKey().defaultRandom(),
  wikiEntryId: uuid('wiki_entry_id').notNull().references(() => wikiEntries.id, { onDelete: 'cascade' }),
  editorUserId: text('editor_user_id').references(() => users.id, { onDelete: 'set null' }),
  frontMatter: jsonb('front_matter').notNull().default({}),
  body: text('body').notNull().default(''),
  editSummary: text('edit_summary'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Exports for Better Auth introspection
export const schema = {
  users, sessions, accounts, verifications,
  userPermissions, permissionApplications, apiTokens, auditLog,
  books, chapters, wikiEntries, wikiRevisions,
};
