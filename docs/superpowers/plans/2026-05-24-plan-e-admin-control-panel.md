# Admin Control Panel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a six-page admin panel at `/admin/` using Eleventy + Alpine.js, backed by four new API endpoints, so the site owner can manage wiki entries, users, tokens, applications, and audit logs from the browser.

**Architecture:** The admin panel is a static Eleventy section; every `.njk` page is an Alpine.js data component that checks the Better Auth session on load and redirects non-admins, then fetches data from `loreuniverse-api.fly.dev` at runtime. A shared `admin.njk` layout (extending `base.njk`) loads the Alpine.js CDN script and renders a sidebar nav. All real access control is enforced at the API layer; the frontend redirect is UX only.

**Tech Stack:** Alpine.js CDN, Eleventy 3 Nunjucks templates, Fastify TypeScript backend

---

## Task E-1: Backend — `GET /api/admin/wiki` and `PATCH /api/admin/wiki/:category/:slug`

**Context:** The existing `GET /api/wiki/all` only returns published entries. The admin panel needs all entries including unpublished ones, and needs to toggle `isPublished` without a full content PUT.

**Files:**
- Modify: `backend/src/features/wiki/routes.ts`
- Modify: `backend/src/features/wiki/routes.test.ts`

- [ ] **Step 1: Add `GET /api/admin/wiki` to `routes.ts`**

  Insert after the existing `GET /api/wiki/all` handler (before the `GET /api/wiki/:category/:slug` handler):

  ```typescript
  app.get(
    '/api/admin/wiki',
    { preHandler: [app.requireAuth, app.requireRole('admin')] },
    async () => {
      return app.db.select().from(schema.wikiEntries).orderBy(
        schema.wikiEntries.category,
        schema.wikiEntries.slug,
      );
    },
  );
  ```

- [ ] **Step 2: Add `PATCH /api/admin/wiki/:category/:slug` to `routes.ts`**

  Insert after the GET handler above:

  ```typescript
  app.patch(
    '/api/admin/wiki/:category/:slug',
    {
      preHandler: [app.requireAuth, app.requireRole('admin')],
      schema: {
        body: {
          type: 'object',
          required: ['isPublished'],
          properties: {
            isPublished: { type: 'boolean' },
          },
        },
      },
    },
    async (request, reply) => {
      const { category, slug } = request.params as { category: string; slug: string };
      const { isPublished } = request.body as { isPublished: boolean };

      const [existing] = await app.db.select().from(schema.wikiEntries)
        .where(and(
          eq(schema.wikiEntries.category, category),
          eq(schema.wikiEntries.slug, slug),
        ));
      if (!existing) {
        return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Entry not found.' } });
      }

      const [entry] = await app.db.update(schema.wikiEntries)
        .set({ isPublished, updatedAt: new Date() })
        .where(eq(schema.wikiEntries.id, existing.id))
        .returning();

      await app.audit.log({
        actorUserId: request.user!.id,
        action: isPublished ? 'wiki.publish' : 'wiki.unpublish',
        targetType: 'wiki_entry',
        targetId: existing.id,
        metadata: { category, slug },
      }).catch((err) => request.log.error({ err }, 'audit log failed'));

      return reply.send(entry);
    },
  );
  ```

- [ ] **Step 3: Add tests to `routes.test.ts`**

  Append these two `it` blocks inside `describe('wiki routes', ...)`:

  ```typescript
  it('GET /api/admin/wiki returns all entries including unpublished', async () => {
    await withRollbackDb(async (db) => {
      const adminId = 'admin-wiki-list';
      await db.insert(schema.users).values({ id: adminId, email: `${adminId}@x.com`, name: 'A', role: 'admin' });
      await db.insert(schema.wikiEntries).values([
        { category: 'characters', slug: 'aldren', name: 'Aldren', frontMatter: {}, body: 'Body.', isPublished: true },
        { category: 'locations', slug: 'vale', name: 'Vale', frontMatter: {}, body: 'Hidden.', isPublished: false },
      ]);
      const { app, tokens } = await setupApp(db);
      const { plaintext } = await tokens.create({ userId: adminId, userRole: 'admin', name: 'test' });

      const response = await app.inject({
        method: 'GET',
        url: '/api/admin/wiki',
        headers: { authorization: `Bearer ${plaintext}` },
      });
      expect(response.statusCode).toBe(200);
      const list = response.json();
      expect(list).toHaveLength(2);
      expect(list.map((e: any) => e.slug).sort()).toEqual(['aldren', 'vale']);
    });
  });

  it('GET /api/admin/wiki returns 403 for non-admin', async () => {
    await withRollbackDb(async (db) => {
      const userId = 'regular-wiki';
      await db.insert(schema.users).values({ id: userId, email: `${userId}@x.com`, name: 'R', role: 'user' });
      const { app, tokens } = await setupApp(db);
      const { plaintext } = await tokens.create({ userId, userRole: 'user', name: 'test' });

      const response = await app.inject({
        method: 'GET',
        url: '/api/admin/wiki',
        headers: { authorization: `Bearer ${plaintext}` },
      });
      expect(response.statusCode).toBe(403);
    });
  });

  it('PATCH /api/admin/wiki/:category/:slug toggles isPublished and writes audit log', async () => {
    await withRollbackDb(async (db) => {
      const adminId = 'admin-patch-wiki';
      await db.insert(schema.users).values({ id: adminId, email: `${adminId}@x.com`, name: 'A', role: 'admin' });
      await db.insert(schema.wikiEntries).values({
        category: 'characters', slug: 'test-char', name: 'Test', frontMatter: {}, body: 'Body.', isPublished: true,
      });
      const { app, tokens } = await setupApp(db);
      const { plaintext } = await tokens.create({ userId: adminId, userRole: 'admin', name: 'test' });

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/admin/wiki/characters/test-char',
        headers: { authorization: `Bearer ${plaintext}`, 'content-type': 'application/json' },
        payload: { isPublished: false },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().isPublished).toBe(false);

      const [entry] = await db.select().from(schema.wikiEntries);
      expect(entry.isPublished).toBe(false);

      const logs = await db.select().from(schema.auditLog);
      expect(logs).toHaveLength(1);
      expect(logs[0].action).toBe('wiki.unpublish');
    });
  });

  it('PATCH /api/admin/wiki/:category/:slug returns 404 for missing entry', async () => {
    await withRollbackDb(async (db) => {
      const adminId = 'admin-patch-404';
      await db.insert(schema.users).values({ id: adminId, email: `${adminId}@x.com`, name: 'A', role: 'admin' });
      const { app, tokens } = await setupApp(db);
      const { plaintext } = await tokens.create({ userId: adminId, userRole: 'admin', name: 'test' });

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/admin/wiki/characters/nonexistent',
        headers: { authorization: `Bearer ${plaintext}`, 'content-type': 'application/json' },
        payload: { isPublished: false },
      });
      expect(response.statusCode).toBe(404);
    });
  });
  ```

