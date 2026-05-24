# Lore Universe — Project Briefing

> Paste this document at the start of any new Claude session to restore full project context.
> Update the **Current State** and **Pending Decisions** sections regularly.

---

## 1. Project Identity

**Name:** Lore Universe  
**Website purpose:** A personal creative writing website hosting a serialized sci-fi/fantasy novel and an information wiki for the novel's universe.  
**Long-term vision:** Multiple novels set in the same universe, all supported by a shared wiki. The wiki serves both as a standalone reference and as a companion to the novels.  
**Owner background:** Software engineering background; no prior frontend/backend/full-stack experience; learning AI-assisted development as a primary goal of this project.

---

## 2. Tech Stack

| Component | Choice | Notes |
|---|---|---|
| Static site generator | Eleventy (11ty) | Chosen for flexibility and structured data support |
| Templating language | Nunjucks (.njk) | Eleventy's most capable templating option |
| Content format | Markdown + YAML front matter | Compatible with existing Obsidian notes |
| Deployment | GitHub Pages via GitHub Actions | Automatic build/deploy on push to main |
| Version control | Git / GitHub | Repository: https://github.com/LoreUniverse/loreuniverse.github.io |
| Node version | 24.15.0 | |
| Eleventy version | 3.1.5 | |
| Editor | Visual Studio Code | |
| Notes source | Obsidian | Uses `[[double bracket]]` internal link syntax |

**Live site:** https://loreuniverse.github.io/

---

## 3. Folder Structure

The site is organized into **modules** living under `frontend/src/`. Each module gets its own URL namespace. The site-wide `base.njk` provides the global navbar and chrome.

The repo is now a **monorepo** with three packages at the root:

```
loreuniverse/                        # repo root
├── frontend/                        # Eleventy static site
│   ├── .eleventy.js
│   ├── package.json
│   └── src/
│       ├── _data/
│       │   ├── site.js              # single source of truth for module URL paths
│       │   ├── navigation.js        # navbar items
│       │   └── config.js
│       ├── _includes/
│       │   ├── base.njk
│       │   ├── redirect.njk         # meta-refresh redirect template
│       │   └── (per-category wiki layouts)
│       ├── lorekeeper/              # LIBRARY module (internal name kept)
│       │   ├── index.md             # serves at /library/
│       │   └── books/
│       ├── wiki/                    # WIKI module (top-level)
│       │   ├── index.md             # serves at /wiki/
│       │   ├── characters/
│       │   ├── lore-traits/
│       │   ├── mechanics/
│       │   ├── locations/
│       │   ├── factions/
│       │   └── lore/
│       ├── redirects/               # legacy /lorekeeper/* → new URLs
│       ├── about/
│       └── index.md
├── backend/                         # Fastify TypeScript API
│   ├── package.json
│   ├── tsconfig.json
│   ├── vitest.config.ts
│   ├── Dockerfile
│   ├── fly.toml
│   └── src/
│       ├── server.ts
│       └── routes/
│           ├── health.ts
│           └── health.test.ts
├── shared/                          # Shared TypeScript types
│   ├── package.json
│   └── src/
│       └── index.ts
├── scripts/
├── docs/
├── .github/
│   └── workflows/
│       ├── deploy-site.yml
│       └── deploy-backend.yml
└── PROJECT_BRIEFING.md
```

---

## 4. Data Schema

Each wiki category is an Eleventy **collection** — a folder of Markdown files with structured YAML front matter. Cross-references between entries use the entry's filename slug as an identifier.

### Characters
```yaml
name:
status:              # alive | deceased | unknown
species:
factions:            # list — slugs linking to Faction entries
home_location:       # slug linking to a Location entry
lore_traits:         # list — slugs linking to Lore Trait entries
skills:              # list — freeform or structured
equipment:           # list — freeform or structured
notes:               # internal notes, not rendered publicly
# Body (below front matter): full background and character description
```

### Lore Traits
```yaml
name:
subtype:             # the sub-type category this trait belongs to
abilities:           # list — can also be described in body
characters:          # list — slugs linking to Characters who possess this trait
# Body: full description of the trait
```

### Mechanics
```yaml
name:
category:            # "universal law" | "system" | "both"
related_mechanics:   # list — slugs linking to other Mechanic entries
related_entries:     # list — slugs linking to entries in other categories (freeform)
# Body: full description
```

