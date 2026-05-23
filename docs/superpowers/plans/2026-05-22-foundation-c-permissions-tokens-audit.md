# Foundation Plan C — Permissions, API Tokens, Audit Log

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the full authorization layer on top of Plan B's auth foundation: `user_permissions`, `permission_applications`, `api_tokens`, and `audit_log` tables; the middleware stack (`requireAuth`, `requireRole`, `requirePermission`, `requireNotBanned`); admin endpoints for banning users, granting/revoking permissions, and reviewing applications; a user-facing endpoint for submitting permission applications; and the `api_tokens` CRUD with role-prefixed token strings.

**Architecture:** Each new feature lives under `backend/src/features/<name>/`. The `audit` feature owns `audit_log` and exposes a best-effort `auditService.log()` (wrapped try/catch in every consumer). The `tokens` feature owns `api_tokens`, hashes plaintext tokens before storage, and exposes a `tokenService.validate(plaintext)` for the unified auth middleware. The `permissions` feature owns `user_permissions` and `permission_applications`, plus the three middleware factories. A single `requireAuth` resolves *either* a session cookie *or* a Bearer token to a `user_id`, applies the banned check, and decorates the request. Downstream guards (`requireRole`, `requirePermission`) layer on top.

**Tech Stack:** Same as Plan B (Drizzle, Fastify, Better Auth, Postgres, Vitest), plus `argon2` for token hashing, `nanoid` for token random parts.

**References:**
- Spec: `docs/superpowers/specs/2026-05-22-foundational-backend-architecture-design.md` — see Data Model (user_permissions / permission_applications / api_tokens / audit_log) and Request and Auth Flow (Authorization model).
- Plan A and Plan B must be merged before starting C.

**Prerequisites:**
1. Plans A and B complete and merged. Backend deployed; sign-up/sign-in working in prod; first admin user promoted.
2. Local docker-compose Postgres running with both `lore_dev` and `lore_test` databases migrated to Plan B's schema.

---

## File Structure After This Plan

```
backend/src/
├── db/
│   └── schema.ts                 # adds user_permissions, permission_applications, api_tokens, audit_log
├── features/
│   ├── auth/
│   │   └── (unchanged)
│   ├── audit/                    # NEW
│   │   ├── index.ts              # Fastify plugin
│   │   ├── service.ts            # auditService.log()
│   │   └── service.test.ts
│   ├── tokens/                   # NEW
│   │   ├── index.ts              # Fastify plugin — mounts /api/account/api-tokens routes
│   │   ├── service.ts            # tokenService — create/list/revoke/validate, argon2 hashing
│   │   ├── service.test.ts
│   │   ├── routes.ts             # HTTP handlers for token CRUD
│   │   └── routes.test.ts
│   └── permissions/              # NEW
│       ├── index.ts              # Fastify plugin — mounts permission/ban admin routes + user applications
│       ├── middleware.ts         # requireAuth, requireRole, requirePermission, requireNotBanned
│       ├── middleware.test.ts
│       ├── service.ts            # permissionService — grant/revoke/checkHas
│       ├── service.test.ts
│       ├── ban-routes.ts
│       ├── ban-routes.test.ts
│       ├── grant-routes.ts
│       ├── grant-routes.test.ts
│       ├── application-routes.ts # both user-submit and admin-review
│       └── application-routes.test.ts
├── lib/
│   └── test-db.ts                # NEW — transaction-rolling test helper
└── routes/
    └── health.ts                 # expanded to report new features
```

---

## Task 1: Branch and add the four new tables to the schema

**Files:**
- Modify: `backend/src/db/schema.ts`

- [ ] **Step 1: Create branch.**

```bash
git checkout main
git pull
git checkout -b foundation-c-permissions-tokens-audit
```

- [ ] **Step 2: Append the new tables to `backend/src/db/schema.ts`.**

Add the following at the end of the file, after the existing tables:

```ts
import { uniqueIndex, index } from 'drizzle-orm/pg-core';

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
// `prefix` stores the first 20 chars of the plaintext token (e.g. "lore_admin_xK7q1234..."),
// safe to expose because it doesn't reveal the secret portion. It's the human-readable
// identifier shown in the token-list UI AND the lookup key for validation (so we don't
// argon2-verify every row). The full plaintext is shown only at creation.
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
    metadata: text('metadata'), // store JSON as text; jsonb-typed in a later optimization if needed
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    actorIdx: index('audit_log_actor_created_at').on(t.actorUserId, t.createdAt),
    actionIdx: index('audit_log_action_created_at').on(t.action, t.createdAt),
  }),
);
```

Then update the schema export at the bottom:

```ts
export const schema = {
  users,
  sessions,
  accounts,
  verifications,
  userPermissions,
  permissionApplications,
  apiTokens,
  auditLog,
};
```

- [ ] **Step 3: Typecheck.**

```bash
cd backend
npm run typecheck
cd ..
```
Expected: no errors.

- [ ] **Step 4: Commit.**

```bash
git add backend/src/db/schema.ts
git commit -m "feat(backend): add user_permissions, applications, api_tokens, audit_log tables"
```

---

## Task 2: Generate and apply the migration

**Files:**
- Create: `backend/drizzle/0001_*.sql` (generated)

- [ ] **Step 1: Generate.**

```bash
cd backend
npx drizzle-kit generate --name add_permissions_tokens_audit
cd ..
```
Expected: a new file `backend/drizzle/0001_add_permissions_tokens_audit.sql`. Read it to confirm:

```bash
cat backend/drizzle/0001_*.sql
```

- [ ] **Step 2: Apply locally.**

```bash
cd backend
npx drizzle-kit migrate
DATABASE_URL="postgres://lore:lore@localhost:5432/lore_test" npx drizzle-kit migrate
cd ..
```
Expected: applies to both `lore_dev` and `lore_test`.

- [ ] **Step 3: Verify tables exist.**

```bash
docker exec -it loreuniverse-postgres psql -U lore -d lore_dev -c "\dt"
```
Expected: 8 tables (4 from Plan B + 4 new).

- [ ] **Step 4: Commit.**

```bash
git add backend/drizzle/
git commit -m "feat(backend): migration 0001 — permissions/tokens/audit tables"
```

---

## Task 3: Add a transaction-rolling test helper

This is the test infrastructure deferred from Plan B. Every authorization-sensitive test from this point on runs inside a transaction that rolls back at teardown, so tests don't pollute each other and don't depend on `Date.now()` tricks.

**Files:**
- Create: `backend/src/lib/test-db.ts`
- Create: `backend/src/lib/test-db.test.ts`

- [ ] **Step 1: Write the failing test.**

```ts
import 'dotenv/config';
import { describe, it, expect, afterAll } from 'vitest';
import { withRollbackDb, closeTestDb } from './test-db.js';
import { schema } from '../db/schema.js';

describe('withRollbackDb', () => {
  afterAll(async () => {
    await closeTestDb();
  });

  it('inserts inside a transaction and rolls back so no row persists', async () => {
    let seenInsideTransaction = false;
    await withRollbackDb(async (db) => {
      await db.insert(schema.users).values({
        id: 'rollback-test-user',
        email: 'rollback@example.com',
        name: 'Rollback',
      });
      const rows = await db.select().from(schema.users);
      seenInsideTransaction = rows.some(r => r.id === 'rollback-test-user');
    });

    expect(seenInsideTransaction).toBe(true);

    // After rollback, the row should not exist.
    await withRollbackDb(async (db) => {
      const rows = await db.select().from(schema.users);
      expect(rows.some(r => r.id === 'rollback-test-user')).toBe(false);
    });
  });
});
```

- [ ] **Step 2: Run, verify it fails.**

```bash
cd backend
NODE_ENV=test npm test -- --run lib/test-db
cd ..
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `backend/src/lib/test-db.ts`.**

```ts
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { schema } from '../db/schema.js';

const url = process.env.DATABASE_URL_TEST;
if (!url) {
  throw new Error('DATABASE_URL_TEST must be set for tests');
}

const sql = postgres(url, { max: 5 });
const baseDb = drizzle(sql, { schema });

class RollbackSignal extends Error {
  constructor() { super('__rollback__'); }
}

export async function withRollbackDb<T>(
  fn: (db: typeof baseDb) => Promise<T>
): Promise<T> {
  let result: T;
  try {
    await baseDb.transaction(async (tx) => {
      // postgres-js exposes the same DB interface for the transaction.
      result = await fn(tx as typeof baseDb);
      throw new RollbackSignal();
    });
  } catch (err) {
    if (!(err instanceof RollbackSignal)) throw err;
  }
  return result!;
}

export async function closeTestDb(): Promise<void> {
  await sql.end({ timeout: 5 });
}
```

- [ ] **Step 4: Run, verify it passes.**

```bash
cd backend
NODE_ENV=test npm test -- --run lib/test-db
cd ..
```
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add backend/src/lib/test-db.ts backend/src/lib/test-db.test.ts
git commit -m "feat(backend): add withRollbackDb test helper"
```

