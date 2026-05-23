# Foundation Plan D — Static Integration & Claude Autolink

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the foundation by integrating the static site with the backend: add the `books`, `chapters`, `wiki_entries`, `wiki_revisions` tables; expose read endpoints for build-time wiki fetch; build chapter and wiki sync scripts that move file-based content into the DB; wrap the external dependencies (Claude API, GitHub repository_dispatch) with timeout + retry + circuit-breaker; ship the `/api/admin/autolink` endpoint and a local `autolink.js` script; modify Eleventy to fetch wiki content at build time; and expand `/health` to report every feature and external dependency.

**Architecture:** New foundation tables (`books`, `chapters`, `wiki_entries`, `wiki_revisions`) live in the DB. Two new features (`books`, `chapters`, `wiki`) own their tables and expose minimal HTTP routes. Two new shared library modules (`lib/external/claude.ts`, `lib/external/github-dispatch.ts`) wrap external HTTP calls with the same timeout/retry/circuit-breaker pattern. The Eleventy build pulls wiki entries from `GET /api/wiki/all` at deploy time. A standalone `scripts/autolink.js` reads a chapter markdown file, calls `/api/admin/autolink`, writes the result alongside.

**Tech Stack:** Same as Plans A–C, plus `@anthropic-ai/sdk` for Claude, `opossum` for circuit breaking, `gray-matter` for parsing front matter in the chapter sync script.

**References:**
- Spec: `docs/superpowers/specs/2026-05-22-foundational-backend-architecture-design.md` — see Data Model (books/chapters), Wiki Rebuild Flow, Module Isolation (external dependency strategy).
- Plans A, B, C must be merged before starting D.