- [ ] **Step 4: Run tests**

  ```
  cd backend && npx vitest run src/features/wiki/routes.test.ts
  ```

  Expected: all tests pass (including the 4 new ones).

- [ ] **Step 5: Commit**

  ```
  git add backend/src/features/wiki/routes.ts backend/src/features/wiki/routes.test.ts
  git commit -m "feat(wiki): add GET /api/admin/wiki and PATCH publish toggle"
  ```

---

## Task E-2: Backend — `GET /api/admin/users`

**Context:** The users page needs a paginated user list. Ban/unban endpoints already exist in `ban-routes.ts`.

**Files:**
- Create: `backend/src/features/admin/user-routes.ts`
- Create: `backend/src/features/admin/user-routes.test.ts`
- Modify: `backend/src/features/admin/index.ts`

- [ ] **Step 1: Create `user-routes.ts`**

  ```typescript
  import { count, desc } from 'drizzle-orm';
  import type { FastifyInstance } from 'fastify';
  import { schema } from '../../db/schema.js';

  export async function registerAdminUserRoutes(app: FastifyInstance): Promise<void> {
    app.get(
      '/api/admin/users',
      { preHandler: [app.requireAuth, app.requireRole('admin')] },
      async (request) => {
        const query = request.query as { page?: string; limit?: string };
        const page  = Math.max(1, parseInt(query.page  ?? '1',  10));
        const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? '50', 10)));
        const offset = (page - 1) * limit;

        const [{ total }] = await app.db.select({ total: count() }).from(schema.users);

        const users = await app.db.select({
          id:           schema.users.id,
          email:        schema.users.email,
          name:         schema.users.name,
          role:         schema.users.role,
          isBanned:     schema.users.isBanned,
          bannedAt:     schema.users.bannedAt,
          bannedReason: schema.users.bannedReason,
          emailVerified: schema.users.emailVerified,
          createdAt:    schema.users.createdAt,
        })
          .from(schema.users)
          .orderBy(desc(schema.users.createdAt))
          .limit(limit)
          .offset(offset);

        return { users, total, page, limit };
      },
    );
  }
  ```

- [ ] **Step 2: Create `user-routes.test.ts`**

  ```typescript
  import { describe, it, expect } from 'vitest';
  import Fastify from 'fastify';
  import { withRollbackDb } from '../../lib/test-db.js';
  import { schema } from '../../db/schema.js';
  import { createPermissionsService } from '../permissions/service.js';
  import { createTokenService } from '../tokens/service.js';
  import { createAuditService } from '../audit/service.js';
  import { createRequireAuth, createRequireRole } from '../permissions/middleware.js';
  import { registerAdminUserRoutes } from './user-routes.js';

  async function setupApp(db: any) {
    const tokens = createTokenService(db);
    const perms  = createPermissionsService(db);
    const audit  = createAuditService(db);
    const app    = Fastify();
    app.decorate('db',     db);
    app.decorate('tokens', tokens);
    app.decorate('perms',  perms);
    app.decorate('audit',  audit);
    app.decorate('auth',   { api: { getSession: async () => null } } as any);
    app.decorate('requireAuth', createRequireAuth({ app, tokens }));
    app.decorate('requireRole', (min: any) => createRequireRole(perms, min));
    await registerAdminUserRoutes(app);
    await app.ready();
    return { app, tokens };
  }

  describe('admin user routes', () => {
    it('returns 401 without auth', async () => {
      await withRollbackDb(async (db) => {
        const { app } = await setupApp(db);
        const res = await app.inject({ method: 'GET', url: '/api/admin/users' });
        expect(res.statusCode).toBe(401);
      });
    });

    it('returns 403 for non-admin', async () => {
      await withRollbackDb(async (db) => {
        const id = 'regular-user-list';
        await db.insert(schema.users).values({ id, email: `${id}@x.com`, name: 'R', role: 'user' });
        const { app, tokens } = await setupApp(db);
        const { plaintext } = await tokens.create({ userId: id, userRole: 'user', name: 'tok' });
        const res = await app.inject({
          method: 'GET', url: '/api/admin/users',
          headers: { authorization: `Bearer ${plaintext}` },
        });
        expect(res.statusCode).toBe(403);
      });
    });

    it('returns paginated user list for admin', async () => {
      await withRollbackDb(async (db) => {
        const adminId = 'admin-user-list';
        await db.insert(schema.users).values([
          { id: adminId, email: `${adminId}@x.com`, name: 'Admin', role: 'admin' },
          { id: 'user-a', email: 'a@x.com', name: 'Alice', role: 'user' },
          { id: 'user-b', email: 'b@x.com', name: 'Bob',   role: 'user' },
        ]);
        const { app, tokens } = await setupApp(db);
        const { plaintext } = await tokens.create({ userId: adminId, userRole: 'admin', name: 'tok' });

        const res = await app.inject({
          method: 'GET', url: '/api/admin/users?page=1&limit=50',
          headers: { authorization: `Bearer ${plaintext}` },
        });
        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(body.total).toBe(3);
        expect(body.users).toHaveLength(3);
        expect(body.users[0]).toHaveProperty('email');
        expect(body.users[0]).not.toHaveProperty('password');
      });
    });

    it('respects pagination parameters', async () => {
      await withRollbackDb(async (db) => {
        const adminId = 'admin-paginate';
        await db.insert(schema.users).values([
          { id: adminId, email: `${adminId}@x.com`, name: 'Admin', role: 'admin' },
          { id: 'u1', email: 'u1@x.com', name: 'U1', role: 'user' },
          { id: 'u2', email: 'u2@x.com', name: 'U2', role: 'user' },
        ]);
        const { app, tokens } = await setupApp(db);
        const { plaintext } = await tokens.create({ userId: adminId, userRole: 'admin', name: 'tok' });

        const res = await app.inject({
          method: 'GET', url: '/api/admin/users?page=2&limit=2',
          headers: { authorization: `Bearer ${plaintext}` },
        });
        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(body.total).toBe(3);
        expect(body.users).toHaveLength(1);
        expect(body.page).toBe(2);
      });
    });
  });
  ```