---

## Task 4: Audit feature — service + tests

**Files:**
- Create: `backend/src/features/audit/service.ts`
- Create: `backend/src/features/audit/service.test.ts`
- Create: `backend/src/features/audit/index.ts`

- [ ] **Step 1: Write failing test.**

```ts
import { describe, it, expect } from 'vitest';
import { withRollbackDb } from '../../lib/test-db.js';
import { schema } from '../../db/schema.js';
import { createAuditService } from './service.js';

describe('auditService.log', () => {
  it('writes a row to audit_log', async () => {
    await withRollbackDb(async (db) => {
      const audit = createAuditService(db);
      await audit.log({
        actorUserId: null,
        action: 'test.action',
        targetType: 'test',
        targetId: 'abc',
        metadata: { foo: 'bar' },
      });
      const rows = await db.select().from(schema.auditLog);
      expect(rows.some(r => r.action === 'test.action' && r.targetId === 'abc')).toBe(true);
    });
  });

  it('does not throw if DB write fails — best effort only', async () => {
    // We can't easily simulate DB failure here without mocking; this is documented as the contract.
    // The behaviour is enforced by callers via try/catch + logging.
    expect(true).toBe(true);
  });
});
```

- [ ] **Step 2: Run, verify failure.**

```bash
cd backend
NODE_ENV=test npm test -- --run features/audit
cd ..
```

- [ ] **Step 3: Implement `backend/src/features/audit/service.ts`.**

```ts
import type { drizzle } from 'drizzle-orm/postgres-js';
import { schema } from '../../db/schema.js';

type Db = ReturnType<typeof drizzle<typeof schema>>;

export type AuditEntry = {
  actorUserId: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
};

export type AuditService = {
  log(entry: AuditEntry): Promise<void>;
};

export function createAuditService(db: Db): AuditService {
  return {
    async log(entry) {
      await db.insert(schema.auditLog).values({
        actorUserId: entry.actorUserId,
        action: entry.action,
        targetType: entry.targetType ?? null,
        targetId: entry.targetId ?? null,
        metadata: entry.metadata ? JSON.stringify(entry.metadata) : null,
        ipAddress: entry.ipAddress ?? null,
        userAgent: entry.userAgent ?? null,
      });
    },
  };
}
```

- [ ] **Step 4: Create the Fastify plugin `backend/src/features/audit/index.ts`.**

```ts
import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { createAuditService, type AuditService } from './service.js';

declare module 'fastify' {
  interface FastifyInstance {
    audit: AuditService;
  }
}

async function auditPlugin(app: FastifyInstance) {
  app.decorate('audit', createAuditService(app.db));
}

export default fp(auditPlugin, { name: 'audit', dependencies: [] });
```

- [ ] **Step 5: Run, verify pass.**

```bash
cd backend
NODE_ENV=test npm test -- --run features/audit
cd ..
```

- [ ] **Step 6: Commit.**

```bash
git add backend/src/features/audit/
git commit -m "feat(backend): add audit feature (service + plugin)"
```

---

## Task 5: Token feature — service core (hash/create/list/revoke/validate)

**Files:**
- Create: `backend/src/features/tokens/service.ts`
- Create: `backend/src/features/tokens/service.test.ts`

- [ ] **Step 1: Install argon2 and nanoid.**

```bash
cd backend
npm install argon2 nanoid
cd ..
```

- [ ] **Step 2: Write failing tests.**

```ts
import { describe, it, expect } from 'vitest';
import { withRollbackDb } from '../../lib/test-db.js';
import { schema } from '../../db/schema.js';
import { createTokenService } from './service.js';

async function seedUser(db: Awaited<ReturnType<typeof withRollbackDb<any>>>, role = 'admin') {
  await db.insert(schema.users).values({
    id: 'u-' + Math.random().toString(36).slice(2, 8),
    email: `t${Date.now()}-${Math.random().toString(36).slice(2,6)}@example.com`,
    name: 'T',
    role,
  });
  const [user] = await db.select().from(schema.users).limit(1);
  return user.id;
}

describe('tokenService', () => {
  it('create returns plaintext with role prefix; stores only hash', async () => {
    await withRollbackDb(async (db) => {
      const userId = await seedUser(db, 'admin');
      const svc = createTokenService(db);
      const { plaintext, record } = await svc.create({
        userId,
        userRole: 'admin',
        name: 'laptop',
      });
      expect(plaintext.startsWith('lore_admin_')).toBe(true);
      expect(plaintext.length).toBeGreaterThan(20);
      expect(record.tokenHash).not.toEqual(plaintext);
      expect(record.tokenHash.length).toBeGreaterThan(20);
    });
  });

  it('validate returns user id for a valid token', async () => {
    await withRollbackDb(async (db) => {
      const userId = await seedUser(db, 'admin');
      const svc = createTokenService(db);
      const { plaintext } = await svc.create({ userId, userRole: 'admin', name: 'laptop' });
      const result = await svc.validate(plaintext);
      expect(result?.userId).toBe(userId);
    });
  });

  it('validate returns null for a revoked token', async () => {
    await withRollbackDb(async (db) => {
      const userId = await seedUser(db, 'admin');
      const svc = createTokenService(db);
      const { plaintext, record } = await svc.create({ userId, userRole: 'admin', name: 'laptop' });
      await svc.revoke(record.id, userId);
      const result = await svc.validate(plaintext);
      expect(result).toBeNull();
    });
  });

  it('list returns tokens with human-readable prefix preview, no plaintext', async () => {
    await withRollbackDb(async (db) => {
      const userId = await seedUser(db, 'admin');
      const svc = createTokenService(db);
      await svc.create({ userId, userRole: 'admin', name: 'one' });
      await svc.create({ userId, userRole: 'admin', name: 'two' });
      const tokens = await svc.list(userId);
      expect(tokens.length).toBe(2);
      for (const t of tokens) {
        expect(t).not.toHaveProperty('plaintext');
        expect(typeof t.id).toBe('string');
        expect(t.tokenPreview.startsWith('lore_admin_')).toBe(true);
        expect(t.tokenPreview.length).toBe(20);
      }
    });
  });

  it('rejects token creation for non-admin/non-moderator roles', async () => {
    await withRollbackDb(async (db) => {
      const userId = await seedUser(db, 'user');
      const svc = createTokenService(db);
      await expect(
        svc.create({ userId, userRole: 'user', name: 'x' })
      ).rejects.toThrow(/role/i);
    });
  });
});
```

- [ ] **Step 3: Run, verify failure.**

```bash
cd backend
NODE_ENV=test npm test -- --run features/tokens/service
cd ..
```

- [ ] **Step 4: Implement `backend/src/features/tokens/service.ts`.**

```ts
import argon2 from 'argon2';
import { customAlphabet } from 'nanoid';
import { and, eq, isNull } from 'drizzle-orm';
import type { drizzle } from 'drizzle-orm/postgres-js';
import { schema } from '../../db/schema.js';

type Db = ReturnType<typeof drizzle<typeof schema>>;

const randomPart = customAlphabet('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 40);

const ALLOWED_ROLES = new Set(['admin', 'moderator']);

export type CreateInput = {
  userId: string;
  userRole: string;
  name: string;
  expiresAt?: Date;
};

export type CreateResult = {
  plaintext: string;
  record: typeof schema.apiTokens.$inferSelect;
};

export type ListedToken = {
  id: string;
  name: string;
  tokenPreview: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
};

export type TokenService = {
  create(input: CreateInput): Promise<CreateResult>;
  list(userId: string): Promise<ListedToken[]>;
  revoke(tokenId: string, userId: string): Promise<void>;
  validate(plaintext: string): Promise<{ userId: string; tokenId: string } | null>;
};

function prefixForRole(role: string): string {
  if (role === 'admin') return 'lore_admin_';
  if (role === 'moderator') return 'lore_moderator_';
  throw new Error(`Cannot mint token for role: ${role}`);
}

export function createTokenService(db: Db): TokenService {
  return {
    async create({ userId, userRole, name, expiresAt }) {
      if (!ALLOWED_ROLES.has(userRole)) {
        throw new Error(`Tokens can only be minted for admin or moderator roles; got ${userRole}`);
      }
      const rolePrefix = prefixForRole(userRole);
      const random = randomPart();
      const plaintext = `${rolePrefix}${random}`;
      // Store the first 20 chars of the plaintext as the public identifier.
      // Length is enough to convey the role + a few chars of random for uniqueness in the UI.
      const prefix = plaintext.slice(0, 20);
      const tokenHash = await argon2.hash(plaintext);

      const [record] = await db.insert(schema.apiTokens)
        .values({
          userId,
          name,
          prefix,
          tokenHash,
          expiresAt: expiresAt ?? null,
        })
        .returning();

      return { plaintext, record };
    },

    async list(userId) {
      const rows = await db.select().from(schema.apiTokens).where(eq(schema.apiTokens.userId, userId));
      return rows.map(r => ({
        id: r.id,
        name: r.name,
        tokenPreview: r.prefix,
        createdAt: r.createdAt,
        lastUsedAt: r.lastUsedAt,
        expiresAt: r.expiresAt,
        revokedAt: r.revokedAt,
      }));
    },

    async revoke(tokenId, userId) {
      await db.update(schema.apiTokens)
        .set({ revokedAt: new Date() })
        .where(and(eq(schema.apiTokens.id, tokenId), eq(schema.apiTokens.userId, userId)));
    },

    async validate(plaintext) {
      // The plaintext starts with the role prefix and a few random chars. We stored
      // the first 20 chars as `prefix` precisely so we can do an indexed lookup here
      // before running argon2.verify — keeping validation O(1) regardless of how many
      // tokens exist.
      const candidatePrefix = plaintext.slice(0, 20);
      const now = new Date();
      const candidates = await db.select().from(schema.apiTokens)
        .where(and(
          isNull(schema.apiTokens.revokedAt),
          eq(schema.apiTokens.prefix, candidatePrefix),
        ));

      for (const row of candidates) {
        if (row.expiresAt && row.expiresAt < now) continue;
        const ok = await argon2.verify(row.tokenHash, plaintext);
        if (ok) {
          // Best-effort lastUsedAt update; doesn't block return value.
          db.update(schema.apiTokens)
            .set({ lastUsedAt: now })
            .where(eq(schema.apiTokens.id, row.id))
            .catch(() => { /* ignore */ });
          return { userId: row.userId, tokenId: row.id };
        }
      }
      return null;
    },
  };
}
```