**Prerequisites:**
1. Plans A–C complete and merged.
2. You have an `lore_admin_*` API token from Plan C's bootstrap.
3. Anthropic API key (you mentioned having one; if not, sign up at https://console.anthropic.com).

---

## File Structure After This Plan

```
backend/src/
├── db/
│   └── schema.ts                # adds books, chapters, wiki_entries, wiki_revisions
├── lib/
│   └── external/                # NEW
│       ├── retry.ts             # shared timeout + retry helper
│       ├── retry.test.ts
│       ├── circuit-breaker.ts   # opossum wrapper
│       ├── claude.ts            # ClaudeClient interface (Fake + Real)
│       ├── claude.test.ts
│       ├── github-dispatch.ts   # GitHubDispatchClient (Fake + Real)
│       └── github-dispatch.test.ts
└── features/
    ├── books/                   # NEW
    │   ├── index.ts
    │   ├── routes.ts            # GET /api/books (list), GET /api/books/:slug
    │   └── routes.test.ts
    ├── chapters/                # NEW
    │   ├── index.ts
    │   ├── routes.ts            # GET /api/chapters/:bookSlug
    │   ├── routes.test.ts
    │   └── sync.ts              # used by build to upsert from markdown
    ├── wiki/                    # NEW
    │   ├── index.ts
    │   ├── routes.ts            # GET /api/wiki/all, GET /api/wiki/:category/:slug
    │   ├── routes.test.ts
    │   └── sync.ts              # one-time migration helper
    └── admin/                   # NEW
        ├── index.ts
        ├── autolink-routes.ts   # POST /api/admin/autolink
        ├── autolink-routes.test.ts
        ├── site-rebuild-routes.ts  # POST /api/admin/site-rebuild
        └── site-rebuild-routes.test.ts

scripts/
├── autolink.js                  # NEW — local CLI that hits /api/admin/autolink
└── ...

frontend/
└── .eleventy.js                 # modified to fetch wiki content at build time
```

---

## Task 1: Branch + schema additions

**Files:**
- Modify: `backend/src/db/schema.ts`

- [ ] **Step 1: Create branch.**

```bash
git checkout main
git pull
git checkout -b foundation-d-static-integration-claude
```

- [ ] **Step 2: Append new tables to `backend/src/db/schema.ts`.**

```ts
import { jsonb } from 'drizzle-orm/pg-core';

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
    category: text('category').notNull(),  // 'characters' | 'lore-traits' | 'mechanics' | 'locations' | 'factions' | 'lore'
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
```

Update the `schema` export at the bottom:

```ts
export const schema = {
  users, sessions, accounts, verifications,
  userPermissions, permissionApplications, apiTokens, auditLog,
  books, chapters, wikiEntries, wikiRevisions,
};
```

- [ ] **Step 3: Typecheck.**

```bash
cd backend
npm run typecheck
cd ..
```

- [ ] **Step 4: Generate and apply migration locally.**

```bash
cd backend
npx drizzle-kit generate --name add_books_chapters_wiki
npx drizzle-kit migrate
DATABASE_URL="postgres://lore:lore@localhost:5432/lore_test" npx drizzle-kit migrate
cd ..
```

- [ ] **Step 5: Commit.**

```bash
git add backend/src/db/schema.ts backend/drizzle/
git commit -m "feat(backend): add books, chapters, wiki_entries, wiki_revisions tables"
```

---

## Task 2: Shared external-call helpers (retry + circuit breaker)

**Files:**
- Create: `backend/src/lib/external/retry.ts`
- Create: `backend/src/lib/external/retry.test.ts`
- Create: `backend/src/lib/external/circuit-breaker.ts`

- [ ] **Step 1: Install opossum (circuit breaker library).**

```bash
cd backend
npm install opossum
npm install -D @types/opossum
cd ..
```

- [ ] **Step 2: Write failing retry test.**

```ts
import { describe, it, expect } from 'vitest';
import { withRetry } from './retry.js';

describe('withRetry', () => {
  it('returns the value when the operation succeeds first try', async () => {
    let calls = 0;
    const result = await withRetry(async () => { calls++; return 42; }, { attempts: 3, baseDelayMs: 1 });
    expect(result).toBe(42);
    expect(calls).toBe(1);
  });

  it('retries on failure and eventually succeeds', async () => {
    let calls = 0;
    const result = await withRetry(async () => {
      calls++;
      if (calls < 3) throw new Error('fail');
      return 'ok';
    }, { attempts: 5, baseDelayMs: 1 });
    expect(result).toBe('ok');
    expect(calls).toBe(3);
  });

  it('throws after exhausting attempts', async () => {
    let calls = 0;
    await expect(
      withRetry(async () => { calls++; throw new Error('always fails'); }, { attempts: 2, baseDelayMs: 1 })
    ).rejects.toThrow(/always fails/);
    expect(calls).toBe(2);
  });
});
```

- [ ] **Step 3: Implement `backend/src/lib/external/retry.ts`.**

```ts
export type RetryOptions = {
  attempts: number;
  baseDelayMs: number;
  shouldRetry?: (err: unknown) => boolean;
};

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions
): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < options.attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (options.shouldRetry && !options.shouldRetry(err)) throw err;
      if (i < options.attempts - 1) {
        const delay = options.baseDelayMs * Math.pow(2, i);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  throw lastError;
}

export async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}
```

- [ ] **Step 4: Implement `backend/src/lib/external/circuit-breaker.ts`.**

```ts
import CircuitBreaker from 'opossum';

export type BreakerOptions = {
  timeoutMs: number;
  errorThresholdPercentage: number;
  resetTimeoutMs: number;
};

export function makeBreaker<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  options: BreakerOptions,
): (...args: TArgs) => Promise<TResult> {
  const breaker = new CircuitBreaker(fn, {
    timeout: options.timeoutMs,
    errorThresholdPercentage: options.errorThresholdPercentage,
    resetTimeout: options.resetTimeoutMs,
  });
  return (...args: TArgs) => breaker.fire(...args) as Promise<TResult>;
}
```

- [ ] **Step 5: Run.**

```bash
cd backend
NODE_ENV=test npm test -- --run lib/external/retry
cd ..
```

- [ ] **Step 6: Commit.**

```bash
git add backend/src/lib/external/ backend/package.json backend/package-lock.json
git commit -m "feat(backend): add retry + timeout + circuit-breaker helpers"
```

---

## Task 3: Claude client wrapper

**Files:**
- Create: `backend/src/lib/external/claude.ts`
- Create: `backend/src/lib/external/claude.test.ts`

- [ ] **Step 1: Install Anthropic SDK.**

```bash
cd backend
npm install @anthropic-ai/sdk
cd ..
```

- [ ] **Step 2: Write failing test.**

```ts
import { describe, it, expect } from 'vitest';
import { FakeClaudeClient, type WikiIndex } from './claude.js';

describe('FakeClaudeClient', () => {
  it('records calls and returns the canned response', async () => {
    const fake = new FakeClaudeClient({ annotatedText: '{characters|aldren|Aldren} walked.' });
    const wiki: WikiIndex = [{ category: 'characters', slug: 'aldren', name: 'Aldren', aliases: [] }];

    const result = await fake.annotateChapter({
      chapterText: 'Aldren walked.',
      wikiIndex: wiki,
      policy: 'first-mention-per-section',
    });

    expect(result.annotatedText).toBe('{characters|aldren|Aldren} walked.');
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0].chapterText).toBe('Aldren walked.');
  });
});
```

- [ ] **Step 3: Implement `backend/src/lib/external/claude.ts`.**

```ts
import Anthropic from '@anthropic-ai/sdk';
import { makeBreaker } from './circuit-breaker.js';
import { withRetry } from './retry.js';

export type WikiIndexEntry = {
  category: string;
  slug: string;
  name: string;
  aliases: string[];
};
export type WikiIndex = WikiIndexEntry[];

export type AnnotateInput = {
  chapterText: string;
  wikiIndex: WikiIndex;
  policy: 'first-mention-per-chapter' | 'first-mention-per-section' | 'every-mention';
};

export type AnnotateResult = {
  annotatedText: string;
  tokensIn: number;
  tokensOut: number;
  model: string;
};

export interface ClaudeClient {
  annotateChapter(input: AnnotateInput): Promise<AnnotateResult>;
}

export class FakeClaudeClient implements ClaudeClient {
  public calls: AnnotateInput[] = [];
  constructor(private response: { annotatedText: string; tokensIn?: number; tokensOut?: number; model?: string }) {}

  async annotateChapter(input: AnnotateInput): Promise<AnnotateResult> {
    this.calls.push(input);
    return {
      annotatedText: this.response.annotatedText,
      tokensIn: this.response.tokensIn ?? 0,
      tokensOut: this.response.tokensOut ?? 0,
      model: this.response.model ?? 'fake-model',
    };
  }
}

export class AnthropicClaudeClient implements ClaudeClient {
  private readonly anthropic: Anthropic;
  private readonly fireBreaker: (input: AnnotateInput) => Promise<AnnotateResult>;
  private readonly model: string;

  constructor(opts: { apiKey: string; model?: string }) {
    this.anthropic = new Anthropic({ apiKey: opts.apiKey });
    this.model = opts.model ?? 'claude-3-7-sonnet-latest';
    const inner = (input: AnnotateInput) => this._call(input);
    this.fireBreaker = makeBreaker(inner, {
      timeoutMs: 60_000,
      errorThresholdPercentage: 50,
      resetTimeoutMs: 30_000,
    });
  }

  async annotateChapter(input: AnnotateInput): Promise<AnnotateResult> {
    return withRetry(() => this.fireBreaker(input), {
      attempts: 2,
      baseDelayMs: 500,
      shouldRetry: (err) => {
        const msg = err instanceof Error ? err.message : String(err);
        return /5\d\d|timeout|network/i.test(msg);
      },
    });
  }

  private async _call(input: AnnotateInput): Promise<AnnotateResult> {
    const system = buildSystemPrompt();
    const user = buildUserPrompt(input);
    const response = await this.anthropic.messages.create({
      model: this.model,
      max_tokens: 8192,
      system,
      messages: [{ role: 'user', content: user }],
    });

    const textBlock = response.content.find((c) => c.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error('Claude returned no text content');
    }
    return {
      annotatedText: extractAnnotatedChapter(textBlock.text),
      tokensIn: response.usage.input_tokens,
      tokensOut: response.usage.output_tokens,
      model: response.model,
    };
  }
}

function buildSystemPrompt(): string {
  return `You are an editor for the Lore Universe website. Your job is to insert {category|slug|display} wiki link tokens into chapter prose.

Rules:
- Only link names that appear in the wiki index provided.
- Apply the policy specified in the user prompt for how many links to insert.
- Preserve the chapter text exactly except for inserting tokens — no rewriting, no formatting changes.
- Output ONLY the annotated chapter wrapped in <annotated> tags. Nothing else.`;
}

function buildUserPrompt(input: AnnotateInput): string {
  return `Wiki index (JSON):
${JSON.stringify(input.wikiIndex, null, 2)}

Linking policy: ${input.policy}

Chapter:
<chapter>
${input.chapterText}
</chapter>`;
}

function extractAnnotatedChapter(raw: string): string {
  const match = raw.match(/<annotated>([\s\S]*?)<\/annotated>/);
  if (match) return match[1].trim();
  return raw.trim();
}

export function createClaudeClient(): ClaudeClient {
  if (process.env.NODE_ENV === 'test') {
    throw new Error('Tests must inject a FakeClaudeClient directly');
  }
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new Error('ANTHROPIC_API_KEY is required to call Claude');
  }
  return new AnthropicClaudeClient({ apiKey: key });
}
```

- [ ] **Step 4: Run tests.**

```bash
cd backend
NODE_ENV=test npm test -- --run lib/external/claude
cd ..
```

- [ ] **Step 5: Commit.**

```bash
git add backend/src/lib/external/claude.ts backend/src/lib/external/claude.test.ts backend/package.json backend/package-lock.json
git commit -m "feat(backend): Claude client wrapper with circuit-breaker + retry"
```

---

## Task 4: GitHub repository_dispatch client

**Files:**
- Create: `backend/src/lib/external/github-dispatch.ts`
- Create: `backend/src/lib/external/github-dispatch.test.ts`

- [ ] **Step 1: Write failing test.**

```ts
import { describe, it, expect } from 'vitest';
import { FakeGitHubDispatchClient } from './github-dispatch.js';

describe('FakeGitHubDispatchClient', () => {
  it('records events without making network calls', async () => {
    const client = new FakeGitHubDispatchClient();
    await client.triggerEvent({ eventType: 'wiki-content-changed', clientPayload: { slug: 'aldren' } });
    expect(client.events).toHaveLength(1);
    expect(client.events[0].eventType).toBe('wiki-content-changed');
    expect(client.events[0].clientPayload).toEqual({ slug: 'aldren' });
  });
});
```

- [ ] **Step 2: Implement `backend/src/lib/external/github-dispatch.ts`.**

```ts
import { makeBreaker } from './circuit-breaker.js';
import { withRetry, withTimeout } from './retry.js';

export type DispatchEvent = {
  eventType: string;
  clientPayload?: Record<string, unknown>;
};

export interface GitHubDispatchClient {
  triggerEvent(event: DispatchEvent): Promise<void>;
}

export class FakeGitHubDispatchClient implements GitHubDispatchClient {
  public events: DispatchEvent[] = [];
  async triggerEvent(event: DispatchEvent): Promise<void> {
    this.events.push(event);
  }
}

export class RealGitHubDispatchClient implements GitHubDispatchClient {
  private readonly fireBreaker: (event: DispatchEvent) => Promise<void>;

  constructor(private readonly opts: { token: string; owner: string; repo: string }) {
    const inner = (event: DispatchEvent) => this._send(event);
    this.fireBreaker = makeBreaker(inner, {
      timeoutMs: 5_000,
      errorThresholdPercentage: 50,
      resetTimeoutMs: 60_000,
    });
  }

  async triggerEvent(event: DispatchEvent): Promise<void> {
    return withRetry(() => this.fireBreaker(event), {
      attempts: 2,
      baseDelayMs: 500,
    });
  }

  private async _send(event: DispatchEvent): Promise<void> {
    const url = `https://api.github.com/repos/${this.opts.owner}/${this.opts.repo}/dispatches`;
    const body = JSON.stringify({
      event_type: event.eventType,
      client_payload: event.clientPayload ?? {},
    });
    const response = await withTimeout(
      fetch(url, {
        method: 'POST',
        headers: {
          accept: 'application/vnd.github+json',
          authorization: `Bearer ${this.opts.token}`,
          'x-github-api-version': '2022-11-28',
          'content-type': 'application/json',
        },
        body,
      }),
      5_000,
    );
    if (!response.ok) {
      throw new Error(`GitHub dispatch failed: ${response.status} ${await response.text()}`);
    }
  }
}

