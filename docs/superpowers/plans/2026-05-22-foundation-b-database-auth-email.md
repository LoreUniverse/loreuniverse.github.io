# Foundation Plan B — Database, Auth, Email

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire up Postgres (Docker Compose locally, Neon in production), set up Drizzle, define the users schema with Better Auth's required columns plus our role/tier/ban additions, integrate Better Auth into the backend, integrate Resend for transactional email, implement email-verified sign-up / sign-in / sign-out / password-reset flows, and ship the lot to Fly.

**Architecture:** Postgres is the source of truth for all user state. Drizzle owns the schema (TypeScript-defined; SQL migrations generated) and provides the typed query layer. Better Auth runs as a Fastify plugin owning `/api/auth/*` routes; it uses Drizzle for storage and our email service for delivery. Resend is the email provider; we wrap it behind an `EmailSender` interface so tests inject a fake that records calls in memory. Email verification is required for sign-in. Password reset goes through the same email pathway.

**Tech Stack:** Drizzle ORM 0.36+, `drizzle-kit` 0.28+, `postgres` (postgres.js driver) 3.4+, Better Auth 1.0+, Resend SDK 4.0+, Vitest, Docker (Postgres 17), Neon, Fly.io secrets.

**References:**
- Spec: `docs/superpowers/specs/2026-05-22-foundational-backend-architecture-design.md` — see Data Model § users/sessions/accounts/verifications, and Request and Auth Flow § Better Auth integration.
- Plan A: `docs/superpowers/plans/2026-05-22-foundation-a-monorepo-restructure-and-backend-skeleton.md`. Plan A must be merged before starting B.