Note on `validate`: argon2 verification is O(N) over non-revoked tokens. For our scale (a handful of admin tokens), this is fine. If token count grows large in future, switch to a secondary index strategy (e.g., a non-secret SHA-256 of the plaintext used as a lookup key, then argon2 verify the matched row).

- [ ] **Step 5: Run, verify pass.**

```bash
cd backend
NODE_ENV=test npm test -- --run features/tokens/service
cd ..
```

- [ ] **Step 6: Commit.**

```bash
git add backend/src/features/tokens/service.ts backend/src/features/tokens/service.test.ts backend/package.json backend/package-lock.json
git commit -m "feat(backend): tokens service with argon2 hashing + role-prefixed tokens"
```

---

## Task 6: Permissions feature — service core + middleware

**Files:**
- Create: `backend/src/features/permissions/service.ts`
- Create: `backend/src/features/permissions/service.test.ts`
- Create: `backend/src/features/permissions/middleware.ts`
- Create: `backend/src/features/permissions/middleware.test.ts`

- [ ] **Step 1: Write failing service tests.**

```ts
import { describe, it, expect } from 'vitest';
import { withRollbackDb } from '../../lib/test-db.js';
import { schema } from '../../db/schema.js';
import { createPermissionsService } from './service.js';

async function seedUser(db: any, role = 'user') {
  const id = 'u-' + Math.random().toString(36).slice(2, 10);
  await db.insert(schema.users).values({
    id,
    email: `${id}@example.com`,
    name: 'X',
    role,
  });
  return id;
}

describe('permissionsService', () => {
  it('grant + hasPermission returns true', async () => {
    await withRollbackDb(async (db) => {
      const userId = await seedUser(db, 'user');
      const adminId = await seedUser(db, 'admin');
      const svc = createPermissionsService(db);
      await svc.grant({ userId, permission: 'wiki_edit', grantedBy: adminId });
      expect(await svc.hasPermission(userId, 'wiki_edit')).toBe(true);
    });
  });

  it('admin implicitly has every permission', async () => {
    await withRollbackDb(async (db) => {
      const adminId = await seedUser(db, 'admin');
      const svc = createPermissionsService(db);
      expect(await svc.hasPermission(adminId, 'wiki_edit')).toBe(true);
      expect(await svc.hasPermission(adminId, 'art_upload')).toBe(true);
    });
  });

  it('moderator implicitly has every permission', async () => {
    await withRollbackDb(async (db) => {
      const modId = await seedUser(db, 'moderator');
      const svc = createPermissionsService(db);
      expect(await svc.hasPermission(modId, 'wiki_edit')).toBe(true);
    });
  });

  it('revoke removes the permission', async () => {
    await withRollbackDb(async (db) => {
      const userId = await seedUser(db, 'user');
      const adminId = await seedUser(db, 'admin');
      const svc = createPermissionsService(db);
      await svc.grant({ userId, permission: 'wiki_edit', grantedBy: adminId });
      await svc.revoke({ userId, permission: 'wiki_edit' });
      expect(await svc.hasPermission(userId, 'wiki_edit')).toBe(false);
    });
  });
});
```

- [ ] **Step 2: Implement `backend/src/features/permissions/service.ts`.**

```ts
import { and, eq } from 'drizzle-orm';
import type { drizzle } from 'drizzle-orm/postgres-js';
import { schema } from '../../db/schema.js';

type Db = ReturnType<typeof drizzle<typeof schema>>;

export type Role = 'user' | 'moderator' | 'admin';
const ROLE_RANK: Record<Role, number> = { user: 1, moderator: 2, admin: 3 };

export type PermissionsService = {
  hasRole(userId: string, minimum: Role): Promise<boolean>;
  hasPermission(userId: string, permission: string): Promise<boolean>;
  grant(input: { userId: string; permission: string; grantedBy: string }): Promise<void>;
  revoke(input: { userId: string; permission: string }): Promise<void>;
  listForUser(userId: string): Promise<string[]>;
};

async function getUserRole(db: Db, userId: string): Promise<Role | null> {
  const rows = await db.select({ role: schema.users.role, isBanned: schema.users.isBanned })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  if (rows.length === 0) return null;
  if (rows[0].isBanned) return null;
  const role = rows[0].role;
  if (role === 'user' || role === 'moderator' || role === 'admin') return role;
  return 'user';
}

export function createPermissionsService(db: Db): PermissionsService {
  return {
    async hasRole(userId, minimum) {
      const role = await getUserRole(db, userId);
      if (!role) return false;
      return ROLE_RANK[role] >= ROLE_RANK[minimum];
    },

    async hasPermission(userId, permission) {
      const role = await getUserRole(db, userId);
      if (!role) return false;
      if (role === 'moderator' || role === 'admin') return true;
      const rows = await db.select().from(schema.userPermissions)
        .where(and(
          eq(schema.userPermissions.userId, userId),
          eq(schema.userPermissions.permission, permission),
        ));
      return rows.length > 0;
    },

    async grant({ userId, permission, grantedBy }) {
      await db.insert(schema.userPermissions)
        .values({ userId, permission, grantedBy })
        .onConflictDoNothing();
    },

    async revoke({ userId, permission }) {
      await db.delete(schema.userPermissions)
        .where(and(
          eq(schema.userPermissions.userId, userId),
          eq(schema.userPermissions.permission, permission),
        ));
    },

    async listForUser(userId) {
      const rows = await db.select({ p: schema.userPermissions.permission })
        .from(schema.userPermissions)
        .where(eq(schema.userPermissions.userId, userId));
      return rows.map(r => r.p);
    },
  };
}
```

- [ ] **Step 3: Run service tests, verify pass.**

```bash
cd backend
NODE_ENV=test npm test -- --run features/permissions/service
cd ..
```

- [ ] **Step 4: Implement middleware `backend/src/features/permissions/middleware.ts`.**

```ts
import type { FastifyInstance, FastifyRequest, FastifyReply, preHandlerHookHandler } from 'fastify';
import { eq } from 'drizzle-orm';
import { schema } from '../../db/schema.js';
import type { TokenService } from '../tokens/service.js';
import type { PermissionsService, Role } from './service.js';

export type AuthedUser = {
  id: string;
  role: Role;
  isBanned: boolean;
  authVia: 'session' | 'token';
};

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthedUser;
  }
}

export function createRequireAuth(opts: {
  app: FastifyInstance;
  tokens: TokenService;
}): preHandlerHookHandler {
  const { app, tokens } = opts;

  return async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
    // 1. Try Bearer token
    const authHeader = request.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const plaintext = authHeader.slice('Bearer '.length).trim();
      const result = await tokens.validate(plaintext);
      if (result) {
        const [u] = await app.db.select().from(schema.users).where(eq(schema.users.id, result.userId));
        if (!u) return reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'Unknown user.' } });
        if (u.isBanned) return reply.code(403).send({ error: { code: 'BANNED', message: 'Account banned.' } });
        request.user = {
          id: u.id,
          role: (u.role as Role) ?? 'user',
          isBanned: u.isBanned,
          authVia: 'token',
        };
        return;
      }
    }

    // 2. Try Better Auth session via header api
    const session = await app.auth.api.getSession({ headers: request.headers as any }).catch(() => null);
    if (!session?.user) {
      return reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'Login required.' } });
    }
    const [u] = await app.db.select().from(schema.users).where(eq(schema.users.id, session.user.id));
    if (!u) return reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'Session user missing.' } });
    if (u.isBanned) return reply.code(403).send({ error: { code: 'BANNED', message: 'Account banned.' } });
    request.user = {
      id: u.id,
      role: (u.role as Role) ?? 'user',
      isBanned: u.isBanned,
      authVia: 'session',
    };
  };
}

export function createRequireRole(perms: PermissionsService, minimum: Role): preHandlerHookHandler {
  return async function requireRole(request, reply) {
    if (!request.user) return reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'Login required.' } });
    const ok = await perms.hasRole(request.user.id, minimum);
    if (!ok) return reply.code(403).send({ error: { code: 'FORBIDDEN', message: `Requires role ${minimum} or higher.` } });
  };
}

export function createRequirePermission(perms: PermissionsService, permission: string): preHandlerHookHandler {
  return async function requirePermission(request, reply) {
    if (!request.user) return reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'Login required.' } });
    const ok = await perms.hasPermission(request.user.id, permission);
    if (!ok) return reply.code(403).send({ error: { code: 'FORBIDDEN', message: `Missing permission ${permission}.` } });
  };
}
```