export function createGitHubDispatchClient(): GitHubDispatchClient {
  if (process.env.NODE_ENV === 'test') {
    return new FakeGitHubDispatchClient();
  }
  const token = process.env.GITHUB_DISPATCH_TOKEN;
  const repo = process.env.GITHUB_DISPATCH_REPO;
  if (!token || !repo) {
    throw new Error('GITHUB_DISPATCH_TOKEN and GITHUB_DISPATCH_REPO must be set');
  }
  const [owner, repoName] = repo.split('/');
  if (!owner || !repoName) {
    throw new Error('GITHUB_DISPATCH_REPO must be in "owner/repo" format');
  }
  return new RealGitHubDispatchClient({ token, owner, repo: repoName });
}
```

- [ ] **Step 3: Run test.**

```bash
cd backend
NODE_ENV=test npm test -- --run lib/external/github-dispatch
cd ..
```

- [ ] **Step 4: Commit.**

```bash
git add backend/src/lib/external/github-dispatch.ts backend/src/lib/external/github-dispatch.test.ts
git commit -m "feat(backend): GitHub dispatch client with retry + circuit-breaker"
```

---

## Task 5: Wiki feature (schema + minimal read/write endpoints + sync helper)

**Files:**
- Create: `backend/src/features/wiki/routes.ts`
- Create: `backend/src/features/wiki/routes.test.ts`
- Create: `backend/src/features/wiki/index.ts`
- Create: `backend/src/features/wiki/sync.ts`

- [ ] **Step 1: Write the failing route tests.**

```ts
import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import { withRollbackDb } from '../../lib/test-db.js';
import { schema } from '../../db/schema.js';
import { createPermissionsService } from '../permissions/service.js';
import { createTokenService } from '../tokens/service.js';
import { createAuditService } from '../audit/service.js';
import { createRequireAuth, createRequireRole } from '../permissions/middleware.js';
import { registerWikiRoutes } from './routes.js';

async function setupApp(db: any, dispatch: any = { triggerEvent: async () => {} }) {
  const tokens = createTokenService(db);
  const perms = createPermissionsService(db);
  const audit = createAuditService(db);
  const app = Fastify();
  app.decorate('db', db);
  app.decorate('tokens', tokens);
  app.decorate('perms', perms);
  app.decorate('audit', audit);
  app.decorate('dispatch', dispatch);
  app.decorate('auth', { api: { getSession: async () => null } } as any);
  app.decorate('requireAuth', createRequireAuth({ app, tokens }));
  app.decorate('requireRole', (m: any) => createRequireRole(perms, m));
  app.decorate('requirePermission', () => (async () => {}) as any);
  await registerWikiRoutes(app);
  await app.ready();
  return { app, tokens };
}

describe('wiki routes', () => {
  it('GET /api/wiki/all returns published wiki entries (empty initially)', async () => {
    await withRollbackDb(async (db) => {
      const { app } = await setupApp(db);
      const response = await app.inject({ method: 'GET', url: '/api/wiki/all' });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual([]);
    });
  });

  it('GET /api/wiki/all returns inserted entries', async () => {
    await withRollbackDb(async (db) => {
      await db.insert(schema.wikiEntries).values({
        category: 'characters', slug: 'aldren', name: 'Aldren',
        frontMatter: { status: 'alive', species: 'human' }, body: 'A character.',
      });
      const { app } = await setupApp(db);
      const response = await app.inject({ method: 'GET', url: '/api/wiki/all' });
      expect(response.statusCode).toBe(200);
      const list = response.json();
      expect(list).toHaveLength(1);
      expect(list[0].slug).toBe('aldren');
    });
  });

  it('GET /api/wiki/:category/:slug returns the entry', async () => {
    await withRollbackDb(async (db) => {
      await db.insert(schema.wikiEntries).values({
        category: 'characters', slug: 'aldren', name: 'Aldren',
        frontMatter: { status: 'alive' }, body: 'Body.',
      });
      const { app } = await setupApp(db);
      const response = await app.inject({ method: 'GET', url: '/api/wiki/characters/aldren' });
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.name).toBe('Aldren');
      expect(body.body).toBe('Body.');
    });
  });

  it('admin upsert creates a new entry + writes revision + triggers dispatch', async () => {
    await withRollbackDb(async (db) => {
      const adminId = 'admin-wiki';
      await db.insert(schema.users).values({ id: adminId, email: `${adminId}@x.com`, name: 'A', role: 'admin' });
      const dispatches: any[] = [];
      const dispatch = { triggerEvent: async (e: any) => { dispatches.push(e); } };
      const { app, tokens } = await setupApp(db, dispatch);
      const { plaintext } = await tokens.create({ userId: adminId, userRole: 'admin', name: 'wiki' });

      const response = await app.inject({
        method: 'PUT',
        url: '/api/admin/wiki/characters/aldren',
        headers: { authorization: `Bearer ${plaintext}`, 'content-type': 'application/json' },
        payload: { name: 'Aldren', frontMatter: { status: 'alive' }, body: 'Body.', editSummary: 'initial' },
      });
      expect(response.statusCode).toBe(200);

      const [entry] = await db.select().from(schema.wikiEntries);
      expect(entry.slug).toBe('aldren');

      const revisions = await db.select().from(schema.wikiRevisions);
      expect(revisions).toHaveLength(1);

      expect(dispatches).toHaveLength(1);
      expect(dispatches[0].eventType).toBe('wiki-content-changed');
    });
  });
});
```

- [ ] **Step 2: Implement `backend/src/features/wiki/routes.ts`.**

```ts
import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { schema } from '../../db/schema.js';

export async function registerWikiRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/wiki/all', async () => {
    return app.db.select({
      id: schema.wikiEntries.id,
      category: schema.wikiEntries.category,
      slug: schema.wikiEntries.slug,
      name: schema.wikiEntries.name,
      frontMatter: schema.wikiEntries.frontMatter,
      body: schema.wikiEntries.body,
      updatedAt: schema.wikiEntries.updatedAt,
    }).from(schema.wikiEntries).where(eq(schema.wikiEntries.isPublished, true));
  });

  app.get('/api/wiki/:category/:slug', async (request, reply) => {
    const { category, slug } = request.params as { category: string; slug: string };
    const [entry] = await app.db.select().from(schema.wikiEntries)
      .where(and(eq(schema.wikiEntries.category, category), eq(schema.wikiEntries.slug, slug)));
    if (!entry) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Entry not found.' } });
    return entry;
  });

  app.put(
    '/api/admin/wiki/:category/:slug',
    {
      // wiki_edit permission gates this. Per the spec's authz model, regular users
      // who've been granted the wiki_edit permission can edit; moderators/admins
      // implicitly pass any permission gate.
      preHandler: [app.requireAuth, app.requirePermission('wiki_edit')],
      schema: {
        body: {
          type: 'object',
          required: ['name', 'frontMatter', 'body'],
          properties: {
            name: { type: 'string', minLength: 1 },
            frontMatter: { type: 'object' },
            body: { type: 'string' },
            editSummary: { type: 'string', maxLength: 500 },
            isPublished: { type: 'boolean' },
          },
        },
      },
    },
    async (request, reply) => {
      const { category, slug } = request.params as { category: string; slug: string };
      const body = request.body as { name: string; frontMatter: object; body: string; editSummary?: string; isPublished?: boolean };

      const [existing] = await app.db.select().from(schema.wikiEntries)
        .where(and(eq(schema.wikiEntries.category, category), eq(schema.wikiEntries.slug, slug)));

      let entry;
      if (existing) {
        [entry] = await app.db.update(schema.wikiEntries)
          .set({
            name: body.name,
            frontMatter: body.frontMatter as any,
            body: body.body,
            isPublished: body.isPublished ?? existing.isPublished,
            updatedAt: new Date(),
          })
          .where(eq(schema.wikiEntries.id, existing.id))
          .returning();
      } else {
        [entry] = await app.db.insert(schema.wikiEntries)
          .values({
            category, slug, name: body.name,
            frontMatter: body.frontMatter as any,
            body: body.body,
            isPublished: body.isPublished ?? true,
          })
          .returning();
      }

      await app.db.insert(schema.wikiRevisions).values({
        wikiEntryId: entry.id,
        editorUserId: request.user!.id,
        frontMatter: body.frontMatter as any,
        body: body.body,
        editSummary: body.editSummary ?? null,
      });

      await app.dispatch.triggerEvent({
        eventType: 'wiki-content-changed',
        clientPayload: { category, slug, editorUserId: request.user!.id },
      }).catch((err) => request.log.error({ err }, 'site rebuild dispatch failed'));

      await app.audit.log({
        actorUserId: request.user!.id,
        action: 'wiki.edit',
        targetType: 'wiki_entry',
        targetId: entry.id,
        metadata: { category, slug, editSummary: body.editSummary },
      }).catch((err) => request.log.error({ err }, 'audit log failed'));

      return reply.send(entry);
    },
  );
}
```

- [ ] **Step 3: Add the `dispatch` decoration.**

In `backend/src/features/wiki/index.ts`:
```ts
import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { registerWikiRoutes } from './routes.js';
import { createGitHubDispatchClient, type GitHubDispatchClient } from '../../lib/external/github-dispatch.js';