- [ ] **Step 3: Register in `backend/src/features/admin/index.ts`**

  Read the current `index.ts` first, then add the import and registration. The file currently registers `autolink-routes` and `site-rebuild-routes`. Add:

  ```typescript
  import { registerAdminUserRoutes } from './user-routes.js';
  ```

  And inside the plugin function body:

  ```typescript
  await registerAdminUserRoutes(app);
  ```

- [ ] **Step 4: Run tests**

  ```
  cd backend && npx vitest run src/features/admin/user-routes.test.ts
  ```

  Expected: 4 tests pass.

- [ ] **Step 5: Commit**

  ```
  git add backend/src/features/admin/user-routes.ts backend/src/features/admin/user-routes.test.ts backend/src/features/admin/index.ts
  git commit -m "feat(admin): add GET /api/admin/users with pagination"
  ```

---

## Task E-3: Backend — `GET /api/admin/audit`

**Context:** The audit service only exposes `log()` (write-only). The admin panel needs to read entries back.

**Files:**
- Create: `backend/src/features/admin/audit-routes.ts`
- Create: `backend/src/features/admin/audit-routes.test.ts`
- Modify: `backend/src/features/admin/index.ts`

- [ ] **Step 1: Create `audit-routes.ts`**

  ```typescript
  import { count, desc } from 'drizzle-orm';
  import type { FastifyInstance } from 'fastify';
  import { schema } from '../../db/schema.js';

  export async function registerAdminAuditRoutes(app: FastifyInstance): Promise<void> {
    app.get(
      '/api/admin/audit',
      { preHandler: [app.requireAuth, app.requireRole('admin')] },
      async (request) => {
        const query  = request.query as { page?: string; limit?: string };
        const page   = Math.max(1, parseInt(query.page  ?? '1',  10));
        const limit  = Math.min(100, Math.max(1, parseInt(query.limit ?? '50', 10)));
        const offset = (page - 1) * limit;

        const [{ total }] = await app.db.select({ total: count() }).from(schema.auditLog);

        const entries = await app.db.select()
          .from(schema.auditLog)
          .orderBy(desc(schema.auditLog.createdAt))
          .limit(limit)
          .offset(offset);

        return { entries, total, page, limit };
      },
    );
  }
  ```

- [ ] **Step 2: Create `audit-routes.test.ts`**

  ```typescript
  import { describe, it, expect } from 'vitest';
  import Fastify from 'fastify';
  import { withRollbackDb } from '../../lib/test-db.js';
  import { schema } from '../../db/schema.js';
  import { createPermissionsService } from '../permissions/service.js';
  import { createTokenService } from '../tokens/service.js';
  import { createAuditService } from '../audit/service.js';
  import { createRequireAuth, createRequireRole } from '../permissions/middleware.js';
  import { registerAdminAuditRoutes } from './audit-routes.js';

  async function setupApp(db: any) {
    const tokens = createTokenService(db);
    const perms  = createPermissionsService(db);
    const audit  = createAuditService(db);
    const app    = Fastify();
    app.decorate('db',     db);
    app.decorate('tokens', tokens);
    app.decorate('perms',  perms);
    app.decorate('audit',  audit);
    app.decorate('auth',   { api: { getSession: async () => null } } as any);
    app.decorate('requireAuth', createRequireAuth({ app, tokens }));
    app.decorate('requireRole', (min: any) => createRequireRole(perms, min));
    await registerAdminAuditRoutes(app);
    await app.ready();
    return { app, tokens };
  }

  describe('admin audit routes', () => {
    it('returns 401 without auth', async () => {
      await withRollbackDb(async (db) => {
        const { app } = await setupApp(db);
        const res = await app.inject({ method: 'GET', url: '/api/admin/audit' });
        expect(res.statusCode).toBe(401);
      });
    });

    it('returns 403 for non-admin', async () => {
      await withRollbackDb(async (db) => {
        const id = 'regular-audit';
        await db.insert(schema.users).values({ id, email: `${id}@x.com`, name: 'R', role: 'user' });
        const { app, tokens } = await setupApp(db);
        const { plaintext } = await tokens.create({ userId: id, userRole: 'user', name: 'tok' });
        const res = await app.inject({
          method: 'GET', url: '/api/admin/audit',
          headers: { authorization: `Bearer ${plaintext}` },
        });
        expect(res.statusCode).toBe(403);
      });
    });

    it('returns paginated audit entries newest-first', async () => {
      await withRollbackDb(async (db) => {
        const adminId = 'admin-audit-read';
        await db.insert(schema.users).values({ id: adminId, email: `${adminId}@x.com`, name: 'A', role: 'admin' });
        await db.insert(schema.auditLog).values([
          { actorUserId: adminId, action: 'wiki.edit',    targetType: 'wiki_entry', targetId: 'e1' },
          { actorUserId: adminId, action: 'site.rebuild.manual' },
        ]);
        const { app, tokens } = await setupApp(db);
        const { plaintext } = await tokens.create({ userId: adminId, userRole: 'admin', name: 'tok' });

        const res = await app.inject({
          method: 'GET', url: '/api/admin/audit',
          headers: { authorization: `Bearer ${plaintext}` },
        });
        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(body.total).toBe(2);
        expect(body.entries).toHaveLength(2);
        expect(body.entries[0]).toHaveProperty('action');
      });
    });

    it('respects pagination parameters', async () => {
      await withRollbackDb(async (db) => {
        const adminId = 'admin-audit-page';
        await db.insert(schema.users).values({ id: adminId, email: `${adminId}@x.com`, name: 'A', role: 'admin' });
        await db.insert(schema.auditLog).values([
          { actorUserId: adminId, action: 'action.one' },
          { actorUserId: adminId, action: 'action.two' },
          { actorUserId: adminId, action: 'action.three' },
        ]);
        const { app, tokens } = await setupApp(db);
        const { plaintext } = await tokens.create({ userId: adminId, userRole: 'admin', name: 'tok' });

        const res = await app.inject({
          method: 'GET', url: '/api/admin/audit?page=2&limit=2',
          headers: { authorization: `Bearer ${plaintext}` },
        });
        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(body.total).toBe(3);
        expect(body.entries).toHaveLength(1);
      });
    });
  });
  ```

