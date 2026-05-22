# Foundation Plan A — Monorepo Restructure & Backend Skeleton

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the existing single-project repo into a monorepo layout (static site under `frontend/`, new `backend/` and `shared/` siblings), rename the Library module URLs from `/lorekeeper/*` to `/library/*` (external) while keeping its internal identifier as `lorekeeper`, promote the Wiki to a top-level module at `/wiki/*` (moved up one level from inside Lorekeeper), scaffold a Fastify+TypeScript backend with Docker, and deploy to Fly with a working `/health` endpoint.

**Architecture:** The Eleventy static site moves into a `frontend/` subfolder of the repo. Inside `frontend/src/`, the file layout now reflects the website's module architecture: `lorekeeper/` (Library module — internal name kept) contains only the books, and `wiki/` is its own top-level sibling. URL routing externally renames the Library module to `/library/*` via Eleventy permalink overrides; the Wiki module's source path (`src/wiki/*`) maps to `/wiki/*` natively. A new `backend/` subfolder contains a TypeScript Fastify app that builds into a Docker image and deploys to Fly.io. Two GitHub Actions workflows handle the two deploys.

**Tech Stack:** Node 24, Eleventy 3.1.5 (existing), Fastify 5, TypeScript 5, Vitest 2, Docker, Fly.io, GitHub Actions.

**References:**
- Spec: `docs/superpowers/specs/2026-05-22-foundational-backend-architecture-design.md`
- Project context: `PROJECT_BRIEFING.md`

**Prerequisites before starting:**
1. Sign up at https://fly.io and install `flyctl` (https://fly.io/docs/flyctl/install/).
2. Run `flyctl auth login` and complete the browser flow.
3. Confirm the existing site builds today: from current repo root, `npm install && npx @11ty/eleventy` should produce `_site/` with no errors. (No `npm run build` script exists yet — we add it during Task 3.)

---

## File Structure After This Plan

```
loreuniverse/                        # repo root (rename local folder; see final task)
├── frontend/                        # NEW: static site relocated here
│   ├── .eleventy.js                 # moved from old root
│   ├── package.json                 # moved from old root
│   ├── package-lock.json            # moved from old root
│   └── src/                         # moved from old root, then reorganized
│       ├── _data/
│       │   ├── site.js              # adds site.modules.wiki; lorekeeper URLs → /library/*
│       │   ├── navigation.js        # "Library" and "Wiki" as top-level nav items
│       │   └── config.js
│       ├── _includes/
│       ├── lorekeeper/              # LIBRARY module (internal name kept)
│       │   ├── index.md             # serves at /library/
│       │   └── books/
│       │       └── index.md         # serves at /library/books/
│       ├── wiki/                    # WIKI module (now top-level — moved up from lorekeeper/wiki/)
│       │   ├── index.md             # serves at /wiki/
│       │   ├── characters/
│       │   ├── lore-traits/
│       │   ├── mechanics/
│       │   ├── locations/
│       │   ├── factions/
│       │   └── lore/
│       ├── redirects/               # NEW: legacy /lorekeeper/* URLs redirect to new locations
│       ├── about/
│       └── index.md
├── backend/                         # NEW
│   ├── package.json
│   ├── tsconfig.json
│   ├── vitest.config.ts
│   ├── Dockerfile
│   ├── .dockerignore
│   ├── fly.toml
│   └── src/
│       ├── server.ts                # Fastify entry point
│       └── routes/
│           ├── health.ts            # GET /health
│           └── health.test.ts
├── shared/                          # NEW (placeholder)
│   ├── package.json
│   └── src/
│       └── index.ts
├── scripts/                         # unchanged
├── docs/                            # unchanged
├── .github/
│   └── workflows/
│       ├── deploy-site.yml          # paths updated
│       └── deploy-backend.yml       # NEW
├── .gitignore                       # updated for monorepo paths
├── PROJECT_BRIEFING.md              # updated for new structure
└── README.md                        # rewritten as monorepo overview
```

---

## Task 1: Create branch and snapshot current state

**Files:** none modified yet.

- [ ] **Step 1: Create a feature branch.**

```bash
git checkout main
git pull
git checkout -b foundation-a-monorepo-restructure
```

- [ ] **Step 2: Verify clean working tree.**

```bash
git status
```
Expected output: `nothing to commit, working tree clean`. If not clean, stash or commit before proceeding.

- [ ] **Step 3: Verify the site builds in its current shape.**

The current `package.json` doesn't have a `build` script yet (the GitHub Actions workflow invokes `npx @11ty/eleventy` directly). We'll add proper scripts during Task 3 after moving the file. For now, build with the raw command:

```bash
npm install
npx @11ty/eleventy
ls _site
```
Expected: `_site/` exists with `index.html`, `lorekeeper/`, `about/`, etc. If this fails, stop and resolve before restructuring.

---

## Task 2: Update `.gitignore` for monorepo

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Read current contents.**

```bash
cat .gitignore
```
Expected (current): lines including `node_modules`, `_site`, etc.

- [ ] **Step 2: Replace `.gitignore` with monorepo-aware version.**

Overwrite the file with:

```gitignore
# Dependencies
node_modules/
**/node_modules/

# Build outputs
_site/
frontend/_site/
backend/dist/
shared/dist/

# Logs
*.log
npm-debug.log*

# Environment
.env
.env.local
.env.*.local
**/.env
**/.env.local

# OS
.DS_Store
Thumbs.db

# Editor
.vscode/
.idea/

# Test/coverage
coverage/
**/coverage/

# Obsidian staging (preserved from before)
scripts/staging/
scripts/converted/
```

- [ ] **Step 3: Commit.**

```bash
git add .gitignore
git commit -m "chore: update .gitignore for monorepo paths"
```

---

## Task 3: Move static-site files into `frontend/` subfolder