### Locations
```yaml
name:
type:                # city | region | planet | dimension | etc.
factions:            # list — slugs linking to Faction entries
notable_characters:  # list — slugs linking to Character entries
lore:                # list — slugs linking to Lore entries
# Body: full description
```

### Factions
```yaml
name:
type:                # government | order | gang | etc.
alignment:           # freeform
notable_characters:  # list — slugs linking to Character entries
base_location:       # slug linking to a Location entry
lore:                # list — slugs linking to Lore entries
# Body: full description
```

### Lore
```yaml
name:
category:            # history | myth | event | etc.
related_characters:  # list — slugs linking to Character entries
related_locations:   # list — slugs linking to Location entries
related_factions:    # list — slugs linking to Faction entries
# Body: full description
```

### Chapters
```yaml
title:
chapter_number:
arc:                 # story arc grouping (e.g. "Arc 1: The Awakening")
publication_date:    # YYYY-MM-DD
summary:             # short blurb shown on chapter listing page
wiki_links: true     # true | false — controls inline wiki link visibility (see Section 5)
# Body: full chapter prose
```

---

## 5. Established Conventions

### Inline Wiki Links in Chapters
Chapter prose supports a custom link syntax processed by Eleventy at build time:

```
{category|slug|display text}
```

**Examples:**
- `{characters|aldren|Aldren}` — links to the character entry with slug `aldren`, displays as "Aldren"
- `{locations|the-shattered-reach|the Shattered Reach}` — links to a location entry

**Category names are plural** — they match the folder names exactly (`characters/`, `locations/`, `factions/`, `lore-traits/`, `mechanics/`, `lore/`) and the regex in `.eleventy.js`'s wiki link transform.

**Visibility toggle:**  
A site-wide setting in `src/_data/config.js` controls whether these render as visible hyperlinks or unstyled plain text. When invisible, the link exists in the HTML but has no visual indicator (no underline, no color change). The reader cannot tell the word is linked unless they hover or inspect.

```js
// src/_data/config.js
module.exports = {
  wikiLinksVisible: true  // set to false to hide all inline wiki links
};
```

### Layout Chaining (important)
All entry layout templates (`character.njk`, etc.) extend `base.njk` using front matter. The `---` front matter block **must be the very first thing in the file** — before any Nunjucks comments. If a comment appears before the `---`, Eleventy's front matter parser will not detect it and the layout chain to `base.njk` will silently break, producing pages with no nav or HTML shell.

```njk
---
layout: base.njk
---
{# Comment goes after the front matter, not before #}
```

### Directory Data Files
Each wiki category folder and the chapters folder contains a `.11tydata.json` file that automatically assigns the correct layout template to every entry in that folder. This means individual entry `.md` files do not need a `layout:` field in their front matter.

```json
{ "layout": "character.njk" }
```

### Permalink Convention
All category index pages declare an explicit `permalink` field in their front matter to make their URL unambiguous regardless of file location:

```yaml
permalink: /wiki/characters/
```

### Subdirectory URL Routing
The site is served from `loreuniverse.github.io`, not a subdirectory. Eleventy's `HtmlBasePlugin` (added in `.eleventy.js`) automatically rewrites all root-relative URLs in the HTML output. `pathPrefix` is set in the `.eleventy.js` return config. If the repo is ever renamed or moved to a custom domain, update `pathPrefix` accordingly and remove the plugin if deploying to a root domain.

### Obsidian Migration
The script `scripts/migrate-obsidian.js` converts Obsidian `[[double bracket]]` links to the `{category|slug|display}` syntax above.

**Workflow:**
1. Copy Obsidian `.md` files into the matching subfolder under `scripts/staging/` (e.g., character notes → `scripts/staging/characters/`)
2. Run: `node scripts/migrate-obsidian.js`
3. Find converted files in `scripts/converted/{category}/` — each has a minimal `name:` front matter field; fill in the remaining schema fields by hand
4. Copy the completed files into `src/lorekeeper/wiki/{category}/`

The script builds a lookup index from both staging files and already-migrated `src/lorekeeper/wiki/` entries. Unresolved links (page name not found in either source) are left unconverted and reported in the console output. Both `staging/` and `converted/` are gitignored.