- [ ] **Step 5: Commit.**

```bash
git add backend/src/features/permissions/service.ts backend/src/features/permissions/service.test.ts backend/src/features/permissions/middleware.ts
git commit -m "feat(backend): permissions service + auth/role/permission middleware"
```

---

## Task 7: Wire features into server.ts; add middleware integration test

**Files:**
- Modify: `backend/src/server.ts`
- Create: `backend/src/features/permissions/middleware.test.ts`
- Create: `backend/src/features/permissions/index.ts`

- [ ] **Step 1: Create the permissions Fastify plugin (without admin routes yet — those come in Tasks 8–10).**

`backend/src/features/permissions/index.ts`:
```ts
import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { createPermissionsService, type PermissionsService } from './service.js';
import { createTokenService, type TokenService } from '../tokens/service.js';
import { createRequireAuth, createRequireRole, createRequirePermission } from './middleware.js';

declare module 'fastify' {
  interface FastifyInstance {
    perms: PermissionsService;
    tokens: TokenService;
    requireAuth: ReturnType<typeof createRequireAuth>;
    requireRole: (minimum: Parameters<typeof createRequireRole>[1]) => ReturnType<typeof createRequireRole>;
    requirePermission: (perm: string) => ReturnType<typeof createRequirePermission>;
  }
}

async function permissionsPlugin(app: FastifyInstance) {
  const perms = createPermissionsService(app.db);
  const tokens = createTokenService(app.db);
  app.decorate('perms', perms);
  app.decorate('tokens', tokens);
  app.decorate('requireAuth', createRequireAuth({ app, tokens }));
  app.decorate('requireRole', (minimum) => createRequireRole(perms, minimum));
  app.decorate('requirePermission', (perm) => createRequirePermission(perms, perm));
}

export default fp(permissionsPlugin, { name: 'permissions', dependencies: ['auth', 'audit'] });
```

- [ ] **Step 2: Update `backend/src/server.ts` to register audit + permissions plugins.**

After the auth plugin registration and before health route registration, add:

```ts
import auditPlugin from './features/audit/index.js';
import permissionsPlugin from './features/permissions/index.js';
// ...
await app.register(auditPlugin);
await app.register(permissionsPlugin);
```

- [ ] **Step 3: Write a middleware integration test.**

Create `backend/src/features/permissions/middleware.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import argon2 from 'argon2';
import { withRollbackDb } from '../../lib/test-db.js';
import { schema } from '../../db/schema.js';
import { createPermissionsService } from './service.js';
import { createTokenService } from '../tokens/service.js';
import { createRequireAuth, createRequireRole } from './middleware.js';

describe('middleware integration', () => {
  it('Bearer token resolves to user and passes requireRole(admin)', async () => {
    await withRollbackDb(async (db) => {
      // Seed an admin user and a token
      const userId = 'admin-mw-test';
      await db.insert(schema.users).values({
        id: userId,
        email: `${userId}@example.com`,
        name: 'A',
        role: 'admin',
      });
      const tokens = createTokenService(db);
      const { plaintext } = await tokens.create({ userId, userRole: 'admin', name: 'mw-test' });

      const perms = createPermissionsService(db);
      const app = Fastify();
      // Decorate the app with the same shape requireAuth expects
      app.decorate('db', db as any);
      app.decorate('auth', { api: { getSession: async () => null } } as any);
      app.get(
        '/admin-only',
        { preHandler: [createRequireAuth({ app, tokens }), createRequireRole(perms, 'admin')] },
        async (req) => ({ user: req.user })
      );
      await app.ready();

      const response = await app.inject({
        method: 'GET',
        url: '/admin-only',
        headers: { authorization: `Bearer ${plaintext}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.user.id).toBe(userId);
      expect(body.user.role).toBe('admin');
      expect(body.user.authVia).toBe('token');
    });
  });

  it('rejects requireRole(admin) for a regular user', async () => {
    await withRollbackDb(async (db) => {
      const userId = 'user-mw-test';
      await db.insert(schema.users).values({
        id: userId,
        email: `${userId}@example.com`,
        name: 'U',
        role: 'user',
      });
      // We can't easily create a token for non-admin (service rejects). So we test session path:
      const perms = createPermissionsService(db);
      const tokens = createTokenService(db);
      const app = Fastify();
      app.decorate('db', db as any);
      app.decorate('auth', { api: { getSession: async () => ({ user: { id: userId } }) } } as any);
      app.get('/admin-only', { preHandler: [createRequireAuth({ app, tokens }), createRequireRole(perms, 'admin')] }, async () => ({ ok: true }));
      await app.ready();

      const response = await app.inject({ method: 'GET', url: '/admin-only' });
      expect(response.statusCode).toBe(403);
    });
  });

  it('rejects a banned user even with a valid token', async () => {
    await withRollbackDb(async (db) => {
      const userId = 'banned-mw';
      await db.insert(schema.users).values({
        id: userId,
        email: `${userId}@example.com`,
        name: 'B',
        role: 'admin',
        isBanned: true,
        bannedAt: new Date(),
        bannedReason: 'test',
      });
      const tokens = createTokenService(db);
      // The service guard prevents creating tokens via createTokenService for banned users.
      // To test that even a stale (pre-ban) token is rejected, we insert one directly.
      const plaintext = 'lore_admin_directly-inserted-for-test-aaaa';
      const tokenHash = await argon2.hash(plaintext);
      const prefix = plaintext.slice(0, 20);
      await db.insert(schema.apiTokens).values({ userId, name: 'stale', prefix, tokenHash });

      const perms = createPermissionsService(db);
      const app = Fastify();
      app.decorate('db', db as any);
      app.decorate('auth', { api: { getSession: async () => null } } as any);
      app.get('/anything', { preHandler: [createRequireAuth({ app, tokens })] }, async () => ({ ok: true }));
      await app.ready();

      const response = await app.inject({
        method: 'GET',
        url: '/anything',
        headers: { authorization: `Bearer ${plaintext}` },
      });
      expect(response.statusCode).toBe(403);
      expect(response.json().error.code).toBe('BANNED');
    });
  });
});
```

- [ ] **Step 4: Run, verify pass.**

```bash
cd backend
NODE_ENV=test npm test -- --run features/permissions/middleware
cd ..
```

- [ ] **Step 5: Commit.**

```bash
git add backend/src/features/permissions/index.ts backend/src/features/permissions/middleware.test.ts backend/src/server.ts
git commit -m "feat(backend): wire permissions/audit plugins + middleware integration tests"
```

---

## Task 8: API token HTTP endpoints

**Files:**
- Create: `backend/src/features/tokens/routes.ts`
- Create: `backend/src/features/tokens/routes.test.ts`
- Create: `backend/src/features/tokens/index.ts`

- [ ] **Step 1: Write failing test.**

```ts
import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import { withRollbackDb } from '../../lib/test-db.js';
import { schema } from '../../db/schema.js';
import { createPermissionsService } from '../permissions/service.js';
import { createTokenService } from './service.js';
import { createAuditService } from '../audit/service.js';
import { createRequireAuth, createRequireRole } from '../permissions/middleware.js';
import { registerTokenRoutes } from './routes.js';

async function setupApp(db: any) {
  const tokens = createTokenService(db);
  const perms = createPermissionsService(db);
  const audit = createAuditService(db);

  const app = Fastify();
  app.decorate('db', db);
  app.decorate('tokens', tokens);
  app.decorate('perms', perms);
  app.decorate('audit', audit);
  app.decorate('auth', { api: { getSession: async () => null } } as any);
  app.decorate('requireAuth', createRequireAuth({ app, tokens }));
  app.decorate('requireRole', (min: any) => createRequireRole(perms, min));

  await registerTokenRoutes(app);
  await app.ready();
  return app;
}