**Files:**
- Create: `frontend/` (directory)
- Move: `.eleventy.js`, `package.json`, `package-lock.json`, `src/` → `frontend/`

- [ ] **Step 1: Create the subfolder.**

```bash
mkdir frontend
```

- [ ] **Step 2: Move static-site files using `git mv` to preserve history.**

```bash
git mv .eleventy.js frontend/.eleventy.js
git mv package.json frontend/package.json
git mv package-lock.json frontend/package-lock.json
git mv src frontend/src
```

- [ ] **Step 3: Remove the old `node_modules` (will reinstall in the new location).**

```bash
rm -rf node_modules
rm -rf _site
```

- [ ] **Step 4: Reinstall in the new location.**

```bash
cd frontend
npm install
cd ..
```

- [ ] **Step 5: Add npm scripts to `frontend/package.json`.**

The current `package.json` only has a placeholder `test` script. Add proper Eleventy scripts now so all the `npm run build` and `npm start` invocations in later tasks (and the CI workflow) work.

Open `frontend/package.json` and replace the `"scripts"` block with:

```json
  "scripts": {
    "build": "eleventy",
    "start": "eleventy --serve",
    "debug": "DEBUG=Eleventy* eleventy"
  },
```

The full file should look like (preserving everything else from before):

```json
{
  "name": "loreuniverse.github.io",
  "version": "1.0.0",
  "description": "",
  "main": "index.js",
  "scripts": {
    "build": "eleventy",
    "start": "eleventy --serve",
    "debug": "DEBUG=Eleventy* eleventy"
  },
  "repository": {
    "type": "git",
    "url": "git+https://github.com/LoreUniverse/loreuniverse.github.io.git"
  },
  "keywords": [],
  "author": "",
  "license": "ISC",
  "type": "commonjs",
  "bugs": {
    "url": "https://github.com/LoreUniverse/loreuniverse.github.io/issues"
  },
  "homepage": "https://github.com/LoreUniverse/loreuniverse.github.io#readme",
  "devDependencies": {
    "@11ty/eleventy": "^3.1.5"
  }
}
```

Notes:
- `build` runs the production build (writes to `_site/`)
- `start` runs Eleventy's dev server with hot reload on port 8080
- `debug` is occasionally useful for diagnosing build issues

- [ ] **Step 6: Verify the site builds from the new location with the new scripts.**

```bash
cd frontend
npm run build
ls _site
cd ..
```
Expected: `_site/` exists under `frontend/_site/` with the same content as before.

- [ ] **Step 7: Commit.**

```bash
git add frontend/
git commit -m "refactor: move static site into frontend/ subfolder; add npm scripts"
```

---

## Task 4: Update existing GitHub Actions workflow for new paths

**Files:**
- Modify: `.github/workflows/deploy.yml` (rename to `deploy-site.yml` and update paths)

- [ ] **Step 1: Read current workflow.**

```bash
cat .github/workflows/deploy.yml
```

- [ ] **Step 2: Rename workflow file.**

```bash
git mv .github/workflows/deploy.yml .github/workflows/deploy-site.yml
```

- [ ] **Step 3: Replace contents of `.github/workflows/deploy-site.yml`.**

Overwrite with the following (substitute correct values for your `actions/setup-node` version etc. — keep what matches existing if more specific):

```yaml
name: Deploy site

on:
  push:
    branches: [main]
    paths:
      - 'frontend/**'
      - '.github/workflows/deploy-site.yml'
  workflow_dispatch:
  repository_dispatch:
    types: [wiki-content-changed]

concurrency:
  group: deploy-site
  cancel-in-progress: true

permissions:
  contents: read
  pages: write
  id-token: write

jobs:
  build:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: loreuniverse
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '24'
          cache: 'npm'
          cache-dependency-path: frontend/package-lock.json
      - run: npm ci
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: frontend/_site

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/deploy-pages@v4
        id: deployment
```

- [ ] **Step 4: Commit.**

```bash
git add .github/workflows/deploy-site.yml
git commit -m "ci: update site deploy workflow for new frontend/ path"
```

---

## Task 5: Verify site still builds locally

**Files:** none modified — verification only.

- [ ] **Step 1: Clean build from new location.**

```bash
cd frontend
rm -rf _site
npm run build
cd ..
```
Expected: no errors. `frontend/_site/` populated.

- [ ] **Step 2: Spot-check the build output.**

```bash
ls frontend/_site/lorekeeper
ls frontend/_site/about
```
Expected: directories exist with `index.html`. URLs are still `/lorekeeper/*` at this point — we rename them in Task 7.

- [ ] **Step 3: Serve locally and verify visually.**

```bash
cd frontend
npx @11ty/eleventy --serve --quiet
```
Open `http://localhost:8080/` in a browser. Verify the homepage renders. Navigate to the Lorekeeper module. Stop the server with Ctrl+C.

```bash
cd ..
```

---

## Task 6: Restructure navigation — Library and Wiki as top-level modules

**Files:**
- Modify: `frontend/src/_data/navigation.js`

- [ ] **Step 1: Read current contents.**

```bash
cat frontend/src/_data/navigation.js
```
Expected: contains an array including an item with `label: 'Novels'` (or similar) pointing at `/lorekeeper/`, possibly with a submenu including Books and Wiki.

- [ ] **Step 2: Replace contents of `frontend/src/_data/navigation.js`.**

The Library module no longer parents Wiki — they're siblings now. The navbar reflects that.

```js
module.exports = [
  { label: 'Home', href: '/' },
  {
    label: 'Library',
    href: '/library/',
    submenu: [
      { label: 'Books', href: '/library/books/' }
    ]
  },
  { label: 'Wiki', href: '/wiki/' },
  { label: 'About', href: '/about/' }
];
```