### Naming Conventions
- Entry filenames: lowercase, hyphen-separated (e.g., `aldren-voss.md`, `the-shattered-reach.md`)
- Slugs in cross-references match filenames without the `.md` extension
- Template files: hyphen-separated `.njk` files in `_includes/`
- Category collection names in `.eleventy.js`: camelCase (e.g., `loreTraits`, `characters`)

### Lorekeeper / Library Naming Convention
The first module of the website is named **Library** externally (URLs, navigation labels, page titles, body text) but retains the identifier `lorekeeper` internally (file paths like `frontend/src/lorekeeper/`, data keys like `site.modules.lorekeeper`, code variables). When adding new features, use `library` for any user-facing text and `lorekeeper` for any code identifier or path.

### Global Data Files (`src/_data/`)
Eleventy automatically exposes every file in `src/_data/` as a template variable named after the file. Two patterns to follow:

- **`site.js` is the single source of truth for module URL paths.** All templates and the `.eleventy.js` wiki link transform reference `site.modules.lorekeeper.{root, wiki, books}` instead of hardcoding paths. If a module is renamed or restructured, edit this file and everything else follows.
- **`navigation.js` is the single source of truth for the navbar.** It exports an array of `{ label, href, submenu? }` items. `base.njk` renders the navbar from this — adding or reordering nav items is a one-file edit.

Do not introduce hardcoded duplicates of paths that already live in these data files. If a new repeated value emerges (e.g. site-wide colors, author info), add a new data file rather than scattering literals.

### Navbar Behavior
- Three top-level items today (Home, Novels, About) — modular so adding items is one line in `navigation.js`.
- A nav item with a `submenu` renders as a label link plus a separate chevron button. **The label click navigates to the parent landing page; the chevron click toggles the dropdown.** This split keeps the parent landing reachable from the navbar even on touch devices.
- Dropdowns are click-to-open (not hover) so touch devices work. Outside click and Escape close them.
- One level of dropdown only. Deeper hierarchy belongs on landing pages.
- The inline CSS and JS for the dropdown in `base.njk` are placeholders — when a real stylesheet and `/assets/js/` exist, they should move out.

### Eleventy Filters (defined in `.eleventy.js`)
- `readableDate` — converts `YYYY-MM-DD` to `Month DD, YYYY`. Used in chapter pages.
- `slugify` — converts freeform text to a URL-safe slug. Used in templates when building links from front matter fields.

---

## 6. Current State

*(Update this section at the end of every working session.)*

| Area | Status |
|---|---|
| GitHub repository | ✅ Renamed to https://github.com/LoreUniverse/loreuniverse.github.io |
| Hosted at org-page root | ✅ Live at https://loreuniverse.github.io/ |
| Local environment (Node, Git, VS Code) | ✅ Set up |
| Eleventy project initialized | ✅ Done |
| GitHub Actions deploy workflow | ✅ Done |
| Base templates and per-category wiki templates | ✅ Done |
| Wiki collections configured (6 categories) | ✅ Done |
| Obsidian migration script | ✅ Done (`scripts/migrate-obsidian.js`) |
| Wiki link processor ({category\|slug\|display}) | ✅ Done (transform in `.eleventy.js`) |
| Module-based folder + URL restructure | ✅ Done (Novels module under `/lorekeeper/`) |
| Centralized URL data (`src/_data/site.js`) | ✅ Done |
| Modular navbar with click-to-open dropdown | ✅ Done (data-driven from `src/_data/navigation.js`) |
| Landing pages (site hub, Novels, Books, About) | ✅ Done (placeholder content; design deferred) |
| Wiki populated with real entries | 🟡 In progress (first batch migrated: pinelopi, librarian, lore-essence-mythos, loreworlds) |
| Book 1 chapters | ⬜ Test chapter only — real prose not started |
| Visual design / theme | ⬜ Not started (deferred) |
| Extract inline CSS/JS in `base.njk` to `/assets/` | ⬜ Pending — comes with design phase |
| Monorepo restructure | ✅ Done (Foundation Plan A) |
| Library URL rename (`/lorekeeper/` → `/library/`) | ✅ Done (Foundation Plan A) |
| Wiki promoted to top-level module (`/wiki/*`) | ✅ Done (Foundation Plan A) |
| Backend skeleton (Fastify + TypeScript + Docker) | ✅ Done (Foundation Plan A) |
| Backend deployed to Fly | ✅ Done (Foundation Plan A) |
| Backend deploy workflow | ✅ Done (Foundation Plan A) |
| Postgres (local + Neon) | ✅ Done (Foundation Plan B) |
| Drizzle ORM + initial schema | ✅ Done (Foundation Plan B) |
| Better Auth + Resend + email verification | ✅ Done (Foundation Plan B) |
| Sign-up / sign-in / sign-out / password reset | ✅ Done (Foundation Plan B) |
| Migrations on Fly deploy | ✅ Done (Foundation Plan B) |
| user_permissions, permission_applications, api_tokens, audit_log schemas | ✅ Done (Foundation Plan C) |
| Role middleware (requireAuth/requireRole/requirePermission) | ✅ Done (Foundation Plan C) |
| Admin: ban/unban, grant/revoke permissions, application review | ✅ Done (Foundation Plan C) |
| User: submit permission application | ✅ Done (Foundation Plan C) |
| API token CRUD (lore_admin_*, lore_moderator_*) | ✅ Done (Foundation Plan C) |
| Audit log (best-effort writes on state-changing endpoints) | ✅ Done (Foundation Plan C) |