**Prerequisites before starting:**
1. Plan A is complete and merged. Backend deploys to `loreuniverse-api.fly.dev`. `GET /health` returns `{"status":"ok","modules":{}}`.
2. Sign up at https://neon.tech. Free tier is sufficient.
3. Sign up at https://resend.com. Free tier (3,000 emails/month) is sufficient.
4. Docker Desktop installed locally (you'll run a Postgres container).

---

## File Structure After This Plan

```
backend/
├── docker-compose.yml             # NEW (at repo root, not backend/ — see Task 1)
├── package.json                   # adds drizzle, better-auth, resend, postgres
├── drizzle.config.ts              # NEW
├── drizzle/                       # NEW — generated migrations live here
│   ├── 0000_initial.sql
│   └── meta/
├── .env.example                   # NEW — template for required env vars
└── src/
    ├── server.ts                  # registers DB + auth plugins
    ├── db/                        # NEW
    │   ├── client.ts              # Drizzle client factory
    │   ├── client.test.ts
    │   └── schema.ts              # all tables defined here (foundation-tier only)
    ├── features/                  # NEW
    │   ├── auth/                  # NEW
    │   │   ├── index.ts           # Fastify plugin
    │   │   ├── better-auth.ts     # Better Auth instance configuration
    │   │   ├── better-auth.test.ts
    │   │   └── README.md          # notes on the auth feature
    │   └── email/                 # NEW
    │       ├── index.ts           # Fastify plugin (none at present; service-only)
    │       ├── sender.ts          # EmailSender interface + real/fake impls
    │       └── sender.test.ts
    └── routes/
        ├── health.ts              # updated to include DB check
        └── health.test.ts         # updated
```

A note on `docker-compose.yml` placement: it lives at the **repo root**, not inside `backend/`. The compose file might later need to spin up additional services (Redis for rate limiting, MinIO for R2 local emulation), and putting it at the root means one `docker compose up` runs the whole local infra.

---

## Task 1: Add local Postgres via Docker Compose

**Files:**
- Create: `docker-compose.yml` (repo root)
- Create: `.env.example` (repo root) — template for local secrets

- [ ] **Step 1: Create branch and pull main.**

```bash
git checkout main
git pull
git checkout -b foundation-b-database-auth-email
```

- [ ] **Step 2: Create `docker-compose.yml` at the repo root.**

```yaml
services:
  postgres:
    image: postgres:17-alpine
    container_name: loreuniverse-postgres
    ports:
      - "5432:5432"
    environment:
      POSTGRES_USER: lore
      POSTGRES_PASSWORD: lore
      POSTGRES_DB: lore_dev
    volumes:
      - postgres-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U lore -d lore_dev"]
      interval: 5s
      timeout: 3s
      retries: 10

volumes:
  postgres-data:
```

- [ ] **Step 3: Start Postgres and verify.**

```bash
docker compose up -d
docker compose ps
```
Expected: `loreuniverse-postgres` container shows status `healthy` (may take ~10 seconds).

- [ ] **Step 4: Connect to verify.**

```bash
docker exec -it loreuniverse-postgres psql -U lore -d lore_dev -c "SELECT version();"
```
Expected: a `PostgreSQL 17.x ...` version string.

- [ ] **Step 5: Create the test database.**

```bash
docker exec -it loreuniverse-postgres psql -U lore -d lore_dev -c "CREATE DATABASE lore_test;"
```
Expected: `CREATE DATABASE`.

- [ ] **Step 6: Commit.**

```bash
git add docker-compose.yml
git commit -m "chore: add Docker Compose for local Postgres"
```

---

## Task 2: Set up environment variable templates

**Files:**
- Create: `backend/.env.example`
- Create: `backend/.env` (local only, gitignored)

- [ ] **Step 1: Create `backend/.env.example`.**

This is the committed template. The real `.env` is gitignored.

```bash
# Required at runtime
DATABASE_URL=postgres://lore:lore@localhost:5432/lore_dev
DATABASE_URL_TEST=postgres://lore:lore@localhost:5432/lore_test

# Better Auth
BETTER_AUTH_SECRET=replace-with-a-32-byte-random-string
BETTER_AUTH_URL=http://localhost:3000

# Resend (for production; tests use FakeEmailSender)
RESEND_API_KEY=replace-with-your-resend-key
EMAIL_FROM=Lore Universe <no-reply@your-domain-or-resend-default>

# CORS
ALLOWED_ORIGINS=http://localhost:8080

# Server
PORT=3000
HOST=0.0.0.0
LOG_LEVEL=info
NODE_ENV=development
```

- [ ] **Step 2: Generate a real `BETTER_AUTH_SECRET` value.**

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
Copy the output.

- [ ] **Step 3: Create `backend/.env` (gitignored) by copying the template.**

```bash
cp backend/.env.example backend/.env
```

Then edit `backend/.env`:
- Replace `BETTER_AUTH_SECRET` value with the hex string from Step 2.
- Leave `RESEND_API_KEY` as the placeholder for now (we use the fake sender in dev until Task 18).

- [ ] **Step 4: Confirm `.env` is gitignored.**

```bash
git check-ignore backend/.env
```
Expected: prints `backend/.env`. If not, add `.env` to `backend/.gitignore` (it should already be there from Plan A; verify).

- [ ] **Step 5: Commit the template only.**

```bash
git add backend/.env.example
git commit -m "chore(backend): add .env.example template"
```

---

## Task 3: Install Drizzle, postgres driver, and dev dependencies

**Files:**
- Modify: `backend/package.json`

- [ ] **Step 1: Install runtime deps.**

```bash
cd backend
npm install drizzle-orm postgres dotenv
cd ..
```

- [ ] **Step 2: Install dev deps.**

```bash
cd backend
npm install -D drizzle-kit @types/pg
cd ..
```

- [ ] **Step 3: Verify `backend/package.json` lists the new packages.**

```bash
cat backend/package.json
```
Expected: `drizzle-orm`, `postgres`, `dotenv` in `dependencies`; `drizzle-kit`, `@types/pg` in `devDependencies`.

- [ ] **Step 4: Commit.**

```bash
git add backend/package.json backend/package-lock.json
git commit -m "chore(backend): add drizzle, postgres driver, dotenv"
```

---

## Task 4: Configure `drizzle-kit`

**Files:**
- Create: `backend/drizzle.config.ts`

- [ ] **Step 1: Create `backend/drizzle.config.ts`.**

```ts
import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error('DATABASE_URL is required in drizzle.config.ts');
}

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url },
  verbose: true,
  strict: true,
});
```

- [ ] **Step 2: Sanity check the config loads.**

```bash
cd backend
npx drizzle-kit --help
cd ..
```
Expected: drizzle-kit prints its help banner (no schema yet, so don't generate anything yet — just confirm the binary works).

- [ ] **Step 3: Commit.**

```bash
git add backend/drizzle.config.ts
git commit -m "chore(backend): add drizzle.config.ts"
```

---

## Task 5: Define the Better Auth-compatible schema with our additions

**Files:**
- Create: `backend/src/db/schema.ts`

- [ ] **Step 1: Create `backend/src/db/schema.ts`.**

This file holds every table. We start with Better Auth's required tables (`users`, `sessions`, `accounts`, `verifications`) and add our user columns (`role`, `tier`, `is_banned`, etc.). Per the Lorekeeper/Library convention, table names stay lowercase + snake_case throughout.

```ts
import { pgTable, text, boolean, timestamp, integer, uuid } from 'drizzle-orm/pg-core';

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
```

- [ ] **Step 2: Verify it typechecks.**

```bash
cd backend
npm run typecheck
cd ..
```
Expected: no errors.

- [ ] **Step 3: Commit.**

```bash
git add backend/src/db/schema.ts
git commit -m "feat(backend): define Better Auth schema + our user additions"
```

---

## Task 6: Generate and apply the first migration

**Files:**
- Create: `backend/drizzle/0000_initial.sql` (generated)
- Create: `backend/drizzle/meta/*` (generated)

- [ ] **Step 1: Generate the migration.**

```bash
cd backend
npx drizzle-kit generate --name initial
cd ..
```
Expected: a new file `backend/drizzle/0000_initial.sql` created. Look at it:

```bash
cat backend/drizzle/0000_initial.sql
```
Expected: `CREATE TABLE` statements for `users`, `sessions`, `accounts`, `verifications` with the columns from `schema.ts`.

- [ ] **Step 2: Apply the migration locally.**

```bash
cd backend
npx drizzle-kit migrate
cd ..
```
Expected: prints applied migration. Then verify:

```bash
docker exec -it loreuniverse-postgres psql -U lore -d lore_dev -c "\dt"
```
Expected: lists the four tables.

- [ ] **Step 3: Commit the migration.**

```bash
git add backend/drizzle/
git commit -m "feat(backend): add initial migration for users/sessions/accounts/verifications"
```

---

## Task 7: Create the Drizzle client module with a failing test

**Files:**
- Create: `backend/src/db/client.ts`
- Create: `backend/src/db/client.test.ts`

- [ ] **Step 1: Write the failing test first.**

Create `backend/src/db/client.test.ts`:

```ts
import 'dotenv/config';
import { describe, it, expect, afterAll } from 'vitest';
import { createDb, closeDb } from './client.js';

describe('createDb', () => {
  afterAll(async () => {
    await closeDb();
  });

  it('returns a connected Drizzle client given DATABASE_URL', async () => {
    const url = process.env.DATABASE_URL_TEST;
    expect(url, 'DATABASE_URL_TEST must be set').toBeTruthy();
    const db = createDb(url!);
    const result = await db.execute<{ now: Date }>("SELECT now() AS now");
    expect(result.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run the test, verify it fails.**

```bash
cd backend
npm test
cd ..
```
Expected: FAIL with "Cannot find module './client.js'".

- [ ] **Step 3: Implement `backend/src/db/client.ts`.**

```ts
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { schema } from './schema.js';

type DrizzleClient = ReturnType<typeof drizzle<typeof schema>>;

let _connections: postgres.Sql[] = [];

export function createDb(url: string): DrizzleClient {
  const sql = postgres(url, {
    max: 5,
    idle_timeout: 20,
    connect_timeout: 10,
  });
  _connections.push(sql);
  return drizzle(sql, { schema });
}

export async function closeDb(): Promise<void> {
  for (const sql of _connections) {
    await sql.end({ timeout: 5 });
  }
  _connections = [];
}
```

- [ ] **Step 4: Run the test, verify it passes.**

```bash
cd backend
npm test
cd ..
```
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add backend/src/db/client.ts backend/src/db/client.test.ts
git commit -m "feat(backend): add Drizzle client factory and connection test"
```

---

## Task 8: Add the EmailSender interface with a fake implementation and a real one

**Files:**
- Create: `backend/src/features/email/sender.ts`
- Create: `backend/src/features/email/sender.test.ts`

- [ ] **Step 1: Install Resend SDK.**

```bash
cd backend
npm install resend
cd ..
```

- [ ] **Step 2: Write the failing tests first.**

Create `backend/src/features/email/sender.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { FakeEmailSender, createEmailSender } from './sender.js';

describe('FakeEmailSender', () => {
  it('records sent emails in memory', async () => {
    const sender = new FakeEmailSender();
    await sender.send({
      to: 'alice@example.com',
      subject: 'Verify your email',
      html: '<p>Link</p>',
      text: 'Link',
    });
    expect(sender.sent).toHaveLength(1);
    expect(sender.sent[0].to).toBe('alice@example.com');
    expect(sender.sent[0].subject).toBe('Verify your email');
  });

  it('clears the buffer', async () => {
    const sender = new FakeEmailSender();
    await sender.send({ to: 'a@b.com', subject: 's', html: 'h', text: 't' });
    sender.clear();
    expect(sender.sent).toHaveLength(0);
  });
});

describe('createEmailSender', () => {
  it('returns FakeEmailSender when NODE_ENV is test', () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';
    const sender = createEmailSender();
    expect(sender).toBeInstanceOf(FakeEmailSender);
    process.env.NODE_ENV = original;
  });
});
```

- [ ] **Step 3: Run the tests, verify they fail.**

```bash
cd backend
npm test
cd ..
```
Expected: FAIL with module-not-found error.

- [ ] **Step 4: Implement `backend/src/features/email/sender.ts`.**

```ts
import { Resend } from 'resend';

export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}

export class FakeEmailSender implements EmailSender {
  public sent: EmailMessage[] = [];

  async send(message: EmailMessage): Promise<void> {
    this.sent.push({ ...message });
  }

  clear(): void {
    this.sent = [];
  }
}

export class ResendEmailSender implements EmailSender {
  private readonly client: Resend;
  private readonly from: string;

  constructor(apiKey: string, from: string) {
    this.client = new Resend(apiKey);
    this.from = from;
  }

  async send(message: EmailMessage): Promise<void> {
    const { error } = await this.client.emails.send({
      from: this.from,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });
    if (error) {
      throw new Error(`Resend send failed: ${error.message}`);
    }
  }
}

export function createEmailSender(): EmailSender {
  if (process.env.NODE_ENV === 'test') {
    return new FakeEmailSender();
  }
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || key.startsWith('replace-')) {
    // Dev fallback: log to console instead of attempting a real send
    return {
      async send(message) {
        // eslint-disable-next-line no-console
        console.log('[email:dev]', message.to, '-', message.subject, '\n', message.text);
      },
    };
  }
  if (!from) {
    throw new Error('EMAIL_FROM is required when RESEND_API_KEY is set');
  }
  return new ResendEmailSender(key, from);
}
```

- [ ] **Step 5: Run the tests, verify they pass.**

```bash
cd backend
NODE_ENV=test npm test
cd ..
```
Expected: all tests pass.

- [ ] **Step 6: Commit.**

```bash
git add backend/src/features/email/sender.ts backend/src/features/email/sender.test.ts backend/package.json backend/package-lock.json
git commit -m "feat(backend): add EmailSender with Fake/Resend/Dev implementations"
```

---

## Task 9: Install Better Auth

**Files:**
- Modify: `backend/package.json`

- [ ] **Step 1: Install.**

```bash
cd backend
npm install better-auth
cd ..
```

- [ ] **Step 2: Verify the version installed is 1.x.**

```bash
cd backend
npm list better-auth
cd ..
```
Expected: a version starting with `1.` printed. If it's older, force-upgrade: `npm install better-auth@latest`.

- [ ] **Step 3: Commit.**

```bash
git add backend/package.json backend/package-lock.json
git commit -m "chore(backend): add better-auth"
```

---

## Task 10: Configure the Better Auth instance

**Files:**
- Create: `backend/src/features/auth/better-auth.ts`

- [ ] **Step 1: Create the config module.**

```ts
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import type { drizzle } from 'drizzle-orm/postgres-js';
import { schema } from '../../db/schema.js';
import { createEmailSender, type EmailSender } from '../email/sender.js';

type Db = ReturnType<typeof drizzle<typeof schema>>;

export type AuthConfig = {
  db: Db;
  baseUrl: string;
  secret: string;
  emailSender?: EmailSender;
};

export function createAuth(config: AuthConfig) {
  const sender = config.emailSender ?? createEmailSender();

  return betterAuth({
    database: drizzleAdapter(config.db, {
      provider: 'pg',
      // Better Auth's drizzle adapter expects schema keys named `user`, `session`,
      // `account`, `verification` (singular) by default. We use plural table names
      // throughout our codebase, so we map them explicitly here. (Better Auth also
      // exposes a `usePlural: true` option but explicit mapping is more portable
      // across Better Auth versions.)
      schema: {
        user: schema.users,
        session: schema.sessions,
        account: schema.accounts,
        verification: schema.verifications,
      },
    }),
    baseURL: config.baseUrl,
    secret: config.secret,
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      autoSignIn: false,
      sendResetPassword: async ({ user, url }) => {
        await sender.send({
          to: user.email,
          subject: 'Reset your Lore Universe password',
          html: `<p>Hi ${user.name ?? ''},</p>
            <p>Click <a href="${url}">this link</a> to reset your password.</p>
            <p>If you didn't request this, you can ignore this email.</p>`,
          text: `Hi ${user.name ?? ''},

Click the following link to reset your password:
${url}

If you didn't request this, you can ignore this email.`,
        });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => {
        await sender.send({
          to: user.email,
          subject: 'Verify your Lore Universe account',
          html: `<p>Welcome to Lore Universe, ${user.name ?? ''}!</p>
            <p>Verify your email by clicking <a href="${url}">this link</a>.</p>`,
          text: `Welcome to Lore Universe, ${user.name ?? ''}!

Verify your email by visiting this link:
${url}`,
        });
      },
    },
    user: {
      additionalFields: {
        role: { type: 'string', defaultValue: 'user', input: false },
        tier: { type: 'string', defaultValue: 'free', input: false },
        isBanned: { type: 'boolean', defaultValue: false, input: false, fieldName: 'is_banned' },
        bannedAt: { type: 'date', required: false, input: false, fieldName: 'banned_at' },
        bannedReason: { type: 'string', required: false, input: false, fieldName: 'banned_reason' },
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7, // 7 days
      updateAge: 60 * 60 * 24,      // refresh sliding window once per day
    },
    trustedOrigins: (process.env.ALLOWED_ORIGINS ?? '').split(',').filter(Boolean),
  });
}