- [ ] **Step 3: Register in `backend/src/features/admin/index.ts`**

  Add the import:

  ```typescript
  import { registerAdminAuditRoutes } from './audit-routes.js';
  ```

  And inside the plugin function body:

  ```typescript
  await registerAdminAuditRoutes(app);
  ```

- [ ] **Step 4: Run tests**

  ```
  cd backend && npx vitest run src/features/admin/audit-routes.test.ts
  ```

  Expected: 4 tests pass.

- [ ] **Step 5: Run all backend tests**

  ```
  cd backend && npx vitest run
  ```

  Expected: all tests pass (no regressions).

- [ ] **Step 6: Commit**

  ```
  git add backend/src/features/admin/audit-routes.ts backend/src/features/admin/audit-routes.test.ts backend/src/features/admin/index.ts
  git commit -m "feat(admin): add GET /api/admin/audit with pagination"
  ```

---

## Task E-4: Frontend — Admin layout and directory data file

**Context:** All admin pages share a layout that extends `base.njk`, adds the Alpine.js CDN script, and renders a sidebar nav. A `.11tydata.js` file applies this layout to all pages in `frontend/src/admin/` automatically.

**Files:**
- Create: `frontend/src/_includes/admin.njk`
- Create: `frontend/src/admin/admin.11tydata.js`

- [ ] **Step 1: Create `frontend/src/_includes/admin.njk`**

  ```nunjucks
  ---
  layout: base.njk
  ---

  <script src="https://cdn.jsdelivr.net/npm/alpinejs@3.14.9/dist/cdn.min.js" defer></script>

  <div class="admin-shell">
    <nav class="admin-sidebar" aria-label="Admin">
      <ul class="admin-nav">
        <li><a class="admin-nav__link" href="/admin/">Dashboard</a></li>
        <li><a class="admin-nav__link" href="/admin/wiki/">Wiki</a></li>
        <li><a class="admin-nav__link" href="/admin/users/">Users</a></li>
        <li><a class="admin-nav__link" href="/admin/applications/">Applications</a></li>
        <li><a class="admin-nav__link" href="/admin/tokens/">Tokens</a></li>
        <li><a class="admin-nav__link" href="/admin/audit/">Audit Log</a></li>
      </ul>
    </nav>

    <main class="admin-content">
      {{ content | safe }}
    </main>
  </div>
  ```

- [ ] **Step 2: Create `frontend/src/admin/admin.11tydata.js`**

  ```js
  export default {
    layout: 'admin.njk',
  };
  ```

- [ ] **Step 3: Verify Eleventy builds without error**

  ```
  cd frontend && npx @11ty/eleventy --dryrun 2>&1 | tail -5
  ```

  Expected: no errors; output ends with a line like `Wrote N files`.

- [ ] **Step 4: Commit**

  ```
  git add frontend/src/_includes/admin.njk frontend/src/admin/admin.11tydata.js
  git commit -m "feat(admin): add admin.njk layout and directory data file"
  ```

---

## Task E-5: Frontend — Dashboard (`/admin/`)

**Context:** The dashboard shows health status, quick stats, and the site rebuild button.

**Files:**
- Create: `frontend/src/admin/index.njk`