If you had additional nav items before that aren't shown here, preserve them in their original positions.

- [ ] **Step 3: Verify nav data is valid.**

```bash
cd frontend
node -e "console.log(JSON.stringify(require('./src/_data/navigation.js'), null, 2))"
cd ..
```
Expected: JSON output showing "Library", "Wiki", and "About" as top-level items.

---

## Task 7: Move Wiki to its own top-level module, then add Library permalink overrides

This task reorganizes the source tree to match the new module architecture: Wiki moves out of `lorekeeper/` to become its own top-level module, and the remaining Library content gets permalink overrides so it serves at `/library/*`.

**Files:**
- Move: `frontend/src/lorekeeper/wiki/` → `frontend/src/wiki/`
- Create: `frontend/src/lorekeeper/lorekeeper.11tydata.js` (directory data cascade for Library)
- Modify: existing `permalink:` front matter inside `frontend/src/lorekeeper/` if any are hardcoded

### Part A: Move Wiki up one level

- [ ] **Step 1: Inspect what's currently under `frontend/src/lorekeeper/wiki/`.**

```bash
ls frontend/src/lorekeeper/wiki/
```
Expected: directories like `characters/`, `lore-traits/`, `mechanics/`, `locations/`, `factions/`, `lore/`, plus `index.md` and possibly `.11tydata.json` files.

- [ ] **Step 2: Move the wiki tree.**

```bash
git mv frontend/src/lorekeeper/wiki frontend/src/wiki
```

This moves the entire wiki subtree (including all category folders, entries, `.11tydata.json` files, and `index.md`) to be a sibling of `lorekeeper/` instead of a child.

- [ ] **Step 3: Check for any `permalink:` front matter inside the moved wiki content that hardcoded the old path.**

```bash
grep -rn "permalink:" frontend/src/wiki/
```

For each match, update the value:
- `/lorekeeper/wiki/...` → `/wiki/...` (drop the `/lorekeeper` prefix)

For example, if a category index page had `permalink: /wiki/characters/`, that already matches the new structure and needs no change. If it had `permalink: /lorekeeper/wiki/characters/`, change to `permalink: /wiki/characters/`.

- [ ] **Step 4: Build to verify wiki URLs serve correctly under the new path.**

```bash
cd frontend
rm -rf _site
npm run build
ls _site/wiki
ls _site/wiki/characters 2>/dev/null || echo "No characters dir yet — fine if wiki content is minimal"
cd ..
```
Expected: `_site/wiki/index.html` exists. Any populated category folders exist under `_site/wiki/`. `_site/library/wiki/` should NOT exist.

### Part B: Add Library permalink overrides

The internal source path `src/lorekeeper/*` (now containing only `index.md` + `books/`) needs to serve at `/library/*`. We use a JavaScript directory data file because the permalink remap requires conditional logic that a JSON string template can't express cleanly.

- [ ] **Step 5: Create a directory data cascade for the Library module.**

Create `frontend/src/lorekeeper/lorekeeper.11tydata.js`:
```js
module.exports = {
  permalink: (data) => {
    // page.filePathStem is something like:
    //   "/lorekeeper/index"
    //   "/lorekeeper/books/index"
    //   "/lorekeeper/books/book1/chapters/test-chapter"
    const stripped = data.page.filePathStem.replace(/^\/lorekeeper/, "");
    if (stripped === "/index" || stripped === "") {
      return "/library/index.html";
    }
    if (stripped.endsWith("/index")) {
      // "/books/index" → "/library/books/index.html"
      return "/library" + stripped.slice(0, -"/index".length) + "/index.html";
    }
    // Regular content file: serve as a directory-style URL
    // "/books/book1/chapters/test-chapter" → "/library/books/book1/chapters/test-chapter/index.html"
    return "/library" + stripped + "/index.html";
  },
};
```

Why `.js` not `.json`: Eleventy directory data files can be either format, but JSON can't hold functions, and the necessary permalink logic (handling `/index` suffixes, the empty-stem root case) isn't cleanly expressible as a Nunjucks string template.

- [ ] **Step 6: Override any existing per-file `permalink:` values inside `src/lorekeeper/`** that hardcode `/lorekeeper/*`.

```bash
grep -rn "permalink:" frontend/src/lorekeeper/
```

Expected matches (based on the current repo):
- `frontend/src/lorekeeper/books/book1/chapters/index.md` has `permalink: /lorekeeper/books/book1/chapters/`

For each match: delete the per-file `permalink` line (let the cascade handle it). The cascade produces the correct URL for each file based on its source path.

- [ ] **Step 7: Build and verify Library URLs.**

```bash
cd frontend
rm -rf _site
npm run build
ls _site/library
ls _site/library/books
cd ..
```
Expected: `_site/library/index.html`, `_site/library/books/index.html` exist. `_site/lorekeeper/` should not exist.

### Part C: Visually verify

- [ ] **Step 8: Serve and click around.**

```bash
cd frontend
npx @11ty/eleventy --serve --quiet
```

Open `http://localhost:8080/`. Verify:
- Homepage loads.
- Nav shows "Library" and "Wiki" as separate top-level items.
- Clicking "Library" goes to `/library/`.
- Clicking "Wiki" goes to `/wiki/`.

Stop the server with Ctrl+C, then:
```bash
cd ..
```

- [ ] **Step 9: Commit.**

```bash
git add frontend/src/
git commit -m "feat: move Wiki to top-level module; add Library permalink overrides"
```

---

## Task 8: Update `site.js` and the wiki link transform for new module URLs

**Files:**
- Modify: `frontend/src/_data/site.js`
- Modify: `frontend/.eleventy.js`

- [ ] **Step 1: Read `site.js`.**

```bash
cat frontend/src/_data/site.js
```