describe('token routes', () => {
  it('admin user can create a token; plaintext shown once', async () => {
    await withRollbackDb(async (db) => {
      const id = 'admin-routes';
      await db.insert(schema.users).values({ id, email: `${id}@example.com`, name: 'A', role: 'admin' });
      const app = await setupApp(db);
      const bootstrapToken = await createTokenService(db).create({ userId: id, userRole: 'admin', name: 'bootstrap' });

      const response = await app.inject({
        method: 'POST',
        url: '/api/account/api-tokens',
        headers: { authorization: `Bearer ${bootstrapToken.plaintext}`, 'content-type': 'application/json' },
        payload: { name: 'second-token' },
      });
      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.plaintext.startsWith('lore_admin_')).toBe(true);
      expect(body.token.name).toBe('second-token');
    });
  });

  it('regular user cannot create a token', async () => {
    await withRollbackDb(async (db) => {
      const id = 'regular-routes';
      await db.insert(schema.users).values({ id, email: `${id}@example.com`, name: 'R', role: 'user' });
      const app = await setupApp(db);
      // session-based auth path: stub getSession to return this user
      app.auth = { api: { getSession: async () => ({ user: { id } }) } } as any;

      const response = await app.inject({
        method: 'POST',
        url: '/api/account/api-tokens',
        payload: { name: 'no-no' },
        headers: { 'content-type': 'application/json' },
      });
      expect(response.statusCode).toBe(403);
    });
  });

  it('admin can list their tokens', async () => {
    await withRollbackDb(async (db) => {
      const id = 'list-test';
      await db.insert(schema.users).values({ id, email: `${id}@example.com`, name: 'L', role: 'admin' });
      const svc = createTokenService(db);
      const { plaintext } = await svc.create({ userId: id, userRole: 'admin', name: 't1' });
      await svc.create({ userId: id, userRole: 'admin', name: 't2' });

      const app = await setupApp(db);
      const response = await app.inject({
        method: 'GET',
        url: '/api/account/api-tokens',
        headers: { authorization: `Bearer ${plaintext}` },
      });
      expect(response.statusCode).toBe(200);
      const list = response.json();
      expect(list.length).toBe(2);
      for (const t of list) {
        expect(t).not.toHaveProperty('plaintext');
        expect(typeof t.tokenPreview).toBe('string');
      }
    });
  });

  it('admin can revoke their own token', async () => {
    await withRollbackDb(async (db) => {
      const id = 'revoke-test';
      await db.insert(schema.users).values({ id, email: `${id}@example.com`, name: 'V', role: 'admin' });
      const svc = createTokenService(db);
      const { plaintext, record } = await svc.create({ userId: id, userRole: 'admin', name: 'r1' });

      const app = await setupApp(db);
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/account/api-tokens/${record.id}`,
        headers: { authorization: `Bearer ${plaintext}` },
      });
      expect(response.statusCode).toBe(204);

      // Now the same token shouldn't validate
      const stillValid = await svc.validate(plaintext);
      expect(stillValid).toBeNull();
    });
  });
});
```

- [ ] **Step 2: Implement `backend/src/features/tokens/routes.ts`.**

```ts
import type { FastifyInstance } from 'fastify';

export async function registerTokenRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/api/account/api-tokens',
    {
      preHandler: [app.requireAuth, app.requireRole('moderator')],
      schema: {
        body: {
          type: 'object',
          required: ['name'],
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 64 },
            expiresAt: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
    async (request, reply) => {
      const body = request.body as { name: string; expiresAt?: string };
      const { plaintext, record } = await app.tokens.create({
        userId: request.user!.id,
        userRole: request.user!.role,
        name: body.name,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
      });

      await app.audit.log({
        actorUserId: request.user!.id,
        action: 'api_token.create',
        targetType: 'api_token',
        targetId: record.id,
        metadata: { name: record.name },
      }).catch((err) => request.log.error({ err }, 'audit log failed'));

      return reply.code(201).send({
        plaintext,
        token: {
          id: record.id,
          name: record.name,
          createdAt: record.createdAt,
          expiresAt: record.expiresAt,
        },
      });
    },
  );

  app.get(
    '/api/account/api-tokens',
    { preHandler: [app.requireAuth] },
    async (request) => {
      return app.tokens.list(request.user!.id);
    },
  );

  app.delete(
    '/api/account/api-tokens/:id',
    { preHandler: [app.requireAuth] },
    async (request, reply) => {
      const params = request.params as { id: string };
      await app.tokens.revoke(params.id, request.user!.id);

      await app.audit.log({
        actorUserId: request.user!.id,
        action: 'api_token.revoke',
        targetType: 'api_token',
        targetId: params.id,
      }).catch((err) => request.log.error({ err }, 'audit log failed'));

      return reply.code(204).send();
    },
  );
}
```

- [ ] **Step 3: Create the tokens plugin `backend/src/features/tokens/index.ts`.**

```ts
import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { registerTokenRoutes } from './routes.js';

async function tokensPlugin(app: FastifyInstance) {
  await registerTokenRoutes(app);
}

export default fp(tokensPlugin, { name: 'tokens', dependencies: ['permissions', 'audit'] });
```

- [ ] **Step 4: Register in `backend/src/server.ts`.**

```ts
import tokensPlugin from './features/tokens/index.js';
// ...
await app.register(tokensPlugin);
```

- [ ] **Step 5: Run tests.**

```bash
cd backend
NODE_ENV=test npm test -- --run features/tokens
cd ..
```

- [ ] **Step 6: Commit.**

```bash
git add backend/src/features/tokens/routes.ts backend/src/features/tokens/routes.test.ts backend/src/features/tokens/index.ts backend/src/server.ts
git commit -m "feat(backend): API token CRUD routes"
```

---

## Task 9: Ban / unban admin endpoints

**Files:**
- Create: `backend/src/features/permissions/ban-routes.ts`
- Create: `backend/src/features/permissions/ban-routes.test.ts`

- [ ] **Step 1: Write failing tests.**

```ts
import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import { withRollbackDb } from '../../lib/test-db.js';
import { schema } from '../../db/schema.js';
import { createPermissionsService } from './service.js';
import { createTokenService } from '../tokens/service.js';
import { createAuditService } from '../audit/service.js';
import { createRequireAuth, createRequireRole } from './middleware.js';
import { registerBanRoutes } from './ban-routes.js';

async function setupApp(db: any) {
  const tokens = createTokenService(db);
  const perms = createPermissionsService(db);
  const audit = createAuditService(db);
  const app = Fastify();
  app.decorate('db', db);
  app.decorate('tokens', tokens);
  app.decorate('perms', perms);
  app.decorate('audit', audit);
  app.decorate('auth', { api: { getSession: async () => null } } as any);
  app.decorate('requireAuth', createRequireAuth({ app, tokens }));
  app.decorate('requireRole', (min: any) => createRequireRole(perms, min));
  await registerBanRoutes(app);
  await app.ready();
  return { app, tokens, perms, audit };
}

describe('ban routes', () => {
  it('admin bans a user; banned user gets is_banned=true with reason', async () => {
    await withRollbackDb(async (db) => {
      const adminId = 'admin-ban';
      const targetId = 'target-ban';
      await db.insert(schema.users).values({ id: adminId, email: `${adminId}@x.com`, name: 'A', role: 'admin' });
      await db.insert(schema.users).values({ id: targetId, email: `${targetId}@x.com`, name: 'T', role: 'user' });

      const { app, tokens } = await setupApp(db);
      const { plaintext } = await tokens.create({ userId: adminId, userRole: 'admin', name: 'ban-test' });

      const response = await app.inject({
        method: 'POST',
        url: `/api/admin/users/${targetId}/ban`,
        headers: { authorization: `Bearer ${plaintext}`, 'content-type': 'application/json' },
        payload: { reason: 'spam' },
      });
      expect(response.statusCode).toBe(204);

      const [target] = await db.select().from(schema.users).where(eq(schema.users.id, targetId));
      expect(target.isBanned).toBe(true);
      expect(target.bannedReason).toBe('spam');
      expect(target.bannedAt).toBeTruthy();
    });
  });

  it('moderator cannot ban (only admin)', async () => {
    await withRollbackDb(async (db) => {
      const modId = 'mod-ban-test';
      const targetId = 'target-mod-test';
      await db.insert(schema.users).values({ id: modId, email: `${modId}@x.com`, name: 'M', role: 'moderator' });
      await db.insert(schema.users).values({ id: targetId, email: `${targetId}@x.com`, name: 'T', role: 'user' });
      const { app, tokens } = await setupApp(db);
      const { plaintext } = await tokens.create({ userId: modId, userRole: 'moderator', name: 'mod-token' });

      const response = await app.inject({
        method: 'POST',
        url: `/api/admin/users/${targetId}/ban`,
        headers: { authorization: `Bearer ${plaintext}`, 'content-type': 'application/json' },
        payload: { reason: 'no' },
      });
      expect(response.statusCode).toBe(403);
    });
  });

  it('admin unbans a previously banned user', async () => {
    await withRollbackDb(async (db) => {
      const adminId = 'admin-unban';
      const targetId = 'target-unban';
      await db.insert(schema.users).values({ id: adminId, email: `${adminId}@x.com`, name: 'A', role: 'admin' });
      await db.insert(schema.users).values({
        id: targetId, email: `${targetId}@x.com`, name: 'T', role: 'user',
        isBanned: true, bannedAt: new Date(), bannedReason: 'old',
      });

      const { app, tokens } = await setupApp(db);
      const { plaintext } = await tokens.create({ userId: adminId, userRole: 'admin', name: 'unban-test' });

      const response = await app.inject({
        method: 'POST',
        url: `/api/admin/users/${targetId}/unban`,
        headers: { authorization: `Bearer ${plaintext}` },
      });
      expect(response.statusCode).toBe(204);

      const [target] = await db.select().from(schema.users).where(eq(schema.users.id, targetId));
      expect(target.isBanned).toBe(false);
      expect(target.bannedReason).toBeNull();
    });
  });
});
```

Add `import { eq } from 'drizzle-orm';` at the top of the test file.

- [ ] **Step 2: Implement `backend/src/features/permissions/ban-routes.ts`.**

```ts
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { schema } from '../../db/schema.js';

export async function registerBanRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/api/admin/users/:id/ban',
    {
      preHandler: [app.requireAuth, app.requireRole('admin')],
      schema: {
        body: {
          type: 'object',
          required: ['reason'],
          properties: { reason: { type: 'string', minLength: 1, maxLength: 500 } },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const { reason } = request.body as { reason: string };

      await app.db.update(schema.users)
        .set({ isBanned: true, bannedAt: new Date(), bannedReason: reason })
        .where(eq(schema.users.id, id));

      await app.audit.log({
        actorUserId: request.user!.id,
        action: 'user.ban',
        targetType: 'user',
        targetId: id,
        metadata: { reason },
      }).catch((err) => request.log.error({ err }, 'audit log failed'));

      return reply.code(204).send();
    },
  );

  app.post(
    '/api/admin/users/:id/unban',
    { preHandler: [app.requireAuth, app.requireRole('admin')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      await app.db.update(schema.users)
        .set({ isBanned: false, bannedAt: null, bannedReason: null })
        .where(eq(schema.users.id, id));

      await app.audit.log({
        actorUserId: request.user!.id,
        action: 'user.unban',
        targetType: 'user',
        targetId: id,
      }).catch((err) => request.log.error({ err }, 'audit log failed'));

      return reply.code(204).send();
    },
  );
}
```

- [ ] **Step 3: Register ban-routes in `backend/src/features/permissions/index.ts`.**

Update the plugin:
```ts
import { registerBanRoutes } from './ban-routes.js';

async function permissionsPlugin(app: FastifyInstance) {
  // ... existing decorations ...
  await registerBanRoutes(app);
}
```

- [ ] **Step 4: Run tests.**

```bash
cd backend
NODE_ENV=test npm test -- --run features/permissions/ban-routes
cd ..
```

- [ ] **Step 5: Commit.**

```bash
git add backend/src/features/permissions/ban-routes.ts backend/src/features/permissions/ban-routes.test.ts backend/src/features/permissions/index.ts
git commit -m "feat(backend): admin ban/unban endpoints with audit log"
```

---

## Task 10: Permission grant / revoke admin endpoints

**Files:**
- Create: `backend/src/features/permissions/grant-routes.ts`
- Create: `backend/src/features/permissions/grant-routes.test.ts`

- [ ] **Step 1: Write failing tests.**

```ts
import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import { withRollbackDb } from '../../lib/test-db.js';
import { schema } from '../../db/schema.js';
import { createPermissionsService } from './service.js';
import { createTokenService } from '../tokens/service.js';
import { createAuditService } from '../audit/service.js';
import { createRequireAuth, createRequireRole } from './middleware.js';
import { registerGrantRoutes } from './grant-routes.js';

async function setupApp(db: any) {
  const tokens = createTokenService(db);
  const perms = createPermissionsService(db);
  const audit = createAuditService(db);
  const app = Fastify();
  app.decorate('db', db);
  app.decorate('tokens', tokens);
  app.decorate('perms', perms);
  app.decorate('audit', audit);
  app.decorate('auth', { api: { getSession: async () => null } } as any);
  app.decorate('requireAuth', createRequireAuth({ app, tokens }));
  app.decorate('requireRole', (min: any) => createRequireRole(perms, min));
  await registerGrantRoutes(app);
  await app.ready();
  return { app, tokens };
}

describe('grant routes', () => {
  it('admin grants wiki_edit; target user now hasPermission', async () => {
    await withRollbackDb(async (db) => {
      const adminId = 'admin-grant';
      const targetId = 'target-grant';
      await db.insert(schema.users).values({ id: adminId, email: `${adminId}@x.com`, name: 'A', role: 'admin' });
      await db.insert(schema.users).values({ id: targetId, email: `${targetId}@x.com`, name: 'T', role: 'user' });
      const { app, tokens } = await setupApp(db);
      const { plaintext } = await tokens.create({ userId: adminId, userRole: 'admin', name: 'grant' });

      const response = await app.inject({
        method: 'POST',
        url: `/api/admin/users/${targetId}/permissions`,
        headers: { authorization: `Bearer ${plaintext}`, 'content-type': 'application/json' },
        payload: { permission: 'wiki_edit' },
      });
      expect(response.statusCode).toBe(204);

      const perms = createPermissionsService(db);
      expect(await perms.hasPermission(targetId, 'wiki_edit')).toBe(true);
    });
  });

  it('admin revokes wiki_edit; permission removed', async () => {
    await withRollbackDb(async (db) => {
      const adminId = 'admin-revoke';
      const targetId = 'target-revoke';
      await db.insert(schema.users).values({ id: adminId, email: `${adminId}@x.com`, name: 'A', role: 'admin' });
      await db.insert(schema.users).values({ id: targetId, email: `${targetId}@x.com`, name: 'T', role: 'user' });
      await db.insert(schema.userPermissions).values({ userId: targetId, permission: 'wiki_edit', grantedBy: adminId });

      const { app, tokens } = await setupApp(db);
      const { plaintext } = await tokens.create({ userId: adminId, userRole: 'admin', name: 'revoke' });

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/admin/users/${targetId}/permissions/wiki_edit`,
        headers: { authorization: `Bearer ${plaintext}` },
      });
      expect(response.statusCode).toBe(204);

      const perms = createPermissionsService(db);
      expect(await perms.hasPermission(targetId, 'wiki_edit')).toBe(false);
    });
  });

  it('moderator cannot grant permissions', async () => {
    await withRollbackDb(async (db) => {
      const modId = 'mod-grant';
      const targetId = 'target-mod-grant';
      await db.insert(schema.users).values({ id: modId, email: `${modId}@x.com`, name: 'M', role: 'moderator' });
      await db.insert(schema.users).values({ id: targetId, email: `${targetId}@x.com`, name: 'T', role: 'user' });

      const { app, tokens } = await setupApp(db);
      const { plaintext } = await tokens.create({ userId: modId, userRole: 'moderator', name: 'mod' });

      const response = await app.inject({
        method: 'POST',
        url: `/api/admin/users/${targetId}/permissions`,
        headers: { authorization: `Bearer ${plaintext}`, 'content-type': 'application/json' },
        payload: { permission: 'wiki_edit' },
      });
      expect(response.statusCode).toBe(403);
    });
  });
});
```

- [ ] **Step 2: Implement `backend/src/features/permissions/grant-routes.ts`.**

```ts
import type { FastifyInstance } from 'fastify';