declare module 'fastify' {
  interface FastifyInstance {
    dispatch: GitHubDispatchClient;
  }
}

async function wikiPlugin(app: FastifyInstance) {
  if (!app.hasDecorator('dispatch')) {
    app.decorate('dispatch', createGitHubDispatchClient());
  }
  await registerWikiRoutes(app);
}

export default fp(wikiPlugin, { name: 'wiki', dependencies: ['permissions', 'audit'] });
```

- [ ] **Step 4: Wire into `backend/src/server.ts`.**

```ts
import wikiPlugin from './features/wiki/index.js';
// ...
await app.register(wikiPlugin);
```

- [ ] **Step 5: Run tests.**

```bash
cd backend
NODE_ENV=test npm test -- --run features/wiki
cd ..
```

- [ ] **Step 6: Commit.**

```bash
git add backend/src/features/wiki/ backend/src/server.ts
git commit -m "feat(backend): wiki feature — read endpoints + admin upsert + dispatch trigger"
```

---

## Task 6: Wiki sync script (one-time migration from markdown)

**Files:**
- Create: `backend/src/features/wiki/sync.ts`
- Create: `scripts/sync-wiki.js` (standalone CLI)

- [ ] **Step 1: Install gray-matter for markdown front-matter parsing.**

```bash
cd backend
npm install gray-matter
cd ..
```

- [ ] **Step 2: Implement `backend/src/features/wiki/sync.ts`.**

```ts
import { readdir, readFile } from 'node:fs/promises';
import { join, basename } from 'node:path';
import matter from 'gray-matter';
import { and, eq } from 'drizzle-orm';
import type { drizzle } from 'drizzle-orm/postgres-js';
import { schema } from '../../db/schema.js';

type Db = ReturnType<typeof drizzle<typeof schema>>;

// Plural category names match the folder structure under src/wiki/
// AND the existing wiki link transform's regex AND the {category|slug|display}
// tokens used in chapter prose. Stored values in wiki_entries.category are
// also plural ("characters", "lore-traits", etc.).
const CATEGORIES = ['characters', 'lore-traits', 'mechanics', 'locations', 'factions', 'lore'];

export type SyncResult = {
  category: string;
  slug: string;
  action: 'created' | 'updated' | 'skipped';
};

export async function syncWikiFromMarkdown(db: Db, srcDir: string): Promise<SyncResult[]> {
  const results: SyncResult[] = [];

  for (const category of CATEGORIES) {
    // Category name and folder name are identical (plural).
    const dir = join(srcDir, category);
    let files: string[];
    try {
      files = await readdir(dir);
    } catch {
      continue;
    }
    for (const file of files) {
      if (!file.endsWith('.md') || file === 'index.md') continue;
      const filePath = join(dir, file);
      const slug = basename(file, '.md');
      const raw = await readFile(filePath, 'utf-8');
      const { data: frontMatter, content: body } = matter(raw);
      const name = (frontMatter.name as string) ?? slug;

      const [existing] = await db.select().from(schema.wikiEntries)
        .where(and(eq(schema.wikiEntries.category, category), eq(schema.wikiEntries.slug, slug)));

      if (existing) {
        await db.update(schema.wikiEntries)
          .set({
            name,
            frontMatter: frontMatter as any,
            body: body.trim(),
            updatedAt: new Date(),
          })
          .where(eq(schema.wikiEntries.id, existing.id));
        results.push({ category, slug, action: 'updated' });
      } else {
        await db.insert(schema.wikiEntries).values({
          category, slug, name,
          frontMatter: frontMatter as any,
          body: body.trim(),
        });
        results.push({ category, slug, action: 'created' });
      }
    }
  }

  return results;
}
```

- [ ] **Step 3: Create `scripts/sync-wiki.js` as a CLI wrapper.**

```js
#!/usr/bin/env node
import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDb, closeDb } from '../backend/dist/db/client.js';
import { syncWikiFromMarkdown } from '../backend/dist/features/wiki/sync.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC_DIR = path.resolve(__dirname, '..', 'frontend', 'src', 'wiki');

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }
  const db = createDb(url);
  try {
    const results = await syncWikiFromMarkdown(db, SRC_DIR);
    console.log(`Synced ${results.length} wiki entries:`);
    for (const r of results) {
      console.log(`  ${r.action.padEnd(8)} ${r.category}/${r.slug}`);
    }
  } finally {
    await closeDb();
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
```

- [ ] **Step 4: Build backend so the dist/ files exist for the script.**

```bash
cd backend
npm run build
cd ..
```

- [ ] **Step 5: Run the sync against your local DB.**

```bash
node scripts/sync-wiki.js
```
Expected: lists every entry created (or "no entries to sync" if `frontend/src/wiki/` is empty).

Verify in psql:
```bash
docker exec -it loreuniverse-postgres psql -U lore -d lore_dev -c "SELECT category, slug, name FROM wiki_entries ORDER BY category, slug;"
```

- [ ] **Step 6: Commit.**

```bash
git add backend/src/features/wiki/sync.ts scripts/sync-wiki.js backend/package.json backend/package-lock.json
git commit -m "feat: wiki sync script — migrate existing markdown into wiki_entries"
```

---

## Task 7: Books and chapters features (read-only endpoints + chapter sync)

**Files:**
- Create: `backend/src/features/books/routes.ts`
- Create: `backend/src/features/books/index.ts`
- Create: `backend/src/features/chapters/routes.ts`
- Create: `backend/src/features/chapters/sync.ts`
- Create: `backend/src/features/chapters/index.ts`
- Create: `scripts/sync-chapters.js`

These features mirror the wiki module's pattern but are simpler at this stage — no editing UI, only read endpoints + a sync script for chapter front matter.

- [ ] **Step 1: Implement `backend/src/features/books/routes.ts`.**

```ts
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { schema } from '../../db/schema.js';

export async function registerBookRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/books', async () => {
    return app.db.select().from(schema.books).where(eq(schema.books.isPublished, true));
  });

  app.get('/api/books/:slug', async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const [book] = await app.db.select().from(schema.books).where(eq(schema.books.slug, slug));
    if (!book) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Book not found.' } });
    return book;
  });

  // Minimal admin upsert — full editing UX is a feature spec
  app.put(
    '/api/admin/books/:slug',
    { preHandler: [app.requireAuth, app.requireRole('admin')] },
    async (request, reply) => {
      const { slug } = request.params as { slug: string };
      const body = request.body as {
        title: string; description?: string; coverImageUrl?: string;
        externalLinks?: Record<string, string>; isPublished?: boolean; publishedAt?: string;
      };

      const [existing] = await app.db.select().from(schema.books).where(eq(schema.books.slug, slug));
      const values = {
        slug,
        title: body.title,
        description: body.description ?? '',
        coverImageUrl: body.coverImageUrl ?? null,
        externalLinks: (body.externalLinks ?? {}) as any,
        isPublished: body.isPublished ?? true,
        publishedAt: body.publishedAt ? new Date(body.publishedAt) : null,
        updatedAt: new Date(),
      };

      const result = existing
        ? await app.db.update(schema.books).set(values).where(eq(schema.books.id, existing.id)).returning()
        : await app.db.insert(schema.books).values(values).returning();

      await app.audit.log({
        actorUserId: request.user!.id,
        action: 'book.upsert',
        targetType: 'book',
        targetId: result[0].id,
      }).catch((err) => request.log.error({ err }, 'audit log failed'));

      return reply.send(result[0]);
    },
  );
}
```

- [ ] **Step 2: Implement `backend/src/features/books/index.ts` (Fastify plugin).**

```ts
import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { registerBookRoutes } from './routes.js';