- [ ] **Step 2: Update `site.js` so it has both `lorekeeper` (Library module — internal name) and `wiki` (Wiki module) entries.**

The Library data key stays `site.modules.lorekeeper` per the Lorekeeper/Library convention; only its URL values change. Wiki gets a new top-level entry. **No trailing slashes** on values — templates add the slash themselves (existing convention documented at the top of `site.js`).

The current file looks like:
```js
module.exports = {
  modules: {
    lorekeeper: {
      root:  "/lorekeeper",
      wiki:  "/lorekeeper/wiki",
      books: "/lorekeeper/books",
    },
  },
};
```

Change to:
```js
module.exports = {
  modules: {
    lorekeeper: {
      root:  "/library",
      books: "/library/books",
    },
    wiki: {
      root: "/wiki",
    },
  },
};
```

Note: the previous `lorekeeper.wiki` URL entry is gone — Wiki is no longer a Library sub-path. Templates that referenced `site.modules.lorekeeper.wiki` switch to `site.modules.wiki.root`.

- [ ] **Step 3: Search the codebase for places that reference `site.modules.lorekeeper.wiki` and update them.**

```bash
grep -rn "modules\.lorekeeper\.wiki" frontend/src/ frontend/.eleventy.js 2>/dev/null
```

Expected matches:
- `frontend/src/lorekeeper/index.md` — Library landing references `site.modules.lorekeeper.wiki`
- `frontend/src/wiki/index.md` — Wiki landing references `site.modules.lorekeeper.wiki` (this file was at `src/lorekeeper/wiki/index.md` and got moved by Task 7)
- `frontend/.eleventy.js` — wiki link transform uses `site.modules.lorekeeper.wiki`

For each `.md` match: change `{{ site.modules.lorekeeper.wiki }}` to `{{ site.modules.wiki.root }}`. (The `.eleventy.js` edit is handled in Step 5 below.)

- [ ] **Step 4: Read `.eleventy.js`.**

```bash
cat frontend/.eleventy.js
```

Locate the `wikiLinks` transform — the function passed to `eleventyConfig.addTransform("wikiLinks", ...)`. It contains a template string that constructs anchor hrefs using `site.modules.lorekeeper.wiki`.

- [ ] **Step 5: Update the wiki link transform to emit `/wiki/<category>/<slug>/` via the new data key.**

The current line looks like:
```js
return `<a class="wiki-link" href="${site.modules.lorekeeper.wiki}/${category}/${slug}/">${display}</a>`;
```

Change to:
```js
return `<a class="wiki-link" href="${site.modules.wiki.root}/${category}/${slug}/">${display}</a>`;
```

This is a single-character difference in the data path (`.lorekeeper.wiki` → `.wiki.root`). The output URL is the same template; only the prefix-data source changes.

- [ ] **Step 6: Update the wiki collection globs in `.eleventy.js`.**

After Task 7 moved wiki content from `src/lorekeeper/wiki/` to `src/wiki/`, the `addCollection` glob patterns reference the old path. Update each one:

Find the current section in `.eleventy.js`:
```js
eleventyConfig.addCollection("characters", function(collectionApi) {
  return collectionApi.getFilteredByGlob("src/lorekeeper/wiki/characters/*.md");
});
// ...similar for loreTraits, mechanics, locations, factions, lore
```

Replace all `src/lorekeeper/wiki/` substrings with `src/wiki/` inside the collection definitions. There are 6 wiki collections (characters, loreTraits, mechanics, locations, factions, lore) to update. The `chapters` collection's path (`src/lorekeeper/books/book1/chapters/*.md`) does NOT change — chapters stay under the Lorekeeper module.

Verify by building:
```bash
cd frontend
rm -rf _site
npm run build
cd ..
```
Expected: no errors. If any collection becomes empty, the build won't fail outright but you'll get rendering issues.

- [ ] **Step 7: Build and grep output to confirm no legacy URLs remain in rendered HTML.**

```bash
cd frontend
rm -rf _site
npm run build
grep -r '"/lorekeeper/' _site/ | head
grep -r '"/library/wiki/' _site/ | head
cd ..
```
Expected: both greps empty (exit code 1). If matches appear, fix them — they're hardcoded URLs missed by the rename.

- [ ] **Step 8: Commit.**

```bash
git add frontend/src/_data/site.js frontend/.eleventy.js
git commit -m "feat: update site data, wiki link transform, and collection globs for new module URLs"
```

---

## Task 9: Add redirect stubs from `/lorekeeper/*` to `/library/*`

For any visitor with a bookmarked old URL, serve a redirect page.