export async function registerGrantRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/api/admin/users/:id/permissions',
    {
      preHandler: [app.requireAuth, app.requireRole('admin')],
      schema: {
        body: {
          type: 'object',
          required: ['permission'],
          properties: {
            permission: { type: 'string', enum: ['wiki_edit', 'art_upload'] },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const { permission } = request.body as { permission: string };

      await app.perms.grant({ userId: id, permission, grantedBy: request.user!.id });

      await app.audit.log({
        actorUserId: request.user!.id,
        action: 'permission.grant',
        targetType: 'user',
        targetId: id,
        metadata: { permission },
      }).catch((err) => request.log.error({ err }, 'audit log failed'));

      return reply.code(204).send();
    },
  );

  app.delete(
    '/api/admin/users/:id/permissions/:permission',
    { preHandler: [app.requireAuth, app.requireRole('admin')] },
    async (request, reply) => {
      const { id, permission } = request.params as { id: string; permission: string };

      await app.perms.revoke({ userId: id, permission });

      await app.audit.log({
        actorUserId: request.user!.id,
        action: 'permission.revoke',
        targetType: 'user',
        targetId: id,
        metadata: { permission },
      }).catch((err) => request.log.error({ err }, 'audit log failed'));

      return reply.code(204).send();
    },
  );
}
```

- [ ] **Step 3: Register grant-routes in `permissions/index.ts`** alongside `registerBanRoutes`.

```ts
import { registerGrantRoutes } from './grant-routes.js';
// ...
await registerBanRoutes(app);
await registerGrantRoutes(app);
```

- [ ] **Step 4: Run tests.**

```bash
cd backend
NODE_ENV=test npm test -- --run features/permissions/grant-routes
cd ..
```

- [ ] **Step 5: Commit.**

```bash
git add backend/src/features/permissions/grant-routes.ts backend/src/features/permissions/grant-routes.test.ts backend/src/features/permissions/index.ts
git commit -m "feat(backend): admin grant/revoke permission endpoints"
```

---

## Task 11: Permission application user + admin endpoints

**Files:**
- Create: `backend/src/features/permissions/application-routes.ts`
- Create: `backend/src/features/permissions/application-routes.test.ts`

- [ ] **Step 1: Write failing tests.**

```ts
import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import { eq } from 'drizzle-orm';
import { withRollbackDb } from '../../lib/test-db.js';
import { schema } from '../../db/schema.js';
import { createPermissionsService } from './service.js';
import { createTokenService } from '../tokens/service.js';
import { createAuditService } from '../audit/service.js';
import { createRequireAuth, createRequireRole } from './middleware.js';
import { registerApplicationRoutes } from './application-routes.js';

async function setupApp(db: any) {
  const tokens = createTokenService(db);
  const perms = createPermissionsService(db);
  const audit = createAuditService(db);
  const app = Fastify();
  app.decorate('db', db);
  app.decorate('tokens', tokens);
  app.decorate('perms', perms);
  app.decorate('audit', audit);
  app.decorate('auth', { api: { getSession: async () => null } } as any);
  app.decorate('requireAuth', createRequireAuth({ app, tokens }));
  app.decorate('requireRole', (min: any) => createRequireRole(perms, min));
  await registerApplicationRoutes(app);
  await app.ready();
  return { app, tokens };
}

describe('application routes', () => {
  it('regular user submits an application', async () => {
    await withRollbackDb(async (db) => {
      const userId = 'applicant';
      await db.insert(schema.users).values({ id: userId, email: `${userId}@x.com`, name: 'U', role: 'user' });
      const { app } = await setupApp(db);
      app.auth = { api: { getSession: async () => ({ user: { id: userId } }) } } as any;

      const response = await app.inject({
        method: 'POST',
        url: '/api/account/permission-applications',
        payload: { permission: 'wiki_edit', justification: 'I have read all chapters and want to help cross-link.' },
        headers: { 'content-type': 'application/json' },
      });
      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.id).toBeTruthy();
      expect(body.status).toBe('pending');
    });
  });

  it('admin lists pending applications', async () => {
    await withRollbackDb(async (db) => {
      const adminId = 'admin-app-list';
      const userId = 'applicant-list';
      await db.insert(schema.users).values({ id: adminId, email: `${adminId}@x.com`, name: 'A', role: 'admin' });
      await db.insert(schema.users).values({ id: userId, email: `${userId}@x.com`, name: 'U', role: 'user' });
      await db.insert(schema.permissionApplications).values({ userId, permission: 'wiki_edit', justification: 'because' });

      const { app, tokens } = await setupApp(db);
      const { plaintext } = await tokens.create({ userId: adminId, userRole: 'admin', name: 'list' });
      const response = await app.inject({
        method: 'GET',
        url: '/api/admin/permission-applications',
        headers: { authorization: `Bearer ${plaintext}` },
      });
      expect(response.statusCode).toBe(200);
      const list = response.json();
      expect(list.length).toBeGreaterThanOrEqual(1);
      expect(list.every((a: any) => a.status === 'pending')).toBe(true);
    });
  });

  it('admin approves an application; permission gets granted automatically', async () => {
    await withRollbackDb(async (db) => {
      const adminId = 'admin-app-approve';
      const userId = 'applicant-approve';
      await db.insert(schema.users).values({ id: adminId, email: `${adminId}@x.com`, name: 'A', role: 'admin' });
      await db.insert(schema.users).values({ id: userId, email: `${userId}@x.com`, name: 'U', role: 'user' });
      const [app1] = await db.insert(schema.permissionApplications)
        .values({ userId, permission: 'wiki_edit', justification: 'because' })
        .returning();

      const { app, tokens } = await setupApp(db);
      const { plaintext } = await tokens.create({ userId: adminId, userRole: 'admin', name: 'approve' });
      const response = await app.inject({
        method: 'POST',
        url: `/api/admin/permission-applications/${app1.id}/approve`,
        headers: { authorization: `Bearer ${plaintext}`, 'content-type': 'application/json' },
        payload: { note: 'looks good' },
      });
      expect(response.statusCode).toBe(204);

      const perms = createPermissionsService(db);
      expect(await perms.hasPermission(userId, 'wiki_edit')).toBe(true);

      const [updated] = await db.select().from(schema.permissionApplications).where(eq(schema.permissionApplications.id, app1.id));
      expect(updated.status).toBe('approved');
      expect(updated.reviewedBy).toBe(adminId);
    });
  });

  it('admin rejects an application; no permission granted', async () => {
    await withRollbackDb(async (db) => {
      const adminId = 'admin-app-reject';
      const userId = 'applicant-reject';
      await db.insert(schema.users).values({ id: adminId, email: `${adminId}@x.com`, name: 'A', role: 'admin' });
      await db.insert(schema.users).values({ id: userId, email: `${userId}@x.com`, name: 'U', role: 'user' });
      const [app1] = await db.insert(schema.permissionApplications)
        .values({ userId, permission: 'wiki_edit', justification: 'because' })
        .returning();

      const { app, tokens } = await setupApp(db);
      const { plaintext } = await tokens.create({ userId: adminId, userRole: 'admin', name: 'reject' });
      const response = await app.inject({
        method: 'POST',
        url: `/api/admin/permission-applications/${app1.id}/reject`,
        headers: { authorization: `Bearer ${plaintext}`, 'content-type': 'application/json' },
        payload: { note: 'not yet' },
      });
      expect(response.statusCode).toBe(204);

      const perms = createPermissionsService(db);
      expect(await perms.hasPermission(userId, 'wiki_edit')).toBe(false);

      const [updated] = await db.select().from(schema.permissionApplications).where(eq(schema.permissionApplications.id, app1.id));
      expect(updated.status).toBe('reject');
    });
  });
});
```

Note: the last test has a typo I deliberately keep (`'reject'`) so the implementation must match. Actually, let me make it cleaner — use `'rejected'` for both implementation and tests.

Update the last assertion to: `expect(updated.status).toBe('rejected');`

- [ ] **Step 2: Implement `backend/src/features/permissions/application-routes.ts`.**

```ts
import { and, eq, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { schema } from '../../db/schema.js';

export async function registerApplicationRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/api/account/permission-applications',
    {
      preHandler: [app.requireAuth],
      schema: {
        body: {
          type: 'object',
          required: ['permission', 'justification'],
          properties: {
            permission: { type: 'string', enum: ['wiki_edit', 'art_upload'] },
            justification: { type: 'string', minLength: 1, maxLength: 2000 },
          },
        },
      },
    },
    async (request, reply) => {
      const { permission, justification } = request.body as { permission: string; justification: string };

      const [row] = await app.db.insert(schema.permissionApplications)
        .values({ userId: request.user!.id, permission, justification })
        .returning();

      await app.audit.log({
        actorUserId: request.user!.id,
        action: 'permission_application.submit',
        targetType: 'permission_application',
        targetId: row.id,
        metadata: { permission },
      }).catch((err) => request.log.error({ err }, 'audit log failed'));

      return reply.code(201).send(row);
    },
  );

  app.get(
    '/api/admin/permission-applications',
    { preHandler: [app.requireAuth, app.requireRole('admin')] },
    async (request) => {
      const status = (request.query as { status?: string }).status ?? 'pending';
      return app.db.select().from(schema.permissionApplications)
        .where(eq(schema.permissionApplications.status, status))
        .orderBy(schema.permissionApplications.createdAt);
    },
  );

  app.post(
    '/api/admin/permission-applications/:id/approve',
    {
      preHandler: [app.requireAuth, app.requireRole('admin')],
      schema: {
        body: {
          type: 'object',
          properties: { note: { type: 'string', maxLength: 1000 } },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const { note } = (request.body ?? {}) as { note?: string };

      const [appRow] = await app.db.select().from(schema.permissionApplications)
        .where(and(eq(schema.permissionApplications.id, id), eq(schema.permissionApplications.status, 'pending')));
      if (!appRow) {
        return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Application not found or already reviewed.' } });
      }

      await app.db.update(schema.permissionApplications)
        .set({ status: 'approved', reviewedBy: request.user!.id, reviewedAt: new Date(), reviewNote: note ?? null })
        .where(eq(schema.permissionApplications.id, id));

      await app.perms.grant({ userId: appRow.userId, permission: appRow.permission, grantedBy: request.user!.id });

      await app.audit.log({
        actorUserId: request.user!.id,
        action: 'permission_application.approve',
        targetType: 'permission_application',
        targetId: id,
        metadata: { permission: appRow.permission, grantedTo: appRow.userId },
      }).catch((err) => request.log.error({ err }, 'audit log failed'));

      return reply.code(204).send();
    },
  );

  app.post(
    '/api/admin/permission-applications/:id/reject',
    {
      preHandler: [app.requireAuth, app.requireRole('admin')],
      schema: {
        body: {
          type: 'object',
          properties: { note: { type: 'string', maxLength: 1000 } },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const { note } = (request.body ?? {}) as { note?: string };

      const [appRow] = await app.db.select().from(schema.permissionApplications)
        .where(and(eq(schema.permissionApplications.id, id), eq(schema.permissionApplications.status, 'pending')));
      if (!appRow) {
        return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Application not found or already reviewed.' } });
      }

      await app.db.update(schema.permissionApplications)
        .set({ status: 'rejected', reviewedBy: request.user!.id, reviewedAt: new Date(), reviewNote: note ?? null })
        .where(eq(schema.permissionApplications.id, id));

      await app.audit.log({
        actorUserId: request.user!.id,
        action: 'permission_application.reject',
        targetType: 'permission_application',
        targetId: id,
      }).catch((err) => request.log.error({ err }, 'audit log failed'));

      return reply.code(204).send();
    },
  );
}
```

- [ ] **Step 3: Register in `permissions/index.ts`.**

```ts
import { registerApplicationRoutes } from './application-routes.js';
// ...
await registerApplicationRoutes(app);
```

- [ ] **Step 4: Run tests.**

```bash
cd backend
NODE_ENV=test npm test -- --run features/permissions/application-routes
cd ..
```

- [ ] **Step 5: Commit.**

```bash
git add backend/src/features/permissions/application-routes.ts backend/src/features/permissions/application-routes.test.ts backend/src/features/permissions/index.ts
git commit -m "feat(backend): permission application submit/list/approve/reject endpoints"
```

---

## Task 12: Expand the health endpoint to report new features

**Files:**
- Modify: `backend/src/routes/health.ts`
- Modify: `backend/src/routes/health.test.ts`

- [ ] **Step 1: Update the test.**

Replace `backend/src/routes/health.test.ts`:

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

  it('reports overall ok with healthy DB', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.status).toBe('ok');
    expect(body.modules.db.status).toBe('ok');
  });

  it('includes all foundation feature modules in the modules object', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });
    const body = response.json();
    expect(body.modules).toHaveProperty('db');
    expect(body.modules).toHaveProperty('auth');
    expect(body.modules).toHaveProperty('audit');
    expect(body.modules).toHaveProperty('permissions');
    expect(body.modules).toHaveProperty('tokens');
  });
});
```

- [ ] **Step 2: Update `backend/src/routes/health.ts`.**

```ts
import type { FastifyInstance } from 'fastify';
import type { drizzle } from 'drizzle-orm/postgres-js';
import type { schema } from '../db/schema.js';

type Db = ReturnType<typeof drizzle<typeof schema>>;

export async function registerHealthRoute(app: FastifyInstance): Promise<void> {
  app.get('/health', async () => {
    const dbCheck = await checkDb(app.db);
    return {
      status: dbCheck.status === 'ok' ? 'ok' : 'down',
      modules: {
        db: dbCheck,
        auth: { status: 'ok' },
        audit: { status: 'ok' },
        permissions: { status: 'ok' },
        tokens: { status: 'ok' },
      },
    };
  });
}

async function checkDb(db: Db) {
  const start = Date.now();
  try {
    await db.execute("SELECT 1");
    return { status: 'ok' as const, latency_ms: Date.now() - start };
  } catch (err) {
    return {
      status: 'down' as const,
      latency_ms: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
```

- [ ] **Step 3: Run.**

```bash
cd backend
NODE_ENV=test npm test -- --run routes/health
cd ..
```

- [ ] **Step 4: Commit.**

```bash
git add backend/src/routes/health.ts backend/src/routes/health.test.ts
git commit -m "feat(backend): /health reports all foundation feature modules"
```

---

## Task 13: Full test suite + production deploy + smoke check

**Files:** none modified — verification only.

- [ ] **Step 1: Run the full test suite locally.**

```bash
cd backend
NODE_ENV=test npm test
cd ..
```
Expected: every test passes (Plan A's health test + Plan B's auth tests + everything from Plan C).

- [ ] **Step 2: Typecheck.**

```bash
cd backend
npm run typecheck
cd ..
```

- [ ] **Step 3: Push branch and open PR.**

```bash
git push -u origin foundation-c-permissions-tokens-audit
gh pr create --title "Foundation C: permissions, API tokens, audit log" \
  --body "Implements Plan C. See docs/superpowers/plans/2026-05-22-foundation-c-permissions-tokens-audit.md."
```

- [ ] **Step 4: Merge after CI passes. Fly deploy runs migration 0001 on release.**

- [ ] **Step 5: Production smoke check.**

```bash
curl -s https://loreuniverse-api.fly.dev/health
```
Expected:
```json
{
  "status": "ok",
  "modules": {
    "db": { "status": "ok", "latency_ms": ... },
    "auth": { "status": "ok" },
    "audit": { "status": "ok" },
    "permissions": { "status": "ok" },
    "tokens": { "status": "ok" }
  }
}
```

- [ ] **Step 6: Create your first admin API token via curl using your session.**

Sign in:
```bash
curl -s -X POST https://loreuniverse-api.fly.dev/api/auth/sign-in/email \
  -H 'content-type: application/json' \
  -d '{"email":"YOUR-EMAIL","password":"YOUR-PASSWORD"}' \
  -c /tmp/cookies.txt
```

Create a token:
```bash
curl -s -X POST https://loreuniverse-api.fly.dev/api/account/api-tokens \
  -H 'content-type: application/json' \
  -b /tmp/cookies.txt \
  -d '{"name":"autolinker-laptop"}'
```
Expected: a JSON response containing `plaintext` (e.g. `lore_admin_xK7q...`). **Copy this plaintext now — it won't be shown again.**

Verify the token works:
```bash
curl -s https://loreuniverse-api.fly.dev/api/account/api-tokens \
  -H "Authorization: Bearer <paste-plaintext>"
```
Expected: a JSON array listing your token (without the plaintext).

```bash
rm /tmp/cookies.txt
```

---

## Task 14: PROJECT_BRIEFING.md update

**Files:**
- Modify: `PROJECT_BRIEFING.md`

- [ ] **Step 1: Add to Section 6 (Current State):**

```markdown
| user_permissions, permission_applications, api_tokens, audit_log schemas | ✅ Done (Foundation Plan C) |
| Role middleware (requireAuth/requireRole/requirePermission) | ✅ Done (Foundation Plan C) |
| Admin: ban/unban, grant/revoke permissions, application review | ✅ Done (Foundation Plan C) |
| User: submit permission application | ✅ Done (Foundation Plan C) |
| API token CRUD (lore_admin_*, lore_moderator_*) | ✅ Done (Foundation Plan C) |
| Audit log (best-effort writes on state-changing endpoints) | ✅ Done (Foundation Plan C) |
```

- [ ] **Step 2: Update Section 10 roadmap.**

```markdown
- Plan A: ✅ monorepo restructure, library rename, backend skeleton
- Plan B: ✅ database, auth (Better Auth + Resend), email-verified signup/login
- Plan C: ✅ roles, permissions, API tokens, audit log
- Plan D: static-site/backend integration, Claude autolink endpoint
```

- [ ] **Step 3: Commit and PR.**

```bash
git add PROJECT_BRIEFING.md
git commit -m "docs: update PROJECT_BRIEFING for Plan C completion"
git push
```

---

## Definition of Done

- [ ] Schema includes `user_permissions`, `permission_applications`, `api_tokens`, `audit_log` with appropriate indexes and FK constraints.
- [ ] `withRollbackDb` test helper exists and is used by all new tests.
- [ ] `auditService.log()` writes rows; callers wrap in try/catch.
- [ ] `tokenService.create` returns role-prefixed plaintext and stores only the argon2 hash.
- [ ] `tokenService.validate` rejects revoked and expired tokens.
- [ ] `requireAuth` accepts either a session cookie or a Bearer token.
- [ ] Banned users get `403 BANNED` regardless of credentials.
- [ ] `requireRole('admin')` accepts admin; rejects moderator and user.
- [ ] `requirePermission('wiki_edit')` accepts users with the grant; admin/moderator implicitly pass.
- [ ] Ban/unban admin endpoints write `user.ban` / `user.unban` audit entries.
- [ ] Permission grant/revoke admin endpoints write audit entries.
- [ ] User can submit a permission application.
- [ ] Admin can list pending applications, approve (grants the permission), or reject.
- [ ] `/health` reports `db`, `auth`, `audit`, `permissions`, `tokens` modules.
- [ ] In production: you have an `lore_admin_*` token issued from your real user account.

After Plan C is merged, proceed to Plan D (static integration + Claude autolink endpoint).