- [ ] **Step 1: Create `frontend/src/admin/index.njk`**

  ```nunjucks
  ---
  title: Admin — Dashboard
  ---

  <div x-data="dashboard()" x-init="init()">
    <h1>Dashboard</h1>

    <p x-show="loading">Loading…</p>
    <p x-show="error" x-text="error" class="admin-error"></p>

    <div x-show="!loading && !error">

      <section class="admin-section">
        <h2>Health</h2>
        <ul class="admin-health-list">
          <template x-for="[mod, status] in Object.entries(health?.modules ?? {})">
            <li class="admin-health-item">
              <span
                class="admin-health-dot"
                :class="status.status === 'ok' ? 'admin-health-dot--ok' : 'admin-health-dot--down'"
              ></span>
              <span x-text="mod"></span>
              <span x-show="status.latency_ms !== undefined" x-text="' ' + status.latency_ms + 'ms'" class="admin-health-latency"></span>
            </li>
          </template>
        </ul>
      </section>

      <section class="admin-section">
        <h2>Wiki</h2>
        <p>
          <span x-text="wikiPublished"></span> published /
          <span x-text="wikiTotal"></span> total entries
        </p>
      </section>

      <section class="admin-section">
        <h2>Actions</h2>
        <button
          class="btn-primary"
          type="button"
          :disabled="rebuilding"
          @click="rebuild()"
          x-text="rebuilding ? 'Rebuilding…' : 'Trigger Site Rebuild'"
        ></button>
        <p x-show="rebuildStatus" x-text="rebuildStatus" class="admin-status-msg"></p>
      </section>

    </div>
  </div>

  <script>
  const API = 'https://loreuniverse-api.fly.dev';

  function dashboard() {
    return {
      loading: true,
      error: null,
      health: null,
      wikiPublished: 0,
      wikiTotal: 0,
      rebuilding: false,
      rebuildStatus: '',

      async init() {
        const sessionRes = await fetch(API + '/api/auth/get-session', { credentials: 'include' });
        const session = await sessionRes.json();
        if (!session?.user || session.user.role !== 'admin') {
          location.href = '/account/?redirect=' + encodeURIComponent(location.pathname);
          return;
        }

        try {
          const [healthRes, wikiRes, wikiAdminRes] = await Promise.all([
            fetch(API + '/health'),
            fetch(API + '/api/wiki/all'),
            fetch(API + '/api/admin/wiki', { credentials: 'include' }),
          ]);
          if (!healthRes.ok) throw new Error('Health check failed');
          this.health = await healthRes.json();

          const published = await wikiRes.json();
          this.wikiPublished = Array.isArray(published) ? published.length : 0;

          if (wikiAdminRes.ok) {
            const all = await wikiAdminRes.json();
            this.wikiTotal = Array.isArray(all) ? all.length : 0;
          }
        } catch (err) {
          this.error = err.message;
        } finally {
          this.loading = false;
        }
      },

      async rebuild() {
        this.rebuilding = true;
        this.rebuildStatus = '';
        try {
          const res = await fetch(API + '/api/admin/site-rebuild', {
            method: 'POST',
            credentials: 'include',
          });
          if (res.status === 204) {
            this.rebuildStatus = 'Rebuild triggered successfully.';
          } else {
            const err = await res.json().catch(() => ({}));
            this.rebuildStatus = 'Error: ' + (err?.error?.message ?? res.status);
          }
        } catch (err) {
          this.rebuildStatus = 'Network error: ' + err.message;
        } finally {
          this.rebuilding = false;
        }
      },
    };
  }
  </script>
  ```

- [ ] **Step 2: Build and verify**

  ```
  cd frontend && npx @11ty/eleventy --dryrun 2>&1 | grep admin
  ```

  Expected: `admin/index.html` appears in the output.

- [ ] **Step 3: Commit**

  ```
  git add frontend/src/admin/index.njk
  git commit -m "feat(admin): dashboard page with health, wiki stats, and rebuild button"
  ```

---

## Task E-6: Frontend — Wiki Management (`/admin/wiki/`)

**Context:** Lists all entries (published and unpublished), detects unresolved `[[...]]` links, and provides a publish toggle.

**Files:**
- Create: `frontend/src/admin/wiki/index.njk`

- [ ] **Step 1: Create `frontend/src/admin/wiki/index.njk`**

  ```nunjucks
  ---
  title: Admin — Wiki
  ---

  <div x-data="wikiAdmin()" x-init="init()">
    <h1>Wiki Management</h1>

    <p x-show="loading">Loading…</p>
    <p x-show="error" x-text="error" class="admin-error"></p>

    <div x-show="!loading && !error">
      <p>
        <span x-text="entries.length"></span> entries total —
        <span x-text="entries.filter(e => e.isPublished).length"></span> published
      </p>

      <table class="admin-table">
        <thead>
          <tr>
            <th>Category</th>
            <th>Slug</th>
            <th>Name</th>
            <th>Published</th>
            <th>Unresolved Links</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <template x-for="entry in entries" :key="entry.id">
            <tr>
              <td x-text="entry.category"></td>
              <td x-text="entry.slug"></td>
              <td x-text="entry.name"></td>
              <td x-text="entry.isPublished ? 'Yes' : 'No'"></td>
              <td>
                <span
                  x-show="unresolvedCount(entry) > 0"
                  x-text="unresolvedCount(entry) + ' unresolved'"
                  class="admin-badge admin-badge--warn"
                ></span>
                <span x-show="unresolvedCount(entry) === 0">—</span>
              </td>
              <td>
                <button
                  class="btn-secondary"
                  type="button"
                  :disabled="togglingId === entry.id"
                  @click="togglePublish(entry)"
                  x-text="entry.isPublished ? 'Unpublish' : 'Publish'"
                ></button>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>
  </div>

  <script>
  const API = 'https://loreuniverse-api.fly.dev';
  const DOUBLE_BRACKET = /\[\[([^\]]+)\]\]/g;

  function wikiAdmin() {
    return {
      loading: true,
      error: null,
      entries: [],
      togglingId: null,

      async init() {
        const sessionRes = await fetch(API + '/api/auth/get-session', { credentials: 'include' });
        const session = await sessionRes.json();
        if (!session?.user || session.user.role !== 'admin') {
          location.href = '/account/?redirect=' + encodeURIComponent(location.pathname);
          return;
        }

        try {
          const res = await fetch(API + '/api/admin/wiki', { credentials: 'include' });
          if (!res.ok) throw new Error('Failed to load wiki entries');
          this.entries = await res.json();
        } catch (err) {
          this.error = err.message;
        } finally {
          this.loading = false;
        }
      },

      unresolvedCount(entry) {
        return (entry.body.match(DOUBLE_BRACKET) ?? []).length;
      },

      async togglePublish(entry) {
        this.togglingId = entry.id;
        const previous = entry.isPublished;
        entry.isPublished = !previous; // optimistic update
        try {
          const res = await fetch(
            API + `/api/admin/wiki/${entry.category}/${entry.slug}`,
            {
              method: 'PATCH',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ isPublished: entry.isPublished }),
            },
          );
          if (!res.ok) {
            entry.isPublished = previous; // revert
            const err = await res.json().catch(() => ({}));
            alert('Error: ' + (err?.error?.message ?? res.status));
          }
        } catch (err) {
          entry.isPublished = previous; // revert
          alert('Network error: ' + err.message);
        } finally {
          this.togglingId = null;
        }
      },
    };
  }
  </script>
  ```

- [ ] **Step 2: Commit**

  ```
  git add frontend/src/admin/wiki/index.njk
  git commit -m "feat(admin): wiki management page"
  ```