export type AuthInstance = ReturnType<typeof createAuth>;
```

- [ ] **Step 2: Typecheck.**

```bash
cd backend
npm run typecheck
cd ..
```
Expected: no errors.

- [ ] **Step 3: Commit.**

```bash
git add backend/src/features/auth/better-auth.ts
git commit -m "feat(backend): configure Better Auth instance with email verification + reset"
```

---

## Task 11: Register the auth plugin in Fastify

**Files:**
- Create: `backend/src/features/auth/index.ts`
- Modify: `backend/src/server.ts`

- [ ] **Step 1: Create the auth Fastify plugin.**

```ts
import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { createAuth, type AuthInstance } from './better-auth.js';
import { createDb } from '../../db/client.js';

declare module 'fastify' {
  interface FastifyInstance {
    auth: AuthInstance;
  }
}

export type AuthPluginOptions = {
  databaseUrl: string;
  baseUrl: string;
  secret: string;
};

async function authPlugin(app: FastifyInstance, opts: AuthPluginOptions) {
  const db = createDb(opts.databaseUrl);
  const auth = createAuth({ db, baseUrl: opts.baseUrl, secret: opts.secret });
  app.decorate('auth', auth);

  // Mount Better Auth's HTTP handler at /api/auth/*
  app.all('/api/auth/*', async (request, reply) => {
    const url = new URL(request.url, opts.baseUrl);
    const headers = new Headers();
    for (const [key, value] of Object.entries(request.headers)) {
      if (Array.isArray(value)) headers.set(key, value.join(', '));
      else if (value) headers.set(key, value);
    }
    const body = ['GET', 'HEAD'].includes(request.method)
      ? undefined
      : JSON.stringify(request.body);

    const webRequest = new Request(url, {
      method: request.method,
      headers,
      body,
    });

    const webResponse = await auth.handler(webRequest);
    reply.status(webResponse.status);

    // Better Auth may set multiple cookies in one response (session + CSRF).
    // The standard Headers.forEach collapses same-named headers into one value,
    // so we use getSetCookie() (Node 18.14+) to grab them all individually.
    const setCookies = typeof webResponse.headers.getSetCookie === 'function'
      ? webResponse.headers.getSetCookie()
      : [];
    if (setCookies.length > 0) {
      reply.header('set-cookie', setCookies);
    }

    webResponse.headers.forEach((value, key) => {
      if (key.toLowerCase() === 'set-cookie') return; // already handled above
      reply.header(key, value);
    });

    const responseBody = await webResponse.text();
    reply.send(responseBody);
  });
}