**Next planned step:** Continue populating the wiki with real entries via `scripts/migrate-obsidian.js`. After that, replace the test chapter with real Book 1 prose. Visual design is the next major phase once content density justifies it.

**Outstanding small items worth doing soon:**
- `src/_includes/wiki-entry.njk` exists but is unused — either repurpose as a fallback layout or delete
- `scripts/create-structure.js` is a one-time setup script that already ran — consider archiving or deleting

---

## 7. Pending Decisions

- [ ] Whether to implement per-reader wiki link toggle (button on page) in addition to site-wide toggle — deferred until after initial build
- [ ] Visual design and theme — explicitly deferred; do not design yet
- [ ] Patreon link vs. custom membership / donation system — `users.tier` reserved in foundation spec; final choice deferred
- [ ] Account deletion policy (treatment of comments/ratings/wiki revisions when a user deletes account) — schema supports both retention and removal; final policy deferred to relevant feature specs
- [ ] Avatar storage strategy (Gravatar / R2 upload / user-provided URL) — `users.image` column exists; source deferred to first feature that wants avatars

---

## 8. Working Preferences

- Always explain what generated code does, even briefly — the owner is learning, not just copy-pasting
- Ask before making structural changes to the schema or folder layout
- When multiple approaches exist, briefly describe the tradeoff before recommending one
- Prefer generating complete, ready-to-use files over code snippets where possible
- Flag anything that will need to be manually updated after generation (e.g., placeholder values, version numbers)
- Do not provide input on any creative aspects of this project unless specifically prompted. Ask if you think something needs to be addressed immediately.

---

## 9. Working Directory
- All work for this project is done in the repo root containing `frontend/`, `backend/`, `shared/`, `scripts/`, `docs/`.

---

## 10. Future Scope

Ideas and architectural concerns captured here so the foundation can grow into them. Not being worked on now — the current focus is a foundational Novels module with one book and a working wiki.

### Architectural direction (mostly implemented)
The module-based URL structure, three-item modular navbar with click dropdown, repo rename, and centralized URL data are all done — see Section 6. Items in this category still pending:

- **Future modules.** The structure is in place to add `/game-resources/`, `/art/`, etc. as siblings of `/lorekeeper/`. No work needed until a second module is wanted.
- **Shared design layer.** Before the next module's landing page is built, extract reusable partials (hero, module card, featured-content tile, footer) into `_includes/partials/` and define shared CSS variables for color and typography. Also move the inline CSS/JS in `base.njk` into `/assets/` at this point.
- **Books collection.** `src/lorekeeper/books/index.md` currently hand-lists Book 1. When a second book is added, replace the hand-list with a `books` collection driven by a `books.js` data file or by globbing `src/lorekeeper/books/*/info.md`.

### Near-term planned features
Small, well-scoped items to add once content density justifies them:

- **Previous / next chapter navigation** — pagination links at the bottom of chapter pages. A placeholder comment is already in `chapter.njk` marking where these go.
- **Wiki category images** — the wiki homepage (`src/lorekeeper/wiki/index.md`) is planned to display each category as a visual box with an image. Deferred to design session.
- **Visual design and theme** — all templates are currently unstyled HTML. CSS to be added to `src/assets/css/` with passthrough copy uncommented in `.eleventy.js`.