async function booksPlugin(app: FastifyInstance) {
  await registerBookRoutes(app);
}

export default fp(booksPlugin, { name: 'books', dependencies: ['permissions', 'audit'] });
```

- [ ] **Step 3: Implement `backend/src/features/chapters/sync.ts`.**

```ts
import { readdir, readFile } from 'node:fs/promises';
import { join, basename } from 'node:path';
import matter from 'gray-matter';
import { and, eq } from 'drizzle-orm';
import type { drizzle } from 'drizzle-orm/postgres-js';
import { schema } from '../../db/schema.js';

type Db = ReturnType<typeof drizzle<typeof schema>>;

export async function syncChaptersFromMarkdown(db: Db, booksDir: string): Promise<number> {
  let count = 0;
  // booksDir is .../frontend/src/lorekeeper/books
  const bookSlugs = await readdir(booksDir);

  for (const bookSlug of bookSlugs) {
    const chaptersDir = join(booksDir, bookSlug, 'chapters');
    let files: string[];
    try {
      files = await readdir(chaptersDir);
    } catch {
      continue;
    }

    let [book] = await db.select().from(schema.books).where(eq(schema.books.slug, bookSlug));
    if (!book) {
      [book] = await db.insert(schema.books).values({
        slug: bookSlug,
        title: bookSlug.replace(/[-_]/g, ' '),
      }).returning();
    }

    for (const file of files) {
      if (!file.endsWith('.md') || file === 'index.md') continue;
      const filePath = join(chaptersDir, file);
      const slug = basename(file, '.md');
      const raw = await readFile(filePath, 'utf-8');
      const { data: frontMatter } = matter(raw);
      const title = (frontMatter.title as string) ?? slug;
      const chapterNumber = (frontMatter.chapter_number as number) ?? 0;
      const publishedAt = frontMatter.publication_date ? new Date(frontMatter.publication_date as string) : null;

      const [existing] = await db.select().from(schema.chapters)
        .where(and(eq(schema.chapters.bookId, book.id), eq(schema.chapters.slug, slug)));

      if (existing) {
        await db.update(schema.chapters)
          .set({ title, chapterNumber, publishedAt, updatedAt: new Date() })
          .where(eq(schema.chapters.id, existing.id));
      } else {
        await db.insert(schema.chapters).values({
          bookId: book.id, chapterNumber, slug, title, publishedAt,
        });
      }
      count++;
    }
  }
  return count;
}
```

- [ ] **Step 4: Implement `backend/src/features/chapters/routes.ts`.**

```ts
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { schema } from '../../db/schema.js';

export async function registerChapterRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/chapters/:bookSlug', async (request, reply) => {
    const { bookSlug } = request.params as { bookSlug: string };
    const [book] = await app.db.select().from(schema.books).where(eq(schema.books.slug, bookSlug));
    if (!book) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Book not found.' } });
    return app.db.select().from(schema.chapters).where(eq(schema.chapters.bookId, book.id)).orderBy(schema.chapters.chapterNumber);
  });
}
```

- [ ] **Step 5: Implement `backend/src/features/chapters/index.ts`.**

```ts
import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { registerChapterRoutes } from './routes.js';

async function chaptersPlugin(app: FastifyInstance) {
  await registerChapterRoutes(app);
}

export default fp(chaptersPlugin, { name: 'chapters', dependencies: ['permissions'] });
```

- [ ] **Step 6: Create `scripts/sync-chapters.js`.**

```js
#!/usr/bin/env node
import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDb, closeDb } from '../backend/dist/db/client.js';
import { syncChaptersFromMarkdown } from '../backend/dist/features/chapters/sync.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BOOKS_DIR = path.resolve(__dirname, '..', 'frontend', 'src', 'lorekeeper', 'books');

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error('DATABASE_URL is required'); process.exit(1); }
  const db = createDb(url);
  try {
    const n = await syncChaptersFromMarkdown(db, BOOKS_DIR);
    console.log(`Synced ${n} chapters.`);
  } finally {
    await closeDb();
  }
}
main().catch((err) => { console.error(err); process.exit(1); });
```

- [ ] **Step 7: Wire books + chapters into `server.ts`.**

```ts
import booksPlugin from './features/books/index.js';
import chaptersPlugin from './features/chapters/index.js';
// ...
await app.register(booksPlugin);
await app.register(chaptersPlugin);
```

- [ ] **Step 8: Rebuild backend, run sync, verify.**

```bash
cd backend
npm run build
cd ..
node scripts/sync-chapters.js
docker exec -it loreuniverse-postgres psql -U lore -d lore_dev -c "SELECT slug, chapter_number, title FROM chapters ORDER BY chapter_number;"
```

- [ ] **Step 9: Commit.**

```bash
git add backend/src/features/books/ backend/src/features/chapters/ scripts/sync-chapters.js backend/src/server.ts
git commit -m "feat(backend): books + chapters features + chapter sync script"
```

---

## Task 8: Admin autolink endpoint

**Files:**
- Create: `backend/src/features/admin/autolink-routes.ts`
- Create: `backend/src/features/admin/autolink-routes.test.ts`
- Create: `backend/src/features/admin/index.ts`

- [ ] **Step 1: Write failing test.**

```ts
import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import { withRollbackDb } from '../../lib/test-db.js';
import { schema } from '../../db/schema.js';
import { createPermissionsService } from '../permissions/service.js';
import { createTokenService } from '../tokens/service.js';
import { createAuditService } from '../audit/service.js';
import { createRequireAuth, createRequireRole } from '../permissions/middleware.js';
import { registerAutolinkRoutes } from './autolink-routes.js';
import { FakeClaudeClient } from '../../lib/external/claude.js';

async function setupApp(db: any, claude: any) {
  const tokens = createTokenService(db);
  const perms = createPermissionsService(db);
  const audit = createAuditService(db);
  const app = Fastify();
  app.decorate('db', db);
  app.decorate('tokens', tokens);
  app.decorate('perms', perms);
  app.decorate('audit', audit);
  app.decorate('claude', claude);
  app.decorate('auth', { api: { getSession: async () => null } } as any);
  app.decorate('requireAuth', createRequireAuth({ app, tokens }));
  app.decorate('requireRole', (m: any) => createRequireRole(perms, m));
  await registerAutolinkRoutes(app);
  await app.ready();
  return { app, tokens };
}