export default fp(authPlugin, { name: 'auth' });
```

- [ ] **Step 2: Install `fastify-plugin`.**

```bash
cd backend
npm install fastify-plugin
cd ..
```

- [ ] **Step 3: Update `backend/src/server.ts` to register the plugin.**

Replace the contents of `backend/src/server.ts` with:

```ts
import 'dotenv/config';
import Fastify from 'fastify';
import { registerHealthRoute } from './routes/health.js';
import authPlugin from './features/auth/index.js';

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? '0.0.0.0';

async function buildServer() {
  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL ?? 'info' },
  });

  const databaseUrl = process.env.DATABASE_URL;
  const baseUrl = process.env.BETTER_AUTH_URL;
  const secret = process.env.BETTER_AUTH_SECRET;

  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  if (!baseUrl) throw new Error('BETTER_AUTH_URL is required');
  if (!secret) throw new Error('BETTER_AUTH_SECRET is required');

  await app.register(authPlugin, { databaseUrl, baseUrl, secret });
  await registerHealthRoute(app);

  return app;
}

async function start() {
  const app = await buildServer();
  try {
    await app.listen({ port: PORT, host: HOST });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();

export { buildServer };
```

- [ ] **Step 4: Run the server locally and sanity check.**

```bash
cd backend
npm run dev
```

In a separate terminal:
```bash
curl -s http://localhost:3000/health
curl -s http://localhost:3000/api/auth/ok
```
Expected:
- `/health` returns `{"status":"ok","modules":{}}`.
- `/api/auth/ok` returns something from Better Auth's handler (often `{"ok":true}` or similar; the exact path may differ — check Better Auth docs version installed).

Stop the server with Ctrl+C, then:
```bash
cd ..
```

- [ ] **Step 5: Commit.**

```bash
git add backend/src/features/auth/index.ts backend/src/server.ts backend/package.json backend/package-lock.json
git commit -m "feat(backend): register Better Auth as a Fastify plugin"
```

---

## Task 12: Add a sign-up integration test

**Files:**
- Create: `backend/src/features/auth/better-auth.test.ts`

- [ ] **Step 1: Write the failing test.**

```ts
import 'dotenv/config';
import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import { createDb, closeDb } from '../../db/client.js';
import { schema } from '../../db/schema.js';
import { createAuth } from './better-auth.js';
import { FakeEmailSender } from '../email/sender.js';

describe('Better Auth sign-up', () => {
  let app: FastifyInstance;
  let email: FakeEmailSender;
  const baseUrl = 'http://localhost:3000';
  const testEmail = `signup-${Date.now()}@example.com`;

  beforeAll(async () => {
    const url = process.env.DATABASE_URL_TEST!;
    const db = createDb(url);

    // Wipe accumulated test data from previous runs. CASCADE removes
    // dependent sessions/accounts/verifications automatically.
    await db.execute(sql`TRUNCATE TABLE users CASCADE`);

    email = new FakeEmailSender();
    const auth = createAuth({
      db,
      baseUrl,
      secret: 'test-secret-32-bytes-long-aaaaaaaa',
      emailSender: email,
    });

    app = Fastify();
    app.all('/api/auth/*', async (req, reply) => {
      const url = new URL(req.url, baseUrl);
      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers)) {
        if (Array.isArray(v)) headers.set(k, v.join(', '));
        else if (v) headers.set(k, String(v));
      }
      const body = ['GET','HEAD'].includes(req.method) ? undefined : JSON.stringify(req.body);
      const webReq = new Request(url, { method: req.method, headers, body });
      const webRes = await auth.handler(webReq);
      reply.status(webRes.status);

      const setCookies = typeof webRes.headers.getSetCookie === 'function'
        ? webRes.headers.getSetCookie()
        : [];
      if (setCookies.length > 0) reply.header('set-cookie', setCookies);

      webRes.headers.forEach((value, key) => {
        if (key.toLowerCase() === 'set-cookie') return;
        reply.header(key, value);
      });
      reply.send(await webRes.text());
    });
    await app.ready();
  });

  beforeEach(() => {
    email.clear();
  });

  afterAll(async () => {
    await app.close();
    await closeDb();
  });

  it('creates an unverified user and sends a verification email', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      payload: {
        email: testEmail,
        password: 'CorrectHorse-Battery-Staple-9',
        name: 'Test User',
      },
      headers: { 'content-type': 'application/json' },
    });

    expect(response.statusCode).toBe(200);
    expect(email.sent).toHaveLength(1);
    expect(email.sent[0].to).toBe(testEmail);
    expect(email.sent[0].subject).toMatch(/verify/i);
    expect(email.sent[0].text).toContain('http'); // contains a verification link
  });
});
```

- [ ] **Step 2: Run the test, verify it fails because the DB doesn't have migrations applied to the TEST schema yet.**

```bash
cd backend
NODE_ENV=test npm test -- --run features/auth
cd ..
```
Expected: FAIL with a Postgres error like "relation 'users' does not exist" — because the test DB hasn't been migrated.

- [ ] **Step 3: Apply migrations to the test database.**

```bash
cd backend
DATABASE_URL="postgres://lore:lore@localhost:5432/lore_test" npx drizzle-kit migrate
cd ..
```
Expected: migration applied.

- [ ] **Step 4: Re-run the test, verify it passes.**

```bash
cd backend
NODE_ENV=test npm test -- --run features/auth
cd ..
```
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add backend/src/features/auth/better-auth.test.ts
git commit -m "test(backend): assert sign-up creates user + sends verification email"
```