### Cross-module linking convention
- The current wiki link transform hardcodes `/lorekeeper/wiki/${category}/${slug}/`. This works for now because all custom links target wiki entries.
- Once links need to cross module boundaries (e.g., a wiki entry referencing a chapter, or a homepage tile linking into the wiki), introduce a single link-builder — a Nunjucks shortcode or Eleventy filter — that takes a logical reference like `{module: "lorekeeper", type: "chapter", book: 1, chapter: 3}` and returns the URL. One source of truth so URL changes don't require hunting through templates.
- Do NOT copy-paste the existing wiki link transform into other modules with hardcoded paths. When the second cross-module link target appears, that is the trigger to generalize.

### Authoring tooling
- **Automated chapter reference linker (Claude skill).** A skill that parses a chapter file's prose and automatically rewrites references to known wiki entities into the `{category|slug|display}` syntax — e.g., spotting a character's name in narration and wrapping it as `{characters|aldren|Aldren}`. Acknowledged as ambitious because it requires real judgment:
  - **Disambiguation** — "Mark" as a name vs. as a verb; common words that collide with character names.
  - **Linking policy** — link every mention, first mention per chapter, first per scene, or first per section? Probably configurable.
  - **Aliases and partial names** — characters referred to by nickname, title, or last name only need to resolve to the same entry.
  - **Speaker tags vs. in-prose mentions** — may want different treatment (e.g., skip speaker attributions).
  - **Unknown references** — when the prose mentions an entity not yet in the wiki, surface it as a suggestion rather than silently skipping.
  - **Ties into the spoiler-aware wiki feature** — the skill might also flag which mentions reveal information from later chapters.

### Long-term feature ambitions
- **Reader progress tracking** — visitors can track which chapters they've read.
- **Spoiler-aware wiki** — wiki entries reveal only the information the reader's progress entitles them to see. Likely implemented as per-section visibility flags tied to chapter/arc markers.
- **Accounts / forum** — user accounts powering progress tracking, and potentially a community forum.

### Discoverability mitigation (still in progress)
The module structure buries wiki content two levels deep. Current landing pages have basic content hooks but mostly route rather than curate. Real curatorial work still pending:

- **Homepage:** currently has three section cards (Novels, Start reading, Browse wiki). Should grow into featured-content tiles — latest chapter, featured character, recent wiki entries — pulled dynamically from collections.
- **Novels landing page:** has a working latest-chapter preview. Should add popular wiki entries, content stats ("47 characters, 12 factions"), and visual previews so visitors can scan what is available.
- Both pages contain comments marking the static destinations that should be replaced with dynamic content.

### Sub-project roadmap
Foundational backend implementation is split across four plans, executed sequentially:
- Plan A: ✅ monorepo restructure, library rename, backend skeleton
- Plan B: ✅ database, auth (Better Auth + Resend), email-verified signup/login
- Plan C: ✅ permissions, API tokens, audit log
- Plan D: static-site/backend integration, Claude autolink endpoint

After Plan D, feature work begins. See `docs/superpowers/specs/2026-05-22-foundational-backend-architecture-design.md` for the foundation spec, and `docs/superpowers/plans/` for the plan documents.

---

## 11. Foundational Backend Architecture

A focused architecture session on 2026-05-22 produced a complete spec and four implementation plans for adding a full backend to Lore Universe. **Plan A is currently mid-execution** via the `superpowers:subagent-driven-development` workflow. Plans B–D are written and ready, awaiting Plan A's completion + merge before they execute sequentially.

### Documents

- **Spec:** `docs/superpowers/specs/2026-05-22-foundational-backend-architecture-design.md` — the canonical architecture reference. Read this first.
- **Plan A:** `docs/superpowers/plans/2026-05-22-foundation-a-monorepo-restructure-and-backend-skeleton.md` — monorepo restructure, library URL rename, Wiki promoted to top-level module, Fastify skeleton on Fly.
- **Plan B:** `docs/superpowers/plans/2026-05-22-foundation-b-database-auth-email.md` — Postgres (Neon), Drizzle, Better Auth, Resend, email-verified auth flows.
- **Plan C:** `docs/superpowers/plans/2026-05-22-foundation-c-permissions-tokens-audit.md` — role/permission middleware, API tokens, audit log, ban/grant admin endpoints.
- **Plan D:** `docs/superpowers/plans/2026-05-22-foundation-d-static-integration-and-claude.md` — books/chapters/wiki tables, Claude autolink endpoint, GitHub `repository_dispatch` rebuild flow, Eleventy build-time wiki fetch.