**Files:**
- Create: `frontend/src/_includes/redirect.njk`
- Create: `frontend/src/redirects/redirects.11tydata.json` (Eleventy requires the data file's basename to match the directory name)
- Create: `frontend/src/redirects/lorekeeper-root.md`, `lorekeeper-books.md`, `lorekeeper-wiki.md`

- [ ] **Step 1: Create the redirect layout.**

Create `frontend/src/_includes/redirect.njk` with:
```njk
---
layout: false
---
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Redirecting…</title>
  <link rel="canonical" href="{{ redirectTo }}">
  <meta http-equiv="refresh" content="0; url={{ redirectTo }}">
  <meta name="robots" content="noindex">
</head>
<body>
  <p>This page has moved to <a href="{{ redirectTo }}">{{ redirectTo }}</a>.</p>
</body>
</html>
```

- [ ] **Step 2: Create the redirects directory and the directory data file.**

Create `frontend/src/redirects/redirects.11tydata.json` — the basename `redirects` matches the directory name `redirects/`, which is how Eleventy identifies the file as the directory data:
```json
{
  "layout": "redirect.njk"
}
```

Create `frontend/src/redirects/lorekeeper-root.md`:
```md
---
permalink: /lorekeeper/index.html
redirectTo: /library/
---
```

Create `frontend/src/redirects/lorekeeper-books.md`:
```md
---
permalink: /lorekeeper/books/index.html
redirectTo: /library/books/
---
```

Create `frontend/src/redirects/lorekeeper-wiki.md` (note: redirects to the new top-level `/wiki/`, not under `/library/`):
```md
---
permalink: /lorekeeper/wiki/index.html
redirectTo: /wiki/
---
```

(Add per-entry redirects in a future plan as wiki entries get populated; for now these three landing pages cover the most common bookmarks.)

- [ ] **Step 3: Build and verify redirects render.**

```bash
cd frontend
rm -rf _site
npm run build
cat _site/lorekeeper/index.html
cat _site/lorekeeper/books/index.html
cat _site/lorekeeper/wiki/index.html
cd ..
```
Expected: each shows the redirect HTML with a `<meta http-equiv="refresh" content="0; url=...">` pointing to the correct new URL — `/library/`, `/library/books/`, and `/wiki/` respectively.

- [ ] **Step 4: Commit.**

```bash
git add frontend/src/_includes/redirect.njk frontend/src/redirects/
git commit -m "feat: add redirect stubs from legacy /lorekeeper/* URLs"
```

---

## Task 10: Scaffold the `backend/` directory

**Files:**
- Create: `backend/package.json`
- Create: `backend/tsconfig.json`
- Create: `backend/.gitignore`

- [ ] **Step 1: Create the directory.**

```bash
mkdir -p backend/src/routes
```

- [ ] **Step 2: Create `backend/package.json`.**

```json
{
  "name": "loreuniverse-backend",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": {
    "node": ">=24"
  },
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "fastify": "^5.0.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 3: Create `backend/tsconfig.json`.**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": false,
    "sourceMap": true,
    "resolveJsonModule": true,
    "allowSyntheticDefaultImports": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 4: Create `backend/.gitignore`.**

```gitignore
dist/
node_modules/
.env
.env.*
*.log
coverage/
```

- [ ] **Step 5: Install dependencies.**

```bash
cd backend
npm install
cd ..
```
Expected: `backend/node_modules/` exists with no errors.

- [ ] **Step 6: Commit.**

```bash
git add backend/package.json backend/tsconfig.json backend/.gitignore backend/package-lock.json
git commit -m "chore: scaffold backend/ with TypeScript and Fastify dependencies"
```

---

## Task 11: Set up Vitest configuration

**Files:**
- Create: `backend/vitest.config.ts`

- [ ] **Step 1: Create `backend/vitest.config.ts`.**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    globals: false,
    reporters: ['default'],
  },
});
```

- [ ] **Step 2: Sanity check Vitest can run.**

```bash
cd backend
npx vitest run --reporter=verbose
cd ..
```
Expected: "No test files found" — fine for now. No errors loading the config.

- [ ] **Step 3: Commit.**

```bash
git add backend/vitest.config.ts
git commit -m "chore: configure vitest for backend"
```

---

## Task 12: Write the failing health endpoint test

**Files:**
- Create: `backend/src/routes/health.test.ts`

- [ ] **Step 1: Create `backend/src/routes/health.test.ts`.**

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerHealthRoute } from './health.js';

describe('GET /health', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify();
    await registerHealthRoute(app);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 200 with status ok', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.status).toBe('ok');
  });

  it('returns a modules object', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    const body = response.json();
    expect(body.modules).toBeTypeOf('object');
  });
});
```

- [ ] **Step 2: Run the test, verify it fails (file not yet created).**

```bash
cd backend
npm test
cd ..
```
Expected: FAIL with an import error — "Cannot find module './health.js'" or similar.

---

## Task 13: Implement the health endpoint

**Files:**
- Create: `backend/src/routes/health.ts`

- [ ] **Step 1: Create `backend/src/routes/health.ts`.**

```ts
import { type FastifyInstance } from 'fastify';

export async function registerHealthRoute(app: FastifyInstance): Promise<void> {
  app.get('/health', async () => {
    return {
      status: 'ok',
      modules: {},
    };
  });
}
```

- [ ] **Step 2: Run the test, verify it passes.**

```bash
cd backend
npm test
cd ..
```
Expected: both tests pass.

- [ ] **Step 3: Commit.**

```bash
git add backend/src/routes/health.ts backend/src/routes/health.test.ts
git commit -m "feat(backend): add GET /health endpoint with module reporting stub"
```

---

## Task 14: Create the Fastify server entry point

**Files:**
- Create: `backend/src/server.ts`

- [ ] **Step 1: Create `backend/src/server.ts`.**

```ts
import Fastify from 'fastify';
import { registerHealthRoute } from './routes/health.js';

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? '0.0.0.0';

async function buildServer() {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
    },
  });

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
```

- [ ] **Step 2: Run in dev mode and verify locally.**

```bash
cd backend
npm run dev
```

In a separate terminal:
```bash
curl http://localhost:3000/health
```
Expected output: `{"status":"ok","modules":{}}`.

Stop the dev server with Ctrl+C.

```bash
cd ..
```

- [ ] **Step 3: Build the production bundle to verify TypeScript compiles cleanly.**

```bash
cd backend
npm run build
ls dist
cd ..
```
Expected: `backend/dist/server.js`, `backend/dist/routes/health.js`, etc.

- [ ] **Step 4: Commit.**

```bash
git add backend/src/server.ts
git commit -m "feat(backend): add Fastify server entry point"
```

---

## Task 15: Add the Dockerfile

**Files:**
- Create: `backend/Dockerfile`
- Create: `backend/.dockerignore`

- [ ] **Step 1: Create `backend/Dockerfile`.**

```dockerfile
# syntax=docker/dockerfile:1
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=optional

FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY --from=deps /app/node_modules ./node_modules
COPY tsconfig.json ./
COPY src ./src
RUN npx tsc

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --omit=optional && npm cache clean --force
COPY --from=build /app/dist ./dist
EXPOSE 3000
CMD ["node", "dist/server.js"]
```

- [ ] **Step 2: Create `backend/.dockerignore`.**

```
node_modules
dist
.env
.env.*
*.log
coverage
.git
```

- [ ] **Step 3: Build the image locally to verify.**

```bash
cd backend
docker build -t loreuniverse-backend:dev .
cd ..
```
Expected: image builds successfully. No errors.

- [ ] **Step 4: Run the image locally and verify the health endpoint.**

```bash
docker run --rm -p 3000:3000 loreuniverse-backend:dev &
sleep 3
curl http://localhost:3000/health
docker stop $(docker ps -q --filter ancestor=loreuniverse-backend:dev) 2>/dev/null || true
```
Expected: `{"status":"ok","modules":{}}` printed.

- [ ] **Step 5: Commit.**

```bash
git add backend/Dockerfile backend/.dockerignore
git commit -m "chore(backend): add multi-stage Dockerfile"
```

---

## Task 16: Create the Fly app

**Files:**
- Create: `backend/fly.toml`

- [ ] **Step 1: Run `flyctl launch` interactively from the backend directory.**

```bash
cd backend
flyctl launch --no-deploy --copy-config --name loreuniverse-api --region iad
cd ..
```

When prompted:
- App name: `loreuniverse-api`
- Region: `iad` (or your preferred region)
- Postgres: **No** (we'll use Neon, set up in Plan B)
- Redis: **No**
- Deploy now: **No**

This creates `backend/fly.toml` with sensible defaults.

- [ ] **Step 2: Replace the generated `backend/fly.toml`** with the exact contents needed for our setup:

```toml
app = "loreuniverse-api"
primary_region = "iad"

[build]
  dockerfile = "Dockerfile"

[env]
  PORT = "3000"
  HOST = "0.0.0.0"
  LOG_LEVEL = "info"

[http_service]
  internal_port = 3000
  force_https = true

  # Scale-to-zero configuration.
  # - auto_stop_machines: stop the machine after the idle window passes (Fly's
  #   default idle threshold is ~5 minutes of no inbound traffic).
  # - auto_start_machines: wake the machine on the next request.
  # - min_machines_running = 0: no machine kept warm. Cost is rootfs storage
  #   only (~$0.15/mo). First request after idle pays a ~2-4s cold start.
  #
  # When ready for public launch (or when cold starts annoy more than $2/mo
  # costs), flip min_machines_running to 1 for an always-warm instance.
  auto_stop_machines = "stop"
  auto_start_machines = true
  min_machines_running = 0

  [http_service.checks]
    grace_period = "10s"
    interval = "30s"
    method = "GET"
    timeout = "5s"
    path = "/health"

[[vm]]
  size = "shared-cpu-1x"
  memory = "256mb"
  cpus = 1
```

**Note on Fly's health-check behavior with scale-to-zero.** The HTTP health check above runs every 30s when the machine is running. While the machine is stopped, Fly doesn't poll the health check — that's exactly what enables zero-cost idle. The first real request wakes the machine; Fly waits for the health check to pass before routing the request. The 10s grace period gives Node + Fastify + DB pool time to warm up before the check fires.

- [ ] **Step 3: Commit the Fly config.**

```bash
git add backend/fly.toml
git commit -m "chore(backend): add fly.toml for Fly.io deployment"
```

---

## Task 17: Deploy backend to Fly manually and verify

**Files:** none modified — operational task.

- [ ] **Step 1: Deploy.**

```bash
cd backend
flyctl deploy --remote-only
cd ..
```
Expected output: build progress, image push, single machine started. End with "1 desired, 1 placed, 1 healthy, 0 unhealthy."

- [ ] **Step 2: Check the deployed health endpoint.**

```bash
curl https://loreuniverse-api.fly.dev/health
```
Expected: `{"status":"ok","modules":{}}`.

- [ ] **Step 3: Check logs.**

```bash
cd backend
flyctl logs
```
Watch for healthy startup messages. Stop streaming with Ctrl+C.

```bash
cd ..
```

---

## Task 18: Add the GitHub Actions backend deploy workflow

**Files:**
- Create: `.github/workflows/deploy-backend.yml`

- [ ] **Step 1: Create the workflow file.**

```yaml
name: Deploy backend

on:
  push:
    branches: [main]
    paths:
      - 'backend/**'
      - 'shared/**'
      - '.github/workflows/deploy-backend.yml'
  workflow_dispatch:

concurrency:
  group: deploy-backend
  cancel-in-progress: false

jobs:
  test:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: backend
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '24'
          cache: 'npm'
          cache-dependency-path: backend/package-lock.json
      - run: npm ci
      - run: npm run typecheck
      - run: npm test

  deploy:
    needs: test
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: backend
    steps:
      - uses: actions/checkout@v4
      - uses: superfly/flyctl-actions/setup-flyctl@master
      - run: flyctl deploy --remote-only
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}
```

- [ ] **Step 2: Generate a Fly deploy token and add it as a GitHub secret.**

```bash
flyctl tokens create deploy -x 999999h --app loreuniverse-api
```
Copy the printed token.

On GitHub: navigate to your repo → Settings → Secrets and variables → Actions → New repository secret.
- Name: `FLY_API_TOKEN`
- Value: the token from above.

- [ ] **Step 3: Commit and push the workflow.**

```bash
git add .github/workflows/deploy-backend.yml
git commit -m "ci: add backend deploy workflow"
```

- [ ] **Step 4: Push the branch and verify the workflow runs on push to main.**

For now, the branch is `foundation-a-monorepo-restructure`. Once everything is verified, we'll merge to main, which will trigger the workflow. We verify the workflow trigger logic now by manually dispatching it.

```bash
git push -u origin foundation-a-monorepo-restructure
```

On GitHub: Actions → "Deploy backend" → Run workflow → select the branch → Run.

Expected: workflow completes successfully, deploying the same image already on Fly.

---

## Task 19: Create the `shared/` directory placeholder

**Files:**
- Create: `shared/package.json`
- Create: `shared/tsconfig.json`
- Create: `shared/src/index.ts`

- [ ] **Step 1: Create the directory and files.**

```bash
mkdir -p shared/src
```

- [ ] **Step 2: Create `shared/package.json`.**

```json
{
  "name": "@loreuniverse/shared",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.6.0"
  }
}
```

- [ ] **Step 3: Create `shared/tsconfig.json`.**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "noEmit": true
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 4: Create `shared/src/index.ts` with a placeholder.**

```ts
// Shared types used by both backend and (eventually) frontend.
// Real types added as features land in later plans.

