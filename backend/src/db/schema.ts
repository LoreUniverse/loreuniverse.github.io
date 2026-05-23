import { pgTable, text, boolean, timestamp } from 'drizzle-orm/pg-core';

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

// Exports for Better Auth introspection
export const schema = { users, sessions, accounts, verifications };