### Resulting tech stack (after all four plans execute)

| Layer | Choice |
|---|---|
| Static site | Eleventy (existing) on GitHub Pages |
| Backend | Fastify + TypeScript, Docker container on Fly.io |
| Database | Postgres on Neon (managed) |
| ORM | Drizzle |
| Auth | Better Auth (email+password day one; social-ready) |
| Email | Resend (free tier from launch) |
| Server-side AI | Anthropic SDK (admin endpoints only) |
| Frontend dynamic | Alpine.js + vanilla default; React islands (Vite-built) for complex UIs |
| File storage (future) | Cloudflare R2 |
| Monorepo layout | `frontend/`, `backend/`, `shared/`, `scripts/` at root |

### Naming conventions established

- **Module** (user-facing) — top-level website section with its own URL namespace: Library at `/library/`, Wiki at `/wiki/`, future Art/Games/Discussion.
- **Feature** (internal backend) — code unit at `backend/src/features/<name>/`, owns its tables.
- **Lorekeeper / Library naming convention** — the first module is called **Library** externally (URLs, nav labels, page titles) but retains the identifier `lorekeeper` internally (file paths like `src/lorekeeper/`, data keys like `site.modules.lorekeeper`, code variables). This split preserves the legacy identifier without disturbing the user-facing rename.

### Structural changes Plan A applies to the current code

- Move all current top-level files into a new `frontend/` subfolder.
- Promote Wiki to a top-level module: move `frontend/src/lorekeeper/wiki/` → `frontend/src/wiki/`.
- Library module (`src/lorekeeper/`) now contains only `index.md` and `books/`.
- URLs: `/lorekeeper/*` → `/library/*` (with redirect stubs from the old URLs to the new ones).
- Add `backend/`, `shared/` siblings of `frontend/`.
- Optional final step: rename local repo checkout folder from `lorekeeper/` to `loreuniverse/`.

### Architectural principles (non-negotiables)

These flow into every future feature spec automatically:

1. No feature reads or writes another feature's tables directly — cross-feature data access goes through service methods.
2. Secondary side-effects (audit, email, webhooks, cache, rebuild triggers) wrap in try/catch + logging; they never propagate failure to the primary operation.
3. Every external dependency call uses timeout + retry + circuit breaker.
4. Frontend React islands wrap in error boundaries.
5. UUIDs for primary keys on our tables; text IDs (Better Auth-generated) for `users`. Every FK to users is text.
6. All tables have `created_at`; mutable tables have `updated_at`. Timestamps are `timestamptz`.
7. Secrets never enter the repo. All config is env vars.
8. Migrations are reversible where feasible.
9. Eleventy stays the static site builder; wiki content is fetched at build time, user-specific data is hydrated client-side.
10. Authorization always evaluates against the user's current role; token prefixes (`lore_admin_`, `lore_moderator_`) are identification only.

### Sub-project roadmap (post-foundation)

After Plans A–D are merged, feature specs can be written and built independently. Each is its own brainstorm → spec → plan → execution cycle.

1. Accounts UI + reading progress + bookmarks + favorites
2. Spoiler-aware wiki visibility logic
3. Comments (sentence-level, threaded, moderated, GIF support)
4. Editable wiki module (user-facing wiki editor UX)
5. Book reviews + ratings + per-book landing pages + external commerce links
6. Patreon link vs. custom membership/donation decision and implementation
7. Future modules: Discussion forum, Art module, Games module

### Cost picture during foundation buildout

| Layer | Service | Cost during buildout |
|---|---|---|
| Static hosting | GitHub Pages | $0 |
| Backend hosting | Fly.io scale-to-zero | ~$0.20/mo (rootfs storage only; first months covered by trial credit) |
| Database | Neon free tier | $0 |
| Email | Resend free tier (3,000/mo) | $0 |
| Domain | Deferred until public launch | $0 (then ~$10/yr) |
| Claude API | Pay-per-use; admin endpoints only | A few $ / month at most |

Effectively under $1/month indefinitely. The Fly trial credit covers the first months of even the small rootfs charge; after that, ~$0.20/mo. The first meaningful dollar happens when you commit to one of: an always-warm backend (~$2-4/mo by flipping `min_machines_running` to 1), a domain (~$10/yr), or growing past Resend's 3,000-emails/mo or Neon's 0.5GB storage free tiers.