export type ApiErrorEnvelope = {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
};
```

- [ ] **Step 5: Wire `shared/` as a workspace dependency in `backend/package.json`.**

Edit `backend/package.json`. Add at the top level (after `"engines"`):

```json
  "dependencies": {
    "fastify": "^5.0.0",
    "@loreuniverse/shared": "file:../shared"
  },
```

(Replace the existing `dependencies` block.)

- [ ] **Step 6: Reinstall backend dependencies to pick up the link.**

```bash
cd backend
npm install
cd ..
```

- [ ] **Step 7: Verify the import works from backend.**

Add a temporary import at the top of `backend/src/server.ts`:

```ts
import type { ApiErrorEnvelope } from '@loreuniverse/shared';
```

Then:
```bash
cd backend
npm run typecheck
cd ..
```
Expected: no errors. Remove the temporary import if you don't want it lingering, or leave it (it's a type-only import — costs nothing at runtime).

- [ ] **Step 8: Commit.**

```bash
git add shared/ backend/package.json backend/package-lock.json backend/src/server.ts
git commit -m "chore: add shared/ workspace for cross-package types"
```

---

## Task 20: Update root `README.md` for the monorepo

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Replace `README.md` contents.**

```markdown
# Lore Universe

Monorepo for the Lore Universe website — a personal creative-writing platform hosting serialized novels and a companion wiki.

**Live site:** https://loreuniverse.github.io/
**API:** https://loreuniverse-api.fly.dev/

## Layout

- `frontend/` — Eleventy static site. Renders novels, wiki, and other modules.
- `backend/` — Fastify TypeScript API. Handles auth, dynamic data, admin endpoints.
- `shared/` — TypeScript types shared between backend and (eventually) frontend.
- `scripts/` — Authoring tooling (Obsidian migration, future scripts).
- `docs/` — Architecture specs and implementation plans.

## Local development

Prerequisites: Node 24+, Docker.

```bash
# Static site
cd frontend
npm install
npm start                # Eleventy dev server on :8080

# Backend (separate terminal)
cd backend
npm install
npm run dev              # Fastify on :3000
```

## Architecture

See `docs/superpowers/specs/2026-05-22-foundational-backend-architecture-design.md` for the full architecture.
```

- [ ] **Step 2: Commit.**

```bash
git add README.md
git commit -m "docs: update root README for monorepo layout"
```

---

## Task 21: Update `PROJECT_BRIEFING.md` for new structure

**Files:**
- Modify: `PROJECT_BRIEFING.md`

- [ ] **Step 1: Read current contents.**

```bash
cat PROJECT_BRIEFING.md
```

- [ ] **Step 2: Update sections of `PROJECT_BRIEFING.md`.**

Make the following targeted edits, preserving the document's overall structure:

- **Section 3 (Folder Structure):** Replace the current tree with the monorepo layout from this plan's "File Structure After This Plan" section.

- **Section 5 (Established Conventions):** Add a new subsection at the end:

```markdown
### Lorekeeper / Library Naming Convention
The first module of the website is named **Library** externally (URLs, navigation labels, page titles, body text) but retains the identifier `lorekeeper` internally (file paths like `frontend/src/lorekeeper/`, data keys like `site.modules.lorekeeper`, code variables). When adding new features, use `library` for any user-facing text and `lorekeeper` for any code identifier or path.
```

- **Section 6 (Current State):** Add the following rows to the status table:

```markdown
| Monorepo restructure | ✅ Done (Foundation Plan A) |
| Library URL rename (`/lorekeeper/` → `/library/`) | ✅ Done (Foundation Plan A) |
| Wiki promoted to top-level module (`/wiki/*`) | ✅ Done (Foundation Plan A) |
| Backend skeleton (Fastify + TypeScript + Docker) | ✅ Done (Foundation Plan A) |
| Backend deployed to Fly | ✅ Done (Foundation Plan A) |
| Backend deploy workflow | ✅ Done (Foundation Plan A) |
```

- **Section 9 (Working Directory):** Update to:

```markdown
- All work for this project is done in the repo root containing `frontend/`, `backend/`, `shared/`, `scripts/`, `docs/`.
```

- **Section 10 (Future Scope):** Update the "Architectural direction" section noting that the monorepo + backend foundation is now in place. Add a new "Sub-project roadmap" section pointing at the four foundation plans:

```markdown
### Sub-project roadmap
Foundational backend implementation is split across four plans, executed sequentially:
- Plan A (this PR): monorepo restructure, library rename, backend skeleton
- Plan B: database, auth (Better Auth + Resend), email-verified signup/login
- Plan C: roles, permissions, API tokens, audit log
- Plan D: static-site/backend integration, Claude autolink endpoint