---

## Task 13: Add a sign-in test (requires verified email)

**Files:**
- Modify: `backend/src/features/auth/better-auth.test.ts`

- [ ] **Step 1: Add a sign-in test to the existing file.**

Append the following inside the same `describe('Better Auth sign-up')` block (or split into a new describe — your call). For simplicity, keep it together:

```ts
  it('rejects sign-in for an unverified user', async () => {
    const unverifiedEmail = `unverified-${Date.now()}@example.com`;
    await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      payload: { email: unverifiedEmail, password: 'CorrectHorse-Battery-Staple-9', name: 'U' },
      headers: { 'content-type': 'application/json' },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      payload: { email: unverifiedEmail, password: 'CorrectHorse-Battery-Staple-9' },
      headers: { 'content-type': 'application/json' },
    });

    expect(response.statusCode).toBeGreaterThanOrEqual(400);
  });

  it('allows sign-in for a verified user and sets a session cookie', async () => {
    const verifiedEmail = `verified-${Date.now()}@example.com`;

    // Sign up
    await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      payload: { email: verifiedEmail, password: 'CorrectHorse-Battery-Staple-9', name: 'V' },
      headers: { 'content-type': 'application/json' },
    });

    // Extract verification link from email
    const link = email.sent.at(-1)?.text.match(/https?:\/\/\S+/)?.[0];
    expect(link, 'verification link in email').toBeTruthy();

    // Hit the verification URL
    const verifyUrl = new URL(link!);
    const verifyResponse = await app.inject({
      method: 'GET',
      url: verifyUrl.pathname + verifyUrl.search,
    });
    expect(verifyResponse.statusCode).toBeLessThan(400);

    // Sign in
    const signInResponse = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      payload: { email: verifiedEmail, password: 'CorrectHorse-Battery-Staple-9' },
      headers: { 'content-type': 'application/json' },
    });

    expect(signInResponse.statusCode).toBe(200);
    const setCookie = signInResponse.headers['set-cookie'];
    expect(setCookie).toBeTruthy();
    const cookieStr = Array.isArray(setCookie) ? setCookie.join(';') : String(setCookie);
    expect(cookieStr).toMatch(/session/i);
  });
```

- [ ] **Step 2: Run tests, verify all pass.**

```bash
cd backend
NODE_ENV=test npm test -- --run features/auth
cd ..
```
Expected: all three tests pass.

- [ ] **Step 3: Commit.**

```bash
git add backend/src/features/auth/better-auth.test.ts
git commit -m "test(backend): sign-in rejects unverified, accepts verified user"
```

---

## Task 14: Add a password reset test

**Files:**
- Modify: `backend/src/features/auth/better-auth.test.ts`

- [ ] **Step 1: Add the test.**

```ts
  it('sends a password reset email and allows resetting', async () => {
    const resetEmail = `reset-${Date.now()}@example.com`;
    const originalPassword = 'CorrectHorse-Battery-Staple-9';
    const newPassword = 'A-Totally-Different-Password-42';

    // Sign up
    await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      payload: { email: resetEmail, password: originalPassword, name: 'R' },
      headers: { 'content-type': 'application/json' },
    });

    // Verify (so we can sign in later to check the password works)
    const verifyLink = email.sent.at(-1)?.text.match(/https?:\/\/\S+/)?.[0];
    const verifyUrl = new URL(verifyLink!);
    await app.inject({ method: 'GET', url: verifyUrl.pathname + verifyUrl.search });

    email.clear();

    // Request password reset
    const requestResp = await app.inject({
      method: 'POST',
      url: '/api/auth/forget-password',
      payload: { email: resetEmail, redirectTo: '/' },
      headers: { 'content-type': 'application/json' },
    });
    expect(requestResp.statusCode).toBe(200);
    expect(email.sent).toHaveLength(1);
    expect(email.sent[0].subject).toMatch(/reset/i);

    // Use the reset link
    const resetLink = email.sent[0].text.match(/https?:\/\/\S+/)?.[0];
    expect(resetLink).toBeTruthy();
    const resetUrl = new URL(resetLink!);
    const token = resetUrl.searchParams.get('token');
    expect(token, 'reset token in URL').toBeTruthy();

    const resetResp = await app.inject({
      method: 'POST',
      url: '/api/auth/reset-password',
      payload: { token, newPassword },
      headers: { 'content-type': 'application/json' },
    });
    expect(resetResp.statusCode).toBe(200);

    // Sign in with new password
    const signInResp = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      payload: { email: resetEmail, password: newPassword },
      headers: { 'content-type': 'application/json' },
    });
    expect(signInResp.statusCode).toBe(200);
  });
```