**Cold start trade-off:** scale-to-zero means the first request after ~5 minutes of idle pays a ~2-4s cold start. Tolerable during dogfooding. Revisit when public traffic warrants always-warm.

### Plan A execution progress

Execution began 2026-05-22 (after the planning session) using the `superpowers:subagent-driven-development` workflow — fresh subagent per task, with two-stage review (spec compliance + code quality) after each task.

**Execution environment:**
- Worktree path: `C:\Users\timmy\Desktop\LoreUniverse\lorekeeper\.claude\worktrees\foundation-a-monorepo-restructure`
- Branch: `worktree-foundation-a-monorepo-restructure` — the harness's `EnterWorktree` tool added the `worktree-` prefix automatically; Plan A's documentation says the branch should be `foundation-a-monorepo-restructure` (no prefix). The actual branch has the prefix. This is a cosmetic mismatch only — the PR step at Task 22 needs to push the prefixed branch name. Either rename the branch before pushing or use the prefixed name in `gh pr create`.
- The doc commit (`a3d2d11` on main) bringing the spec + four plans was committed before the worktree was created; the worktree was then fast-forwarded to include it.

**Tasks completed (commits in chronological order):**

| Task | Commit | Description |
|---|---|---|
| 1 | (worktree setup) | Branch created via `EnterWorktree`; clean working tree; baseline Eleventy build verified |
| 2 | `a2c9b6a` | Updated `.gitignore` for monorepo paths |
| 3 | `24934e0` | Moved Eleventy site into `frontend/` subfolder; added `build`/`start`/`debug` npm scripts |
| 4 | `f318596` | Renamed `.github/workflows/deploy.yml` → `deploy-site.yml`; updated paths, added `repository_dispatch` trigger, set concurrency to cancel-in-progress |
| 5 | (verification only) | Confirmed site still builds from new location; HTTP probes for `/`, `/lorekeeper/*`, `/about/` all return 200 |
| 6 | `a85d390` | Restructured navigation: "Novels" → "Library", Wiki promoted from Library submenu to its own top-level nav item |
| 7 | `d023530` | Moved `src/lorekeeper/wiki/` → `src/wiki/` (23 files, recorded as 100% similarity renames); added `lorekeeper.11tydata.js` permalink cascade for Library URLs; updated 6 wiki category index permalinks |
| 8 | `fced180` | Updated `site.js` (Library + Wiki module data keys), wiki link transform in `.eleventy.js` (now uses `site.modules.wiki.root`), 6 wiki collection globs (point at `src/wiki/`), and 8 additional template/markdown files containing legacy references caught via grep |

After Task 8, build output is fully migrated: `_site/library/...` and `_site/wiki/...` exist; `_site/lorekeeper/` does not. No `"/lorekeeper/` or `"/library/wiki/` URLs remain anywhere in the build.

**Tasks remaining: 9–23 (15 tasks).**

| Task | Status | Description |
|---|---|---|
| 9 | not started | Add redirect stubs from `/lorekeeper/*` to new URLs |
| 10 | not started | Scaffold `backend/` directory (Fastify + TypeScript + Vitest) |
| 11 | not started | Set up Vitest configuration |
| 12 | not started | Write failing health endpoint test (TDD red) |
| 13 | not started | Implement health endpoint (TDD green) |
| 14 | not started | Create Fastify server entry point |
| 15 | not started | Add Dockerfile (multi-stage) |
| 16 | not started | `flyctl launch --no-deploy`; replace generated `fly.toml` with scale-to-zero config |
| 17 | not started | Deploy backend to Fly manually; verify `/health` |
| 18 | not started | Add `deploy-backend.yml` workflow; generate Fly deploy token; add as GitHub repo secret |
| 19 | not started | Create `shared/` workspace placeholder; link as dep in backend |
| 20 | not started | Rewrite root `README.md` as monorepo overview |
| 21 | not started | Update this `PROJECT_BRIEFING.md` (Section 3 folder tree, Section 5 conventions, Section 6 current state rows, Section 9 working dir, Section 10 roadmap) |
| 22 | not started | Final E2E verification; push branch; open PR; merge; verify production |
| 23 | not started (optional) | Rename local checkout folder from `lorekeeper/` to `loreuniverse/` |