describe('autolink route', () => {
  it('admin with token gets annotated text + Claude is called with wiki index', async () => {
    await withRollbackDb(async (db) => {
      const adminId = 'admin-autolink';
      await db.insert(schema.users).values({ id: adminId, email: `${adminId}@x.com`, name: 'A', role: 'admin' });
      await db.insert(schema.wikiEntries).values({
        category: 'characters', slug: 'aldren', name: 'Aldren',
        frontMatter: {}, body: '',
      });

      const claude = new FakeClaudeClient({ annotatedText: '{characters|aldren|Aldren} walked.' });
      const { app, tokens } = await setupApp(db, claude);
      const { plaintext } = await tokens.create({ userId: adminId, userRole: 'admin', name: 'autolink' });

      const response = await app.inject({
        method: 'POST',
        url: '/api/admin/autolink',
        headers: { authorization: `Bearer ${plaintext}`, 'content-type': 'application/json' },
        payload: { chapterText: 'Aldren walked.', policy: 'first-mention-per-chapter' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.annotatedText).toBe('{characters|aldren|Aldren} walked.');
      expect(claude.calls).toHaveLength(1);
      expect(claude.calls[0].wikiIndex[0].slug).toBe('aldren');
    });
  });

  it('non-admin role is rejected', async () => {
    await withRollbackDb(async (db) => {
      const modId = 'mod-autolink';
      await db.insert(schema.users).values({ id: modId, email: `${modId}@x.com`, name: 'M', role: 'moderator' });
      const claude = new FakeClaudeClient({ annotatedText: 'x' });
      const { app, tokens } = await setupApp(db, claude);
      const { plaintext } = await tokens.create({ userId: modId, userRole: 'moderator', name: 'mod' });

      const response = await app.inject({
        method: 'POST',
        url: '/api/admin/autolink',
        headers: { authorization: `Bearer ${plaintext}`, 'content-type': 'application/json' },
        payload: { chapterText: 'x', policy: 'every-mention' },
      });
      expect(response.statusCode).toBe(403);
    });
  });
});
```

- [ ] **Step 2: Implement `backend/src/features/admin/autolink-routes.ts`.**

```ts
import type { FastifyInstance } from 'fastify';
import { schema } from '../../db/schema.js';
import type { ClaudeClient, WikiIndex } from '../../lib/external/claude.js';

declare module 'fastify' {
  interface FastifyInstance {
    claude: ClaudeClient;
  }
}

export async function registerAutolinkRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/api/admin/autolink',
    {
      preHandler: [app.requireAuth, app.requireRole('admin')],
      schema: {
        body: {
          type: 'object',
          required: ['chapterText'],
          properties: {
            chapterText: { type: 'string', minLength: 1, maxLength: 500_000 },
            policy: { type: 'string', enum: ['first-mention-per-chapter', 'first-mention-per-section', 'every-mention'] },
          },
        },
      },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const body = request.body as { chapterText: string; policy?: 'first-mention-per-chapter' | 'first-mention-per-section' | 'every-mention' };
      const policy = body.policy ?? 'first-mention-per-section';

      const entries = await app.db.select({
        category: schema.wikiEntries.category,
        slug: schema.wikiEntries.slug,
        name: schema.wikiEntries.name,
        frontMatter: schema.wikiEntries.frontMatter,
      }).from(schema.wikiEntries);

      const wikiIndex: WikiIndex = entries.map(e => ({
        category: e.category,
        slug: e.slug,
        name: e.name,
        aliases: extractAliases(e.frontMatter),
      }));

      const result = await app.claude.annotateChapter({
        chapterText: body.chapterText,
        wikiIndex,
        policy,
      });

      await app.audit.log({
        actorUserId: request.user!.id,
        action: 'autolink.request',
        targetType: 'chapter',
        metadata: {
          chars: body.chapterText.length,
          model: result.model,
          tokensIn: result.tokensIn,
          tokensOut: result.tokensOut,
          policy,
        },
      }).catch((err) => request.log.error({ err }, 'audit log failed'));

      return reply.send({
        annotatedText: result.annotatedText,
        usage: { model: result.model, tokensIn: result.tokensIn, tokensOut: result.tokensOut },
      });
    },
  );
}

function extractAliases(frontMatter: any): string[] {
  if (!frontMatter) return [];
  if (Array.isArray(frontMatter.aliases)) return frontMatter.aliases as string[];
  return [];
}
```

- [ ] **Step 3: Create `backend/src/features/admin/index.ts`.**

```ts
import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { registerAutolinkRoutes } from './autolink-routes.js';
import { createClaudeClient } from '../../lib/external/claude.js';

async function adminPlugin(app: FastifyInstance) {
  if (!app.hasDecorator('claude')) {
    app.decorate('claude', createClaudeClient());
  }
  await registerAutolinkRoutes(app);
}

export default fp(adminPlugin, { name: 'admin', dependencies: ['permissions', 'wiki', 'audit'] });
```

- [ ] **Step 4: Wire into `server.ts`.**

```ts
import adminPlugin from './features/admin/index.js';
// ...
await app.register(adminPlugin);
```

- [ ] **Step 5: Run tests.**

```bash
cd backend
NODE_ENV=test npm test -- --run features/admin/autolink
cd ..
```

- [ ] **Step 6: Commit.**

```bash
git add backend/src/features/admin/ backend/src/server.ts
git commit -m "feat(backend): admin autolink endpoint backed by Claude"
```

---

## Task 9: Site-rebuild admin endpoint (manual trigger)

**Files:**
- Create: `backend/src/features/admin/site-rebuild-routes.ts`
- Create: `backend/src/features/admin/site-rebuild-routes.test.ts`

- [ ] **Step 1: Write failing test.**

```ts
import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import { withRollbackDb } from '../../lib/test-db.js';
import { schema } from '../../db/schema.js';
import { createPermissionsService } from '../permissions/service.js';
import { createTokenService } from '../tokens/service.js';
import { createAuditService } from '../audit/service.js';
import { createRequireAuth, createRequireRole } from '../permissions/middleware.js';
import { registerSiteRebuildRoutes } from './site-rebuild-routes.js';
import { FakeGitHubDispatchClient } from '../../lib/external/github-dispatch.js';

async function setupApp(db: any, dispatch: any) {
  const tokens = createTokenService(db);
  const perms = createPermissionsService(db);
  const audit = createAuditService(db);
  const app = Fastify();
  app.decorate('db', db);
  app.decorate('tokens', tokens);
  app.decorate('perms', perms);
  app.decorate('audit', audit);
  app.decorate('dispatch', dispatch);
  app.decorate('auth', { api: { getSession: async () => null } } as any);
  app.decorate('requireAuth', createRequireAuth({ app, tokens }));
  app.decorate('requireRole', (m: any) => createRequireRole(perms, m));
  await registerSiteRebuildRoutes(app);
  await app.ready();
  return { app, tokens };
}

describe('site-rebuild route', () => {
  it('admin triggers a rebuild dispatch', async () => {
    await withRollbackDb(async (db) => {
      const adminId = 'admin-rebuild';
      await db.insert(schema.users).values({ id: adminId, email: `${adminId}@x.com`, name: 'A', role: 'admin' });
      const dispatch = new FakeGitHubDispatchClient();
      const { app, tokens } = await setupApp(db, dispatch);
      const { plaintext } = await tokens.create({ userId: adminId, userRole: 'admin', name: 'rebuild' });

      const response = await app.inject({
        method: 'POST',
        url: '/api/admin/site-rebuild',
        headers: { authorization: `Bearer ${plaintext}` },
      });
      expect(response.statusCode).toBe(204);
      expect(dispatch.events).toHaveLength(1);
      expect(dispatch.events[0].eventType).toBe('wiki-content-changed');
      expect((dispatch.events[0].clientPayload as any).reason).toBe('manual');
    });
  });
});
```

- [ ] **Step 2: Implement `backend/src/features/admin/site-rebuild-routes.ts`.**

```ts
import type { FastifyInstance } from 'fastify';