- [ ] **Step 2: Run tests.**

```bash
cd backend
NODE_ENV=test npm test -- --run features/auth
cd ..
```
Expected: all four tests pass.

- [ ] **Step 3: Commit.**

```bash
git add backend/src/features/auth/better-auth.test.ts
git commit -m "test(backend): password reset flow end-to-end"
```

---

## Task 15: Add a sign-out test

**Files:**
- Modify: `backend/src/features/auth/better-auth.test.ts`

- [ ] **Step 1: Add the test.**

```ts
  it('signs out and clears the session cookie', async () => {
    const signOutEmail = `signout-${Date.now()}@example.com`;
    const password = 'CorrectHorse-Battery-Staple-9';

    // Sign up + verify
    await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      payload: { email: signOutEmail, password, name: 'S' },
      headers: { 'content-type': 'application/json' },
    });
    const link = email.sent.at(-1)?.text.match(/https?:\/\/\S+/)?.[0];
    const url = new URL(link!);
    await app.inject({ method: 'GET', url: url.pathname + url.search });

    // Sign in and grab the cookie
    const signInResp = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      payload: { email: signOutEmail, password },
      headers: { 'content-type': 'application/json' },
    });
    const setCookie = signInResp.headers['set-cookie'];
    const cookieStr = Array.isArray(setCookie) ? setCookie.join('; ') : String(setCookie);

    // Sign out using the cookie
    const signOutResp = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-out',
      headers: { cookie: cookieStr, 'content-type': 'application/json' },
    });
    expect(signOutResp.statusCode).toBe(200);

    // Confirm the response clears the session cookie
    const clearCookie = signOutResp.headers['set-cookie'];
    expect(clearCookie).toBeTruthy();
  });
```

- [ ] **Step 2: Run tests.**

```bash
cd backend
NODE_ENV=test npm test -- --run features/auth
cd ..
```
Expected: all five tests pass.

- [ ] **Step 3: Commit.**

```bash
git add backend/src/features/auth/better-auth.test.ts
git commit -m "test(backend): sign-out clears session cookie"
```

---

## Task 16: Update the health endpoint to include DB check

**Files:**
- Modify: `backend/src/routes/health.ts`
- Modify: `backend/src/routes/health.test.ts`

- [ ] **Step 1: Update the failing tests first.**

Replace `backend/src/routes/health.test.ts` with:

```ts
import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerHealthRoute } from './health.js';
import { createDb, closeDb } from '../db/client.js';

describe('GET /health', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const url = process.env.DATABASE_URL_TEST!;
    const db = createDb(url);
    app = Fastify();
    app.decorate('db', db);
    await registerHealthRoute(app);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await closeDb();
  });

  it('returns 200 with status ok and db module healthy', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.status).toBe('ok');
    expect(body.modules.db.status).toBe('ok');
    expect(typeof body.modules.db.latency_ms).toBe('number');
  });
});
```