After Plan D, feature work begins. See `docs/superpowers/specs/2026-05-22-foundational-backend-architecture-design.md` for the foundation spec, and `docs/superpowers/plans/` for the plan documents.
```

- [ ] **Step 3: Commit.**

```bash
git add PROJECT_BRIEFING.md
git commit -m "docs: update PROJECT_BRIEFING for monorepo and foundation plan progress"
```

---

## Task 22: Final end-to-end verification

**Files:** none modified — verification only.

- [ ] **Step 1: Run both site and backend locally.**

Terminal 1:
```bash
cd frontend
npm start
```

Terminal 2:
```bash
cd backend
npm run dev
```

Terminal 3:
```bash
curl http://localhost:3000/health
```
Expected: `{"status":"ok","modules":{}}`.

Open `http://localhost:8080/` in browser. Verify:
- Homepage loads.
- Nav shows "Library" and "Wiki" as separate top-level items (not "Novels", and Wiki is not under Library).
- Clicking "Library" goes to `/library/`.
- Clicking "Wiki" goes to `/wiki/`.
- Old URL `/lorekeeper/` redirects to `/library/` (open it directly in browser).
- Old URL `/lorekeeper/wiki/` redirects to `/wiki/`.
- Old URL `/lorekeeper/books/` redirects to `/library/books/`.

Stop both servers.

- [ ] **Step 2: Run the test suite.**

```bash
cd backend
npm test
cd ..
```
Expected: all tests pass.

- [ ] **Step 3: Run typecheck on both backend and shared.**

```bash
cd backend && npm run typecheck && cd ..
cd shared && npm run typecheck && cd ..
```
Expected: no errors in either.

- [ ] **Step 4: Confirm Fly deployment still healthy.**

```bash
curl https://loreuniverse-api.fly.dev/health
```
Expected: `{"status":"ok","modules":{}}`.

- [ ] **Step 5: Open a PR from `foundation-a-monorepo-restructure` to `main`.**

```bash
gh pr create --title "Foundation A: monorepo restructure + backend skeleton" \
  --body "Implements Plan A. See docs/superpowers/plans/2026-05-22-foundation-a-monorepo-restructure-and-backend-skeleton.md."
```

Review the PR diff. Ensure:
- All static-site files are now under `frontend/`.
- `backend/` is new and includes Fastify scaffolding + Docker + Fly config.
- `shared/` exists with placeholder type.
- Workflows updated.
- README and PROJECT_BRIEFING reflect new structure.

- [ ] **Step 6: Merge the PR.**

After review, merge. Verify both `deploy-site.yml` and `deploy-backend.yml` workflows trigger (or only deploy-backend depending on which paths changed). Both should complete successfully.

- [ ] **Step 7: Verify production.**

```bash
curl https://loreuniverse-api.fly.dev/health
curl -s -o /dev/null -w "%{http_code}\n" https://loreuniverse.github.io/library/
curl -s -o /dev/null -w "%{http_code}\n" https://loreuniverse.github.io/wiki/
curl -s -o /dev/null -w "%{http_code}\n" https://loreuniverse.github.io/lorekeeper/
curl -s -o /dev/null -w "%{http_code}\n" https://loreuniverse.github.io/lorekeeper/wiki/
```
Expected:
- Health endpoint returns JSON.
- `/library/` and `/wiki/` both return 200.
- Old `/lorekeeper/` and `/lorekeeper/wiki/` URLs return 200 (the redirect stubs); fetching either returns HTML with a meta-refresh pointing to the new URL.

---

## Task 23 (optional): Rename the local repo checkout folder

The local folder you cloned into is probably still named `lorekeeper/`. The git repo is `loreuniverse.github.io`, and conceptually it now contains the whole Lore Universe project. This task is a one-time local rename for clarity — it doesn't affect any code, commits, or remote state.

**Files:** none — local filesystem only.

- [ ] **Step 1: Close any open editors / terminals pointed at the current folder.**

The folder rename will be rejected if any process has the directory or a file inside it open.

- [ ] **Step 2: From the parent directory, rename the folder.**

On Windows (PowerShell):
```powershell
cd C:\Users\timmy\Desktop\LoreUniverse
Rename-Item -Path lorekeeper -NewName loreuniverse
```

On macOS / Linux:
```bash
cd ~/path/to/LoreUniverse
mv lorekeeper loreuniverse
```

- [ ] **Step 3: Reopen the project in your editor from the new path.**

For VS Code:
```
code C:\Users\timmy\Desktop\LoreUniverse\loreuniverse
```

- [ ] **Step 4: Sanity check git still works.**

```bash
git status
git log --oneline -3
```
Expected: clean status (or your in-progress work), recent commits visible. The git remote is unchanged.

---

## Definition of Done

- [ ] Repo restructured: static site under `frontend/`, new `backend/` and `shared/` siblings.
- [ ] Library module URLs renamed `/lorekeeper/*` → `/library/*` with old URLs redirecting.
- [ ] Wiki promoted to top-level module: source at `frontend/src/wiki/`, URLs at `/wiki/*`, redirects from old `/lorekeeper/wiki/*`.
- [ ] Internal code identifiers (`src/lorekeeper/`, `site.modules.lorekeeper`) unchanged for Library.
- [ ] Backend skeleton runs locally (`npm run dev`) and answers `GET /health`.
- [ ] Backend deploys via Docker to Fly at `loreuniverse-api.fly.dev`.
- [ ] `deploy-site.yml` and `deploy-backend.yml` workflows both pass on push to main.
- [ ] Vitest configured; `health.test.ts` passes.
- [ ] `shared/` workspace integrated and importable from `backend/`.
- [ ] README and PROJECT_BRIEFING reflect the new structure.
- [ ] (Optional) Local repo checkout folder renamed to `loreuniverse/`.

After Plan A is merged, proceed to Plan B (database, auth, email).