export async function registerSiteRebuildRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/api/admin/site-rebuild',
    { preHandler: [app.requireAuth, app.requireRole('admin')] },
    async (request, reply) => {
      await app.dispatch.triggerEvent({
        eventType: 'wiki-content-changed',
        clientPayload: { reason: 'manual', actorUserId: request.user!.id },
      });

      await app.audit.log({
        actorUserId: request.user!.id,
        action: 'site.rebuild.manual',
      }).catch((err) => request.log.error({ err }, 'audit log failed'));

      return reply.code(204).send();
    },
  );
}
```

- [ ] **Step 3: Register in `admin/index.ts`.**

```ts
import { registerSiteRebuildRoutes } from './site-rebuild-routes.js';
// ...
await registerSiteRebuildRoutes(app);
```

- [ ] **Step 4: Run tests.**

```bash
cd backend
NODE_ENV=test npm test -- --run features/admin
cd ..
```

- [ ] **Step 5: Commit.**

```bash
git add backend/src/features/admin/site-rebuild-routes.ts backend/src/features/admin/site-rebuild-routes.test.ts backend/src/features/admin/index.ts
git commit -m "feat(backend): admin manual site-rebuild endpoint"
```

---

## Task 10: Eleventy build-time wiki fetch

**Files:**
- Modify: `frontend/.eleventy.js`
- Modify: `frontend/src/_data/wiki.js` (new — Eleventy global data file)

- [ ] **Step 1: Create `frontend/src/_data/wiki.js` as a build-time data source.**

```js
// At build time, Eleventy executes this file and exposes the returned data
// as `wiki` in every template.
//
// The backend is configured for scale-to-zero on Fly. The first request after
// idle pays a ~2-4s cold start. We give the fetch a 20s budget — long enough
// to cover the cold start AND a slow response, short enough to fail fast if
// the backend is actually broken (so CI builds don't hang indefinitely).

const FETCH_TIMEOUT_MS = 20_000;

module.exports = async function () {
  const baseUrl = process.env.LORE_API_URL_BUILD || 'http://localhost:3000';
  const empty = { entries: [], byCategory: {}, indexedAt: new Date().toISOString() };

  try {
    const response = await fetch(`${baseUrl}/api/wiki/all`, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) {
      console.warn(`[wiki] API returned ${response.status}; continuing with empty wiki data.`);
      return empty;
    }
    const entries = await response.json();

    const byCategory = {};
    for (const e of entries) {
      if (!byCategory[e.category]) byCategory[e.category] = [];
      byCategory[e.category].push(e);
    }

    console.log(`[wiki] Loaded ${entries.length} wiki entries from ${baseUrl}/api/wiki/all`);
    return { entries, byCategory, indexedAt: new Date().toISOString() };
  } catch (err) {
    const reason = err.name === 'TimeoutError'
      ? `timed out after ${FETCH_TIMEOUT_MS}ms (backend cold or unreachable)`
      : err.message;
    console.warn(`[wiki] Failed to fetch from ${baseUrl}: ${reason}. Continuing with empty wiki data.`);
    return empty;
  }
};
```

**Graceful degradation:** If the backend is unreachable or slow, the build doesn't fail — it just renders with no wiki content. The most recent successful build stays live until the next successful rebuild. The 20s budget covers Fly's cold start (~2-4s) plus the actual response with margin.

- [ ] **Step 2: Reference `wiki` data from templates as needed.**

For now, this is foundational infrastructure — actual usage of `wiki` data in templates is the wiki module feature spec. We just verify the data is available:

In `frontend/src/wiki/index.md` add temporary debug output (remove later when wiki module spec runs):

```md
---
title: Wiki
layout: base.njk
permalink: /wiki/index.html
---

# Wiki

{% if wiki.entries.length %}
  {{ wiki.entries.length }} entries indexed at {{ wiki.indexedAt }}.
{% else %}
  No entries yet — sync the wiki via `scripts/sync-wiki.js` and rebuild.
{% endif %}
```

- [ ] **Step 3: Run the local backend, then build the site.**

Terminal 1:
```bash
cd backend
npm run dev
```

Terminal 2:
```bash
cd frontend
LORE_API_URL_BUILD=http://localhost:3000 npm run build
cat _site/wiki/index.html | head -40
```

Expected: the `_site/wiki/index.html` shows the entries count (or "No entries yet" if you haven't sync'd anything). Backend logs should show a request to `/api/wiki/all`.

- [ ] **Step 4: Commit.**

```bash
git add frontend/src/_data/wiki.js frontend/src/wiki/index.md
git commit -m "feat(frontend): Eleventy fetches wiki entries from API at build time"
```

---

## Task 11: Update GitHub Actions to pass LORE_API_URL_BUILD

**Files:**
- Modify: `.github/workflows/deploy-site.yml`

- [ ] **Step 1: Open the workflow file.**

```bash
cat .github/workflows/deploy-site.yml
```

- [ ] **Step 2: Add the env var to the build job.**

Inside the `build` job, find the step that runs `npm run build` and update it to:

```yaml
      - name: Build site
        run: npm run build
        env:
          LORE_API_URL_BUILD: ${{ secrets.LORE_API_URL_BUILD }}