- [ ] **Step 2: Run, verify it fails (current health endpoint doesn't check DB).**

```bash
cd backend
NODE_ENV=test npm test -- --run routes/health
cd ..
```
Expected: FAIL.

- [ ] **Step 3: Update `backend/src/routes/health.ts`.**

```ts
import type { FastifyInstance } from 'fastify';
import type { drizzle } from 'drizzle-orm/postgres-js';
import type { schema } from '../db/schema.js';

type Db = ReturnType<typeof drizzle<typeof schema>>;

declare module 'fastify' {
  interface FastifyInstance {
    db: Db;
  }
}

export async function registerHealthRoute(app: FastifyInstance): Promise<void> {
  app.get('/health', async () => {
    const dbCheck = await checkDb(app.db);
    const overallOk = dbCheck.status === 'ok';
    return {
      status: overallOk ? 'ok' : 'down',
      modules: { db: dbCheck },
    };
  });
}

async function checkDb(db: Db): Promise<{ status: 'ok' | 'down'; latency_ms: number; error?: string }> {
  const start = Date.now();
  try {
    await db.execute("SELECT 1");
    return { status: 'ok', latency_ms: Date.now() - start };
  } catch (err) {
    return {
      status: 'down',
      latency_ms: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
```

- [ ] **Step 4: Update `backend/src/server.ts` to decorate `app.db`.**

Find the section in `server.ts` where the auth plugin is registered and add a DB decoration before `registerHealthRoute`:

```ts
import { createDb } from './db/client.js';

// inside buildServer(), before registerHealthRoute(app):
const db = createDb(databaseUrl);
app.decorate('db', db);
```

The final `buildServer` should look like:

```ts
async function buildServer() {
  const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' } });

  const databaseUrl = process.env.DATABASE_URL;
  const baseUrl = process.env.BETTER_AUTH_URL;
  const secret = process.env.BETTER_AUTH_SECRET;

  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  if (!baseUrl) throw new Error('BETTER_AUTH_URL is required');
  if (!secret) throw new Error('BETTER_AUTH_SECRET is required');

  const db = createDb(databaseUrl);
  app.decorate('db', db);

  await app.register(authPlugin, { databaseUrl, baseUrl, secret });
  await registerHealthRoute(app);

  return app;
}
```

- [ ] **Step 5: Run tests, verify they pass.**

```bash
cd backend
NODE_ENV=test npm test
cd ..
```
Expected: all tests pass (health + auth).

- [ ] **Step 6: Sanity check via the dev server.**

```bash
cd backend
npm run dev &
sleep 2
curl -s http://localhost:3000/health
kill %1 2>/dev/null
cd ..
```
Expected: `{"status":"ok","modules":{"db":{"status":"ok","latency_ms":...}}}`.

- [ ] **Step 7: Commit.**

```bash
git add backend/src/routes/health.ts backend/src/routes/health.test.ts backend/src/server.ts
git commit -m "feat(backend): /health now reports DB module health"
```

---

## Task 17: Set up Neon for production

**Files:** none modified — operational task.

- [ ] **Step 1: Create a Neon project.**

In a browser: log into https://console.neon.tech and create a new project.

- Project name: `loreuniverse`
- Region: closest to your Fly region (e.g., AWS `us-east-2` if Fly is `iad`)
- Postgres version: 17 (matches local Docker image)

Leave other settings at defaults. After creation, you'll be on the project dashboard.

- [ ] **Step 2: Get the production connection string.**

On the dashboard, click "Connection details". Select the `main` branch and the default database (typically `neondb`). Copy the connection string with the password (it looks like `postgres://user:pwd@ep-...neon.tech/neondb?sslmode=require`).

- [ ] **Step 3: Set the connection string as a Fly secret.**

```bash
flyctl secrets set --app loreuniverse-api DATABASE_URL="<paste-connection-string-here>"
```
Expected: confirmation; the app will restart automatically with the new secret.

- [ ] **Step 4: Apply migrations to Neon.**

```bash
cd backend
DATABASE_URL="<paste-same-connection-string>" npx drizzle-kit migrate
cd ..
```
Expected: migration applied. Verify by connecting:

```bash
docker run --rm -it postgres:17-alpine psql "<paste-connection-string>" -c "\dt"
```
Expected: four tables listed.

- [ ] **Step 5: No commit — operational only. Note the connection string is now stored in two places (Fly secrets for runtime, your `~/.bash_history` for one-time migration). Clear bash history of the connection string if you're concerned:**

```bash
history -c
```

---

## Task 18: Set up Resend for production

**Files:** none modified — operational task.

- [ ] **Step 1: Sign in at https://resend.com, create an API key.**

Navigate to API Keys → Create API Key → choose "Sending access" scope → name it `loreuniverse-prod`.

Copy the printed key (it's shown once).

- [ ] **Step 2: Choose a sending address.**

If you have a domain, add it in Resend's "Domains" UI and follow DNS verification. If you don't have a domain yet, you can use Resend's onboarding sender — typically `onboarding@resend.dev` — for personal testing. For real production, you'll want your own verified domain (e.g., `no-reply@loreuniverse.com`); that's a small task you can do anytime.

- [ ] **Step 3: Set Fly secrets for Resend.**

```bash
flyctl secrets set --app loreuniverse-api \
  RESEND_API_KEY="<paste-api-key>" \
  EMAIL_FROM="Lore Universe <onboarding@resend.dev>"
```

Replace the EMAIL_FROM with your verified domain if you have one.

- [ ] **Step 4: Restart the app to pick up new secrets.**

```bash
flyctl apps restart loreuniverse-api
```

Verify the app starts cleanly:
```bash
flyctl logs
```
Watch for any startup errors related to missing env vars.

---

## Task 19: Configure Better Auth and trusted origins on Fly

**Files:** none modified — operational task.

- [ ] **Step 1: Set the production Better Auth secrets.**

Generate a fresh 32-byte secret:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Set Fly secrets:
```bash
flyctl secrets set --app loreuniverse-api \
  BETTER_AUTH_SECRET="<paste-the-generated-secret>" \
  BETTER_AUTH_URL="https://loreuniverse-api.fly.dev" \
  ALLOWED_ORIGINS="https://loreuniverse.github.io"
```

- [ ] **Step 2: Restart and verify.**

```bash
flyctl apps restart loreuniverse-api
flyctl logs
```

Watch for clean startup. Look for the log line "Server listening on http://0.0.0.0:3000" or similar.

- [ ] **Step 3: Hit health endpoint to confirm DB connection works on Fly.**

```bash
curl -s https://loreuniverse-api.fly.dev/health
```
Expected: `{"status":"ok","modules":{"db":{"status":"ok","latency_ms":<small-number>}}}`.

---

## Task 20: Manual end-to-end sign-up test against production

**Files:** none modified — verification only.

- [ ] **Step 1: Sign up via the production API.**

```bash
curl -s -X POST https://loreuniverse-api.fly.dev/api/auth/sign-up/email \
  -H 'content-type: application/json' \
  -d '{"email":"YOUR-EMAIL@example.com","password":"CorrectHorse-Battery-Staple-9","name":"Tim"}'
```
Expected: a JSON response indicating success.

- [ ] **Step 2: Check your inbox.**

You should receive a verification email from Resend. Click the link.

- [ ] **Step 3: Confirm verification via the database.**

```bash
docker run --rm -it postgres:17-alpine psql "<your-neon-connection-string>" \
  -c "SELECT email, email_verified, role, tier FROM users WHERE email = 'YOUR-EMAIL@example.com';"
```
Expected: `email_verified = t`.

- [ ] **Step 4: Promote yourself to admin.**

This is the first-admin bootstrap procedure documented in the spec.

```bash
docker run --rm -it postgres:17-alpine psql "<your-neon-connection-string>" \
  -c "UPDATE users SET role = 'admin' WHERE email = 'YOUR-EMAIL@example.com';"
```
Expected: `UPDATE 1`.

- [ ] **Step 5: Test sign-in.**

```bash
curl -s -X POST https://loreuniverse-api.fly.dev/api/auth/sign-in/email \
  -H 'content-type: application/json' \
  -d '{"email":"YOUR-EMAIL@example.com","password":"CorrectHorse-Battery-Staple-9"}' \
  -c /tmp/cookies.txt
```
Expected: success response, session cookie saved to `/tmp/cookies.txt`.

- [ ] **Step 6: Confirm the session is active.**

```bash
curl -s https://loreuniverse-api.fly.dev/api/auth/get-session -b /tmp/cookies.txt
```
Expected: JSON with your user details (including `"role":"admin"`).

- [ ] **Step 7: Clean up.**

```bash
rm /tmp/cookies.txt
```

---

## Task 21: Wire migrations into the Fly deploy pipeline

**Files:**
- Modify: `backend/fly.toml`
- Create: `backend/src/migrate.ts`

- [ ] **Step 1: Create a tiny migration entry-point that drizzle-kit can call in production.**

Create `backend/src/migrate.ts`:

```ts
import 'dotenv/config';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required for migrations');

const sql = postgres(url, { max: 1 });
const db = drizzle(sql);

migrate(db, { migrationsFolder: './drizzle' })
  .then(async () => {
    console.log('Migrations applied.');
    await sql.end();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('Migration failed:', err);
    await sql.end();
    process.exit(1);
  });
```

- [ ] **Step 2: Update `backend/Dockerfile` to include the `drizzle/` folder and migrate script in the runtime image.**

In the `runtime` stage of the Dockerfile, after copying `dist`, add:

```dockerfile
COPY drizzle ./drizzle
```

Final relevant section:
```dockerfile
FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --omit=optional && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY drizzle ./drizzle
EXPOSE 3000
CMD ["node", "dist/server.js"]
```

- [ ] **Step 3: Update `backend/fly.toml` to run migrations on each release.**

Edit `backend/fly.toml`. Add a `release_command` under `[deploy]`:

```toml
[deploy]
  release_command = "node dist/migrate.js"
```

If the `[deploy]` section already exists from Plan A's fly.toml, just add the `release_command` line. If not, add the section.

- [ ] **Step 4: Build the new image locally to verify.**

```bash
cd backend
docker build -t loreuniverse-backend:test .
docker run --rm loreuniverse-backend:test node dist/migrate.js < /dev/null || echo "Expected to fail without DATABASE_URL — that's fine, we just verified the binary runs"
cd ..
```

- [ ] **Step 5: Deploy and watch the release command run.**

```bash
cd backend
flyctl deploy --remote-only
cd ..
```
Expected: during deployment, Fly logs show the release_command output: "Migrations applied." If there's nothing new to migrate, Drizzle still exits 0.

- [ ] **Step 6: Commit.**

```bash
git add backend/src/migrate.ts backend/Dockerfile backend/fly.toml
git commit -m "feat(backend): run Drizzle migrations on each Fly deploy"
```

---

## Task 22: Add a one-paragraph README to the auth feature

**Files:**
- Create: `backend/src/features/auth/README.md`

- [ ] **Step 1: Create the file.**

```markdown
# Auth feature

Owns the `users`, `sessions`, `accounts`, and `verifications` tables, and exposes Better Auth's HTTP routes at `/api/auth/*`.

## Implementation notes

- Better Auth is configured in `better-auth.ts`. Email verification is **required** before sign-in.
- Email is sent through the `EmailSender` interface in `../email/sender.ts`. Tests use `FakeEmailSender`; production uses `ResendEmailSender`. Local dev with no `RESEND_API_KEY` falls back to a console-log sender.
- Our user table has additional columns (`role`, `tier`, `is_banned`, `banned_at`, `banned_reason`) that Better Auth doesn't manage. These are declared via `additionalFields` in the Better Auth config.

## Endpoints exposed

- `POST /api/auth/sign-up/email` — create a new account, sends verification email.
- `GET /api/auth/verify-email` — completes email verification.
- `POST /api/auth/sign-in/email` — requires verified email.
- `POST /api/auth/sign-out` — clears the session cookie.
- `POST /api/auth/forget-password` — sends a reset email.
- `POST /api/auth/reset-password` — uses a token from the email to set a new password.
- `GET /api/auth/get-session` — returns the current user record if authenticated.

## First-admin bootstrap

The very first user (you) becomes an admin via a manual SQL update:

```sql
UPDATE users SET role = 'admin' WHERE email = 'you@whatever';
```

Run this against the Neon database after signing up and verifying.
```

- [ ] **Step 2: Commit.**

```bash
git add backend/src/features/auth/README.md
git commit -m "docs(backend): document auth feature"
```

---

## Task 23: Update PROJECT_BRIEFING.md and merge

**Files:**
- Modify: `PROJECT_BRIEFING.md`

- [ ] **Step 1: In Section 6 (Current State), add:**

```markdown
| Postgres (local + Neon) | ✅ Done (Foundation Plan B) |
| Drizzle ORM + initial schema | ✅ Done (Foundation Plan B) |
| Better Auth + Resend + email verification | ✅ Done (Foundation Plan B) |
| Sign-up / sign-in / sign-out / password reset | ✅ Done (Foundation Plan B) |
| Migrations on Fly deploy | ✅ Done (Foundation Plan B) |
| First admin promoted (manual SQL) | ✅ Done (Foundation Plan B) |
```

- [ ] **Step 2: In Section 10 (Future Scope) under "Sub-project roadmap", mark Plan B done:**

```markdown
- Plan A: ✅ monorepo restructure, library rename, backend skeleton
- Plan B: ✅ database, auth (Better Auth + Resend), email-verified signup/login
- Plan C: roles, permissions, API tokens, audit log
- Plan D: static-site/backend integration, Claude autolink endpoint
```

- [ ] **Step 3: Commit.**

```bash
git add PROJECT_BRIEFING.md
git commit -m "docs: update PROJECT_BRIEFING for Plan B completion"
```

- [ ] **Step 4: Open PR.**

```bash
git push -u origin foundation-b-database-auth-email
gh pr create --title "Foundation B: database, auth, email" \
  --body "Implements Plan B. See docs/superpowers/plans/2026-05-22-foundation-b-database-auth-email.md."
```

Review the PR. Verify:
- Schema is `users`, `sessions`, `accounts`, `verifications` only — no permissions / tokens / audit tables yet (those are Plan C).
- All tests pass in CI.
- `release_command` triggers migrations.

Merge.

- [ ] **Step 5: Post-merge production smoke check.**

```bash
curl -s https://loreuniverse-api.fly.dev/health
```
Expected: `{"status":"ok","modules":{"db":{"status":"ok","latency_ms":<n>}}}`.

---

## Definition of Done

- [ ] Local Postgres runs via Docker Compose; `lore_dev` and `lore_test` databases exist.
- [ ] Drizzle schema defined for `users`, `sessions`, `accounts`, `verifications` with our user additions (`role`, `tier`, `isBanned`, `bannedAt`, `bannedReason`).
- [ ] `drizzle-kit migrate` applies the initial migration locally and on Neon.
- [ ] Better Auth runs as a Fastify plugin and exposes `/api/auth/*` routes.
- [ ] EmailSender interface with `FakeEmailSender` (tests), `ResendEmailSender` (prod), and a dev console-log fallback.
- [ ] Sign-up creates an unverified user and sends a verification email.
- [ ] Sign-in is rejected for unverified users.
- [ ] Sign-in succeeds (with session cookie) for verified users.
- [ ] Sign-out clears the session cookie.
- [ ] Password reset flow works end-to-end.
- [ ] `/health` reports the `db` module's status.
- [ ] Migrations run automatically on Fly deploys via `release_command`.
- [ ] At least one admin user (you) exists in production, promoted via manual SQL.
- [ ] All tests pass in CI.

After Plan B is merged, proceed to Plan C (roles, permissions, API tokens, audit log).