---

## Task E-7: Frontend — User Management (`/admin/users/`)

**Context:** Paginated user list with ban/unban actions.

**Files:**
- Create: `frontend/src/admin/users/index.njk`

- [ ] **Step 1: Create `frontend/src/admin/users/index.njk`**

  ```nunjucks
  ---
  title: Admin — Users
  ---

  <div x-data="usersAdmin()" x-init="init()">
    <h1>User Management</h1>

    <p x-show="loading">Loading…</p>
    <p x-show="error" x-text="error" class="admin-error"></p>

    <div x-show="!loading && !error">
      <p><span x-text="total"></span> users total</p>

      <table class="admin-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Role</th>
            <th>Banned</th>
            <th>Joined</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <template x-for="user in users" :key="user.id">
            <tr>
              <td x-text="user.name"></td>
              <td x-text="user.email"></td>
              <td>
                <span class="admin-badge" :class="'admin-badge--' + user.role" x-text="user.role"></span>
              </td>
              <td x-text="user.isBanned ? 'Yes' : 'No'"></td>
              <td x-text="new Date(user.createdAt).toLocaleDateString()"></td>
              <td>
                <template x-if="!user.isBanned">
                  <div>
                    <button
                      class="btn-danger"
                      type="button"
                      @click="startBan(user)"
                      x-show="banningId !== user.id"
                    >Ban</button>
                    <div x-show="banningId === user.id">
                      <input
                        type="text"
                        placeholder="Ban reason"
                        x-model="banReason"
                        class="admin-input"
                      >
                      <button class="btn-danger" type="button" @click="confirmBan(user)">Confirm Ban</button>
                      <button class="btn-secondary" type="button" @click="banningId = null; banReason = ''">Cancel</button>
                    </div>
                  </div>
                </template>
                <template x-if="user.isBanned">
                  <button class="btn-secondary" type="button" @click="unban(user)">Unban</button>
                </template>
              </td>
            </tr>
          </template>
        </tbody>
      </table>

      <div class="admin-pagination" x-show="total > limit">
        <button class="btn-secondary" type="button" :disabled="page === 1" @click="goPage(page - 1)">Previous</button>
        <span>Page <span x-text="page"></span></span>
        <button class="btn-secondary" type="button" :disabled="page * limit >= total" @click="goPage(page + 1)">Next</button>
      </div>
    </div>
  </div>

  <script>
  const API = 'https://loreuniverse-api.fly.dev';

  function usersAdmin() {
    return {
      loading: true,
      error: null,
      users: [],
      total: 0,
      page: 1,
      limit: 50,
      banningId: null,
      banReason: '',

      async init() {
        const sessionRes = await fetch(API + '/api/auth/get-session', { credentials: 'include' });
        const session = await sessionRes.json();
        if (!session?.user || session.user.role !== 'admin') {
          location.href = '/account/?redirect=' + encodeURIComponent(location.pathname);
          return;
        }
        await this.loadPage(1);
      },

      async loadPage(p) {
        this.loading = true;
        this.error = null;
        try {
          const res = await fetch(
            API + `/api/admin/users?page=${p}&limit=${this.limit}`,
            { credentials: 'include' },
          );
          if (!res.ok) throw new Error('Failed to load users');
          const data = await res.json();
          this.users = data.users;
          this.total = data.total;
          this.page  = data.page;
        } catch (err) {
          this.error = err.message;
        } finally {
          this.loading = false;
        }
      },

      goPage(p) {
        this.loadPage(p);
      },

      startBan(user) {
        this.banningId = user.id;
        this.banReason = '';
      },

      async confirmBan(user) {
        if (!this.banReason.trim()) { alert('Reason is required.'); return; }
        try {
          const res = await fetch(API + `/api/admin/users/${user.id}/ban`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reason: this.banReason }),
          });
          if (!res.ok) throw new Error('Ban failed');
          user.isBanned = true;
          this.banningId = null;
          this.banReason = '';
        } catch (err) {
          alert(err.message);
        }
      },

      async unban(user) {
        try {
          const res = await fetch(API + `/api/admin/users/${user.id}/unban`, {
            method: 'POST',
            credentials: 'include',
          });
          if (!res.ok) throw new Error('Unban failed');
          user.isBanned = false;
        } catch (err) {
          alert(err.message);
        }
      },
    };
  }
  </script>
  ```

- [ ] **Step 2: Commit**

  ```
  git add frontend/src/admin/users/index.njk
  git commit -m "feat(admin): user management page with ban/unban"
  ```

---

## Task E-8: Frontend — Permission Applications (`/admin/applications/`)

**Context:** Existing endpoints handle listing and approving/rejecting. This page just needs a UI.

**Files:**
- Create: `frontend/src/admin/applications/index.njk`