**Known gotchas encountered so far:**
- **Windows `git mv` permission denied:** On Task 7, `git mv` for the wiki folder failed with "Permission denied" inside the worktree. The implementer used `robocopy` + `git rm` as a workaround. Git still detected all 23 files as 100% similarity renames in the final commit. The same workaround may be needed for future `git mv` operations on Windows. (This is a known Windows + git worktree quirk, not an issue with the plans.)
- **Subagent reviewer false positives:** Two reviewers gave incorrect verdicts that required overriding:
  - Task 3 spec reviewer flagged `"@11ty/eleventy": "^3.1.5"` as a "version mismatch" — caused by a typo in the spec-reviewer prompt (`^11.1.5` instead of `^3.1.5`); Eleventy is on 3.x and the package.json is correct.
  - Task 7 code-quality reviewer flagged the wiki category permalinks as still being `/lorekeeper/wiki/<cat>/` — direct file inspection confirmed they were updated to `/wiki/<cat>/`. The reviewer misread the files.
- **Task 8 code-quality review interrupted:** The previous controller session hit the Anthropic session reset limit during Task 8's code-quality review. The implementer reported DONE and the spec reviewer confirmed ✅. The code-quality review was dispatched but the response was truncated. Task 8 is functionally complete (build output verified clean, all stale references migrated, post-build grep returns no legacy URLs), so it's safe to proceed without re-running that specific review — but you may want to dispatch it again for completeness when resuming.
- **Eleventy permalink cascade requires `.js` not `.json`:** the original plan suggested `lorekeeper.11tydata.json` with a Nunjucks template string; the pre-flight pass corrected this to `lorekeeper.11tydata.js` with a function. The function-based version is what's in the committed plan and what Task 7 implemented.
- **Bash `cd` doesn't always persist across calls in the harness:** during execution, the controller's Bash working directory occasionally reverted to a parent directory. Defensive workaround: always prefix file operations with `cd "C:/Users/timmy/Desktop/LoreUniverse/lorekeeper/.claude/worktrees/foundation-a-monorepo-restructure" && ...` rather than relying on persistent cwd.

### Resuming Plan A execution

The next controller session should pick up at **Task 9** (redirect stubs). To resume:

1. **Restore context.** Read the full spec at `docs/superpowers/specs/2026-05-22-foundational-backend-architecture-design.md` and Plan A at `docs/superpowers/plans/2026-05-22-foundation-a-monorepo-restructure-and-backend-skeleton.md`. Both are in the worktree already.

2. **Invoke the subagent-driven-development skill** (`superpowers:subagent-driven-development`) — the workflow that was already in use.

3. **For each remaining task (9 through 23):**
   - Read the task's full text from Plan A.
   - Dispatch a fresh implementer subagent (general-purpose agent type, `haiku` for mechanical tasks like file edits and `sonnet` for substantive multi-file tasks).
   - Provide the working directory (worktree path), the actual branch name (`worktree-foundation-a-monorepo-restructure`), and full task text inline (do not have the subagent read the plan file).
   - Handle questions, then dispatch a spec compliance reviewer.
   - Then dispatch a code quality reviewer (only after spec compliance ✅).
   - Mark complete and move to the next task without pausing.

4. **Specific operational tasks** that need user involvement (these are inline within the listed tasks but worth flagging):
   - **Task 16** (`flyctl launch`): interactive prompts — the subagent can guide, but you (the user) provide answers to the launch wizard. The plan documents the expected answers.
   - **Task 17** (first Fly deploy): `flyctl deploy --remote-only` should work non-interactively once Fly is authenticated.
   - **Task 18** (Fly deploy token + GitHub secret): the token generation is CLI (`flyctl tokens create deploy ...`); adding the secret to GitHub requires either `gh secret set FLY_API_TOKEN --body "<token>"` (works if `gh` is authenticated) or the GitHub web UI.
   - **Task 22** (open PR + merge): `gh pr create` works if authenticated; merging from the GitHub UI is typical. The branch name to push and PR from is `worktree-foundation-a-monorepo-restructure` (with the prefix).

5. **After Task 22 merges**, the user has decisions:
   - Run Task 23 (optional local folder rename) — manual filesystem op.
   - Move to Plan B (database + auth + email) — start a new brainstorm-or-execute cycle.

### Original "Next session" plan (kept for reference)

(Plan A is now in progress, so the original "next session" guidance is obsolete. Resuming guidance above supersedes it.)