```

- [ ] **Step 3: Add the GitHub secret.**

Either via the GitHub UI (Settings → Secrets and variables → Actions → New secret), or via gh CLI:

```bash
gh secret set LORE_API_URL_BUILD --body "https://loreuniverse-api.fly.dev"
```

- [ ] **Step 4: Commit.**

```bash
git add .github/workflows/deploy-site.yml
git commit -m "ci: pass LORE_API_URL_BUILD to Eleventy build"
```

---

## Task 12: Local autolinker script

**Files:**
- Create: `scripts/autolink.js`

- [ ] **Step 1: Implement the script.**

```js
#!/usr/bin/env node
import 'dotenv/config';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const usage = `Usage: node scripts/autolink.js <chapter-file> [--policy=<policy>]

Reads a chapter markdown file, calls the backend's /api/admin/autolink endpoint,
and writes the annotated chapter to <chapter-file>.autolinked.md alongside.

Required env vars (in .env or shell):
  LORE_API_URL       - Backend URL (e.g. https://loreuniverse-api.fly.dev)
  LORE_API_TOKEN     - Admin token (lore_admin_...)

Policy options: first-mention-per-chapter | first-mention-per-section | every-mention
Default policy: first-mention-per-section
`;

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes('--help')) {
    console.log(usage);
    process.exit(0);
  }

  const inputFile = args[0];
  const policyArg = args.find(a => a.startsWith('--policy='));
  const policy = policyArg ? policyArg.split('=')[1] : 'first-mention-per-section';

  const url = process.env.LORE_API_URL;
  const token = process.env.LORE_API_TOKEN;
  if (!url || !token) {
    console.error('LORE_API_URL and LORE_API_TOKEN must be set in environment.');
    process.exit(1);
  }

  const chapterText = await readFile(inputFile, 'utf-8');
  console.log(`Annotating ${inputFile} (${chapterText.length} chars) with policy "${policy}"...`);

  const response = await fetch(`${url}/api/admin/autolink`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ chapterText, policy }),
  });

  if (!response.ok) {
    const text = await response.text();
    console.error(`API call failed: ${response.status} ${text}`);
    process.exit(1);
  }

  const body = await response.json();
  const outputFile = inputFile.replace(/\.md$/, '.autolinked.md');
  await writeFile(outputFile, body.annotatedText, 'utf-8');

  console.log(`Wrote ${outputFile}`);
  console.log(`Usage: model=${body.usage.model} tokens_in=${body.usage.tokensIn} tokens_out=${body.usage.tokensOut}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
```

- [ ] **Step 2: Add a `.env.example` for scripts.**

Create `scripts/.env.example`:
```
LORE_API_URL=https://loreuniverse-api.fly.dev
LORE_API_TOKEN=lore_admin_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

- [ ] **Step 3: Test with a sample chapter file.**

Pick any existing chapter under `frontend/src/lorekeeper/books/`, copy its full path. Make sure your local backend is running, and that you have at least one wiki entry seeded.

```bash
# Set env vars in scripts/.env (which is gitignored)
cp scripts/.env.example scripts/.env
# Edit scripts/.env: set LORE_API_URL=http://localhost:3000 and LORE_API_TOKEN to a real one
node --env-file=scripts/.env scripts/autolink.js frontend/src/lorekeeper/books/book1/chapters/<some-chapter>.md
```
Expected: writes `<some-chapter>.autolinked.md` alongside. Diff it:
```bash
diff frontend/src/lorekeeper/books/book1/chapters/<some-chapter>.md frontend/src/lorekeeper/books/book1/chapters/<some-chapter>.autolinked.md
```
Expected: the annotated version contains `{category|slug|display}` tokens. If you only have one wiki entry seeded, you'll see few or no annotations — that's OK; the round-trip is verified.

- [ ] **Step 4: Commit.**

```bash
git add scripts/autolink.js scripts/.env.example
git commit -m "feat: local autolinker CLI script"
```

---

## Task 13: Full health endpoint expansion

**Files:**
- Modify: `backend/src/routes/health.ts`
- Modify: `backend/src/routes/health.test.ts`

- [ ] **Step 1: Update tests.**

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

  afterAll(async () => { await app.close(); await closeDb(); });

  it('includes every foundation module', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });
    const body = response.json();
    expect(Object.keys(body.modules).sort()).toEqual([
      'admin', 'audit', 'auth', 'books', 'chapters', 'db', 'permissions', 'tokens', 'wiki',
    ].sort());
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
        wiki: { status: 'ok' },
        books: { status: 'ok' },
        chapters: { status: 'ok' },
        admin: { status: 'ok' },
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

- [ ] **Step 3: Run and commit.**

```bash
cd backend
NODE_ENV=test npm test
cd ..
git add backend/src/routes/health.ts backend/src/routes/health.test.ts
git commit -m "feat(backend): /health reports all foundation modules"
```

---

## Task 14: Set production secrets, deploy, smoke test

**Files:** none modified — operational.

- [ ] **Step 1: Set Anthropic + GitHub dispatch secrets on Fly.**

```bash
flyctl secrets set --app loreuniverse-api \
  ANTHROPIC_API_KEY="<your-anthropic-key>" \
  GITHUB_DISPATCH_TOKEN="<your-fine-grained-PAT-with-contents-write>" \
  GITHUB_DISPATCH_REPO="LoreUniverse/loreuniverse.github.io"
```

To create the GitHub PAT: GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens. Repository access: only `LoreUniverse/loreuniverse.github.io`. Permissions: **Contents (write)** — this is the specific permission GitHub's `POST /repos/{owner}/{repo}/dispatches` endpoint requires (per their fine-grained token docs). `Contents: write` implicitly grants read.

- [ ] **Step 2: Push branch and merge.**

```bash
git push -u origin foundation-d-static-integration-claude
gh pr create --title "Foundation D: static integration + Claude autolink" \
  --body "Implements Plan D. See docs/superpowers/plans/2026-05-22-foundation-d-static-integration-and-claude.md."
```

Wait for CI tests to pass, then merge.

- [ ] **Step 3: Run wiki/chapter sync against production.**

After the deploy:

```bash
# Set DATABASE_URL to the Neon production connection string locally
export DATABASE_URL="postgres://...neon.tech/neondb?sslmode=require"
cd backend && npm run build && cd ..
node scripts/sync-wiki.js
node scripts/sync-chapters.js
```

Verify in Neon's web console or via psql:
```bash
docker run --rm -it postgres:17-alpine psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM wiki_entries; SELECT COUNT(*) FROM chapters;"
```

- [ ] **Step 4: Test the autolinker against production.**

```bash
# In scripts/.env: set LORE_API_URL=https://loreuniverse-api.fly.dev and LORE_API_TOKEN to your prod token
node --env-file=scripts/.env scripts/autolink.js frontend/src/lorekeeper/books/book1/chapters/<some-chapter>.md
```

Expected: produces `<some-chapter>.autolinked.md`. Check the contents.

- [ ] **Step 5: Trigger a manual site rebuild.**

```bash
curl -X POST https://loreuniverse-api.fly.dev/api/admin/site-rebuild \
  -H "Authorization: Bearer <your-token>"
```
Expected: `204` response. Check GitHub Actions in the browser — a `deploy-site` workflow should be running, triggered by `repository_dispatch`.

After it completes, check the live site:
```bash
curl -s https://loreuniverse.github.io/wiki/ | grep -E '(entries indexed|No entries yet)'
```
Expected: shows the indexed count from the production wiki.

- [ ] **Step 6: Final health check.**

```bash
curl -s https://loreuniverse-api.fly.dev/health
```
Expected: every module reports `ok`. DB latency reasonable.

---

## Task 15: PROJECT_BRIEFING update + foundation closeout

**Files:**
- Modify: `PROJECT_BRIEFING.md`

- [ ] **Step 1: Section 6 (Current State) — add:**

```markdown
| books / chapters / wiki_entries / wiki_revisions schemas | ✅ Done (Foundation Plan D) |
| Books + chapters + wiki feature plugins | ✅ Done (Foundation Plan D) |
| Chapter sync script (scripts/sync-chapters.js) | ✅ Done (Foundation Plan D) |
| Wiki sync script (scripts/sync-wiki.js) | ✅ Done (Foundation Plan D) |
| Claude client wrapper (circuit-breaker + retry) | ✅ Done (Foundation Plan D) |
| GitHub dispatch client wrapper | ✅ Done (Foundation Plan D) |
| /api/admin/autolink endpoint | ✅ Done (Foundation Plan D) |
| /api/admin/site-rebuild endpoint | ✅ Done (Foundation Plan D) |
| Eleventy build-time wiki fetch | ✅ Done (Foundation Plan D) |
| Local autolink CLI (scripts/autolink.js) | ✅ Done (Foundation Plan D) |
| Foundation complete | ✅ All four plans merged |
```

- [ ] **Step 2: Section 10 roadmap — mark all done and add the next phase.**

```markdown
- Plan A: ✅ monorepo restructure, library rename, backend skeleton
- Plan B: ✅ database, auth (Better Auth + Resend), email-verified signup/login
- Plan C: ✅ roles, permissions, API tokens, audit log
- Plan D: ✅ static-site/backend integration, Claude autolink endpoint

## Next phase: feature specs

With the foundation complete, feature specs can now be written and built independently:
1. Accounts UI + reading progress + bookmarks + favorites
2. Spoiler-aware wiki visibility logic
3. Comments (sentence-level, threaded, moderated, GIF support)
4. Editable wiki module (the user-facing wiki editor)
5. Book reviews + ratings + per-book landing pages + external commerce links
6. Patreon link vs. custom membership system
7. Future modules: Discussion forum, Art module, Games module

Each gets its own brainstorm → spec → plan → execution cycle. See `docs/superpowers/specs/` for the foundation spec.
```

- [ ] **Step 3: Commit, push, merge as a small follow-up PR (since this is a docs-only change).**

```bash
git checkout -b docs-foundation-complete
git add PROJECT_BRIEFING.md
git commit -m "docs: mark foundation complete; outline next phase of feature specs"
git push -u origin docs-foundation-complete
gh pr create --title "Mark foundation complete" --body "Final docs update; foundation is done."
```

Merge.

---

## Definition of Done

- [ ] `books`, `chapters`, `wiki_entries`, `wiki_revisions` tables exist in production via migration.
- [ ] `/api/wiki/all`, `/api/wiki/:category/:slug` read endpoints functional.
- [ ] `/api/admin/wiki/:category/:slug` PUT endpoint works; writes a `wiki_revisions` row and triggers a `repository_dispatch`.
- [ ] `/api/books`, `/api/books/:slug`, `/api/chapters/:bookSlug` read endpoints functional.
- [ ] `scripts/sync-chapters.js` and `scripts/sync-wiki.js` populate the DB from markdown.
- [ ] `Claude` and `GitHubDispatch` clients exist with `Fake*` implementations and circuit-breaker wrapping for the real ones.
- [ ] `/api/admin/autolink` returns annotated chapter text via Claude.
- [ ] `/api/admin/site-rebuild` triggers a GitHub `repository_dispatch`.
- [ ] Eleventy's build fetches wiki data from `/api/wiki/all` and exposes it as `wiki` in templates.
- [ ] `scripts/autolink.js` round-trips locally and against production.
- [ ] `/health` reports all foundation modules.
- [ ] PROJECT_BRIEFING marks foundation complete.

**Foundation done.** The next time we engage, it'll be the first feature spec — likely accounts UI + reading progress.