- [ ] **Step 1: Create `frontend/src/admin/applications/index.njk`**

  ```nunjucks
  ---
  title: Admin — Applications
  ---

  <div x-data="applicationsAdmin()" x-init="init()">
    <h1>Permission Applications</h1>

    <p x-show="loading">Loading…</p>
    <p x-show="error" x-text="error" class="admin-error"></p>

    <div x-show="!loading && !error">
      <p x-show="applications.length === 0">No pending applications.</p>

      <div x-show="applications.length > 0">
        <template x-for="app in applications" :key="app.id">
          <div class="admin-card">
            <div class="admin-card__header">
              <strong x-text="app.permission"></strong>
              <span class="admin-badge admin-badge--pending">pending</span>
            </div>
            <p class="admin-card__meta">
              User: <span x-text="app.userId"></span> &mdash;
              Submitted: <span x-text="new Date(app.createdAt).toLocaleDateString()"></span>
            </p>
            <p class="admin-card__body" x-text="app.justification"></p>
            <div class="admin-card__actions">
              <input
                type="text"
                placeholder="Optional review note"
                x-model="notes[app.id]"
                class="admin-input"
              >
              <button
                class="btn-primary"
                type="button"
                :disabled="processingId === app.id"
                @click="approve(app)"
              >Approve</button>
              <button
                class="btn-danger"
                type="button"
                :disabled="processingId === app.id"
                @click="reject(app)"
              >Reject</button>
            </div>
          </div>
        </template>
      </div>
    </div>
  </div>

  <script>
  const API = 'https://loreuniverse-api.fly.dev';

  function applicationsAdmin() {
    return {
      loading: true,
      error: null,
      applications: [],
      notes: {},
      processingId: null,

      async init() {
        const sessionRes = await fetch(API + '/api/auth/get-session', { credentials: 'include' });
        const session = await sessionRes.json();
        if (!session?.user || session.user.role !== 'admin') {
          location.href = '/account/?redirect=' + encodeURIComponent(location.pathname);
          return;
        }

        try {
          const res = await fetch(
            API + '/api/admin/permission-applications?status=pending',
            { credentials: 'include' },
          );
          if (!res.ok) throw new Error('Failed to load applications');
          this.applications = await res.json();
        } catch (err) {
          this.error = err.message;
        } finally {
          this.loading = false;
        }
      },

      async approve(application) {
        this.processingId = application.id;
        try {
          const res = await fetch(
            API + `/api/admin/permission-applications/${application.id}/approve`,
            {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ note: this.notes[application.id] ?? '' }),
            },
          );
          if (!res.ok) throw new Error('Approval failed');
          this.applications = this.applications.filter(a => a.id !== application.id);
        } catch (err) {
          alert(err.message);
        } finally {
          this.processingId = null;
        }
      },

      async reject(application) {
        this.processingId = application.id;
        try {
          const res = await fetch(
            API + `/api/admin/permission-applications/${application.id}/reject`,
            {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ note: this.notes[application.id] ?? '' }),
            },
          );
          if (!res.ok) throw new Error('Rejection failed');
          this.applications = this.applications.filter(a => a.id !== application.id);
        } catch (err) {
          alert(err.message);
        } finally {
          this.processingId = null;
        }
      },
    };
  }
  </script>
  ```

- [ ] **Step 2: Commit**

  ```
  git add frontend/src/admin/applications/index.njk
  git commit -m "feat(admin): permission applications review page"
  ```

---

## Task E-9: Frontend — API Token Management (`/admin/tokens/`)

**Context:** Uses existing token endpoints (`GET/POST/DELETE /api/account/api-tokens`).

**Files:**
- Create: `frontend/src/admin/tokens/index.njk`

- [ ] **Step 1: Create `frontend/src/admin/tokens/index.njk`**

  ```nunjucks
  ---
  title: Admin — Tokens
  ---

  <div x-data="tokensAdmin()" x-init="init()">
    <h1>API Tokens</h1>

    <p x-show="loading">Loading…</p>
    <p x-show="error" x-text="error" class="admin-error"></p>

    <div x-show="!loading && !error">

      <section class="admin-section">
        <h2>Create Token</h2>
        <div class="admin-form-row">
          <input
            type="text"
            placeholder="Token name"
            x-model="newTokenName"
            class="admin-input"
            maxlength="64"
          >
          <button
            class="btn-primary"
            type="button"
            :disabled="creating || !newTokenName.trim()"
            @click="createToken()"
            x-text="creating ? 'Creating…' : 'Create Token'"
          ></button>
        </div>

        <div x-show="newPlaintext" class="admin-plaintext-box">
          <strong>Copy this token now — it will not be shown again:</strong>
          <code x-text="newPlaintext"></code>
          <button
            class="btn-secondary"
            type="button"
            @click="navigator.clipboard.writeText(newPlaintext)"
          >Copy</button>
        </div>
      </section>

      <section class="admin-section">
        <h2>Existing Tokens</h2>
        <p x-show="tokens.length === 0">No tokens yet.</p>

        <table class="admin-table" x-show="tokens.length > 0">
          <thead>
            <tr>
              <th>Name</th>
              <th>Preview</th>
              <th>Created</th>
              <th>Last Used</th>
              <th>Expires</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            <template x-for="token in tokens" :key="token.id">
              <tr>
                <td x-text="token.name"></td>
                <td><code x-text="token.tokenPreview"></code></td>
                <td x-text="new Date(token.createdAt).toLocaleDateString()"></td>
                <td x-text="token.lastUsedAt ? new Date(token.lastUsedAt).toLocaleDateString() : '—'"></td>
                <td x-text="token.expiresAt ? new Date(token.expiresAt).toLocaleDateString() : 'Never'"></td>
                <td>
                  <button
                    class="btn-danger"
                    type="button"
                    @click="revoke(token)"
                  >Revoke</button>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </section>

    </div>
  </div>

  <script>
  const API = 'https://loreuniverse-api.fly.dev';

  function tokensAdmin() {
    return {
      loading: true,
      error: null,
      tokens: [],
      newTokenName: '',
      creating: false,
      newPlaintext: '',

      async init() {
        const sessionRes = await fetch(API + '/api/auth/get-session', { credentials: 'include' });
        const session = await sessionRes.json();
        if (!session?.user || session.user.role !== 'admin') {
          location.href = '/account/?redirect=' + encodeURIComponent(location.pathname);
          return;
        }
        await this.loadTokens();
      },

      async loadTokens() {
        this.loading = true;
        this.error = null;
        try {
          const res = await fetch(API + '/api/account/api-tokens', { credentials: 'include' });
          if (!res.ok) throw new Error('Failed to load tokens');
          this.tokens = await res.json();
        } catch (err) {
          this.error = err.message;
        } finally {
          this.loading = false;
        }
      },

      async createToken() {
        this.creating = true;
        this.newPlaintext = '';
        try {
          const res = await fetch(API + '/api/account/api-tokens', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: this.newTokenName.trim() }),
          });
          if (!res.ok) throw new Error('Token creation failed');
          const data = await res.json();
          this.newPlaintext = data.plaintext;
          this.newTokenName = '';
          await this.loadTokens();
        } catch (err) {
          alert(err.message);
        } finally {
          this.creating = false;
        }
      },

      async revoke(token) {
        if (!confirm(`Revoke token "${token.name}"?`)) return;
        try {
          const res = await fetch(API + `/api/account/api-tokens/${token.id}`, {
            method: 'DELETE',
            credentials: 'include',
          });
          if (!res.ok) throw new Error('Revoke failed');
          this.tokens = this.tokens.filter(t => t.id !== token.id);
        } catch (err) {
          alert(err.message);
        }
      },
    };
  }
  </script>
  ```

- [ ] **Step 2: Commit**

  ```
  git add frontend/src/admin/tokens/index.njk
  git commit -m "feat(admin): API token management page"
  ```

---

## Task E-10: Frontend — Audit Log (`/admin/audit/`)

**Context:** Paginated audit log with newest entries first, client-side filter by action.

**Files:**
- Create: `frontend/src/admin/audit/index.njk`

- [ ] **Step 1: Create `frontend/src/admin/audit/index.njk`**

  ```nunjucks
  ---
  title: Admin — Audit Log
  ---

  <div x-data="auditAdmin()" x-init="init()">
    <h1>Audit Log</h1>

    <p x-show="loading">Loading…</p>
    <p x-show="error" x-text="error" class="admin-error"></p>

    <div x-show="!loading && !error">
      <div class="admin-form-row">
        <input
          type="text"
          placeholder="Filter by action…"
          x-model="filter"
          class="admin-input"
        >
        <span><span x-text="filtered.length"></span> of <span x-text="entries.length"></span> entries</span>
      </div>

      <table class="admin-table">
        <thead>
          <tr>
            <th>Timestamp</th>
            <th>Actor</th>
            <th>Action</th>
            <th>Target</th>
            <th>Metadata</th>
          </tr>
        </thead>
        <tbody>
          <template x-for="entry in filtered" :key="entry.id">
            <tr>
              <td x-text="new Date(entry.createdAt).toLocaleString()"></td>
              <td x-text="entry.actorUserId ?? '—'"></td>
              <td><code x-text="entry.action"></code></td>
              <td x-text="entry.targetType ? entry.targetType + ' ' + (entry.targetId ?? '') : '—'"></td>
              <td>
                <template x-if="entry.metadata">
                  <details>
                    <summary>View</summary>
                    <pre x-text="JSON.stringify(JSON.parse(entry.metadata), null, 2)"></pre>
                  </details>
                </template>
                <template x-if="!entry.metadata">
                  <span>—</span>
                </template>
              </td>
            </tr>
          </template>
        </tbody>
      </table>

      <div class="admin-pagination" x-show="total > limit">
        <button class="btn-secondary" type="button" :disabled="page === 1" @click="goPage(page - 1)">Previous</button>
        <span>Page <span x-text="page"></span> of <span x-text="Math.ceil(total / limit)"></span></span>
        <button class="btn-secondary" type="button" :disabled="page * limit >= total" @click="goPage(page + 1)">Next</button>
      </div>
    </div>
  </div>

  <script>
  const API = 'https://loreuniverse-api.fly.dev';

  function auditAdmin() {
    return {
      loading: true,
      error: null,
      entries: [],
      total: 0,
      page: 1,
      limit: 50,
      filter: '',

      get filtered() {
        const f = this.filter.trim().toLowerCase();
        if (!f) return this.entries;
        return this.entries.filter(e => e.action.toLowerCase().includes(f));
      },

      async init() {
        const sessionRes = await fetch(API + '/api/auth/get-session', { credentials: 'include' });
        const session = await sessionRes.json();
        if (!session?.user || session.user.role !== 'admin') {
          location.href = '/account/?redirect=' + encodeURIComponent(location.pathname);
          return;
        }
        await this.loadPage(1);
      },

      async loadPage(p) {
        this.loading = true;
        this.error = null;
        try {
          const res = await fetch(
            API + `/api/admin/audit?page=${p}&limit=${this.limit}`,
            { credentials: 'include' },
          );
          if (!res.ok) throw new Error('Failed to load audit log');
          const data = await res.json();
          this.entries = data.entries;
          this.total   = data.total;
          this.page    = data.page;
        } catch (err) {
          this.error = err.message;
        } finally {
          this.loading = false;
        }
      },

      goPage(p) {
        this.loadPage(p);
      },
    };
  }
  </script>
  ```

- [ ] **Step 2: Commit**

  ```
  git add frontend/src/admin/audit/index.njk
  git commit -m "feat(admin): audit log page with pagination and client-side filter"
  ```

---

## Task E-11: Full build and manual verification

- [ ] **Step 1: Run all backend tests**

  ```
  cd backend && npx vitest run
  ```

  Expected: all suites green.

- [ ] **Step 2: Build the frontend**

  ```
  cd frontend && npx @11ty/eleventy
  ```

  Expected: builds without error; `_site/admin/index.html`, `_site/admin/wiki/index.html`, `_site/admin/users/index.html`, `_site/admin/applications/index.html`, `_site/admin/tokens/index.html`, `_site/admin/audit/index.html` all present.

- [ ] **Step 3: Manual browser checklist**

  Test each item from the spec's manual browser checklist:

  | Check | Expected |
  |---|---|
  | `/admin/` while logged out | Redirect to `/account/?redirect=/admin/` |
  | `/admin/` as non-admin | Redirect to `/account/` |
  | `/admin/` as admin | All 9 health indicators visible |
  | Site rebuild button | Disables briefly; shows success message |
  | `/admin/wiki/` — all entries | Unpublished entries appear |
  | Wiki publish toggle | Flips without page reload |
  | `/admin/users/` — list | Table loads |
  | Ban flow | Reason input appears; ban applies |
  | `/admin/applications/` | Pending apps shown; approve removes row |
  | `/admin/tokens/` — create | Plaintext shown once |
  | `/admin/tokens/` — revoke | Row removed |
  | `/admin/audit/` | Newest entries first; filter works |

- [ ] **Step 4: Final commit if any cleanup needed**

  ```
  git add -p
  git commit -m "chore(admin): final cleanup after manual verification"
  ```
