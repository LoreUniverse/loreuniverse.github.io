# Visual Design Overhaul — Design Spec

**Date:** 2026-05-24
**Status:** Draft — awaiting aesthetic decisions from owner

---

## 1. Current State

The site is not completely unstyled. It has one large monolithic stylesheet, `frontend/src/assets/css/reader.css`, that was built alongside the chapter reading experience. It covers:

- CSS custom property tokens (palette, typography, layout)
- Light/dark theme via `[data-theme]` data attribute on `<html>`
- Font-size scale via `[data-font-size]` data attribute
- Base reset and body styles
- Navigation (`header`, `.nav__*`)
- Main and footer
- Chapter layout (`.chapter`, `.chapter__*`, `.chapter__body`)
- Reader controls floating pill (`.reader-controls`, `.reader-controls__*`)
- Wiki link show/hide behavior
- Auth page (`.auth-page`, `.form-card`, `.form-group`, `.btn-primary`, `.tab-strip`)
- Profile page (`.profile-page`, `.profile-card`, `.profile-field`)
- Badges (`.badge--*`)

The inline `<script>` block in `base.njk` handles nav dropdown behavior. It belongs in a dedicated `nav.js` file. The anti-FOUC `<script>` in `<head>` must stay inline — it must execute synchronously before first paint.

`base.njk` currently links only `reader.css`. There is no `<style>` block in `base.njk` — all CSS is already externalized. The nav JS, however, is still inline at the bottom of `<body>`.

**Gaps — what reader.css does not cover:**

- Wiki entry pages (`.wiki-entry`, `.wiki-entry__header`, `.wiki-entry__meta`, `.wiki-entry__field`, `.wiki-entry__label`, `.wiki-entry__value`, `.wiki-entry__list`, `.wiki-entry__body`) — these classes exist in templates but have no rules in reader.css
- Wiki category index pages (the `wiki/index.md` list structure)
- Homepage (`index.md`) — module tiles, CTAs
- Module landing pages (`lorekeeper/index.md`, `wiki/index.md`) — section headings, module cards, latest-chapter article block
- About page — not yet written but will need prose layout
- Print stylesheet for chapter pages

---

## 2. Design Principles

These apply regardless of aesthetic choices:

1. **Token-first.** All color, typography, and spacing values live in `tokens.css` as CSS custom properties. No hardcoded values outside that file (except in `reader.css` which predates this split — see migration note in §3).
2. **No preprocessor.** Plain CSS only. Eleventy passthrough copy handles delivery.
3. **Data-attribute theming.** Dark mode is `[data-theme="dark"]` on `<html>`. Font size scale is `[data-font-size]` on `<html>`. Both are already established by the anti-FOUC inline script.
4. **BEM-ish naming.** Block, element (`__`), modifier (`--`). Follow the existing conventions in `reader.css` and the templates.
5. **Mobile-first.** Base styles target small screens; breakpoints add layout for larger viewports.
6. **No JavaScript in CSS files.** Behavior is in JS. CSS handles appearance and layout, including transition/animation effects that JS triggers via class or attribute changes.

---

## 3. CSS File Organization

### Target structure

```
frontend/src/assets/css/
  tokens.css       — all custom properties; imported first
  base.css         — reset, body, global element defaults (a, img, h1-h3, p)
  nav.css          — header, navbar, dropdowns, account button
  layout.css       — main content wrapper, footer, page-level containers
  wiki.css         — wiki entry pages, wiki category index pages
  chapter.css      — chapter reading experience, reader controls
  auth.css         — auth page, profile page, forms, buttons, badges
  home.css         — homepage, module landing pages
  print.css        — print media query for chapter pages (bonus)
```

### Load order in `base.njk`

All files must be linked in this order so that custom properties defined in `tokens.css` are available when subsequent files reference them:

```html
<link rel="stylesheet" href="/assets/css/tokens.css">
<link rel="stylesheet" href="/assets/css/base.css">
<link rel="stylesheet" href="/assets/css/nav.css">
<link rel="stylesheet" href="/assets/css/layout.css">
<link rel="stylesheet" href="/assets/css/wiki.css">
<link rel="stylesheet" href="/assets/css/chapter.css">
<link rel="stylesheet" href="/assets/css/auth.css">
<link rel="stylesheet" href="/assets/css/home.css">
```

`print.css` is linked with `media="print"` on chapter pages only, or with a `@media print` block inside `chapter.css`.

The existing `<link rel="stylesheet" href="/assets/css/reader.css">` is **replaced** by these links once migration is complete. `reader.css` is retired.

### What each file handles

| File | Responsibility |
|---|---|
| `tokens.css` | Every `--token` custom property. Light-theme defaults on `:root`. Dark-theme overrides on `[data-theme="dark"]`. Font-size scale on `[data-font-size]`. |
| `base.css` | Box-sizing reset, `html`/`body`, `a`, `img`, headings (`h1`–`h3`), `p`, `hr`, `ul`/`ol`. Font-size transition. Theme color transitions on `body`. |
| `nav.css` | `body > header`, `.nav__list`, `.nav__item`, `.nav__link`, `.nav__toggle`, `.nav__submenu`, `.nav__sublink`, `.nav__item--account`, `.nav__account-btn`, `.nav__subitem--divider`, `.nav__sublink--btn`. |
| `layout.css` | `body > main`, `body > footer`. Page-level containers used by landing/prose pages. |
| `wiki.css` | `.wiki-entry`, `.wiki-entry--*` modifiers, `.wiki-entry__header`, `.wiki-entry__category`, `.wiki-entry__meta`, `.wiki-entry__field`, `.wiki-entry__label`, `.wiki-entry__value`, `.wiki-entry__list`, `.wiki-entry__body`. Also wiki index page link-list structure. |
| `chapter.css` | `.chapter`, `.chapter__*`, `.chapter__body` prose rules, `.wiki-link`, `.wiki-link--hidden`, `[data-wiki-links="hidden"]` toggle, `.reader-controls`, `.reader-controls__*`. |
| `auth.css` | `.auth-page`, `.profile-page`, `.tab-strip`, `.tab-btn`, `.tab-panel`, `.form-card`, `.form-group`, `.form-error`, `.form-success`, `.btn-primary`, `.btn-secondary`, `.profile-card`, `.profile-field`, `.profile-label`, `.profile-value`, `.badge`, `.badge--*`. |
| `home.css` | Homepage and module landing page content: section headings, CTA links, module tile/card structure, latest-chapter article block, about prose. |

### Migration note on reader.css

`reader.css` is the source of truth for the existing token values and structural rules. The migration process (defined in the implementation plan) moves those rules into the new files rather than rewriting them. Actual aesthetic values (colors, fonts) stay exactly as they are unless the owner explicitly changes them during or after migration.

---

## 4. Token System

All custom properties are defined in `tokens.css`. The owner fills in the values. The names and their roles are fixed by this spec.

### 4.1 Color tokens

| Token | Role |
|---|---|
| `--clr-bg` | Page background |
| `--clr-surface` | Elevated surface (cards, dropdowns, form fields background) |
| `--clr-text` | Primary body text |
| `--clr-text-muted` | Secondary/metadata text |
| `--clr-border` | Dividers, input borders, HR lines |
| `--clr-accent` | Interactive elements: links, active states, focus rings |
| `--clr-accent-hover` | Hover state for accent-colored elements |
| `--clr-nav-bg` | Navigation header background (may match `--clr-surface` or differ) |
| `--clr-nav-border` | Navigation header bottom border |
| `--clr-ctrl-bg` | Reader controls pill background |
| `--clr-ctrl-border` | Reader controls pill border |
| `--clr-ctrl-text` | Reader controls button text |
| `--clr-ctrl-active-bg` | Reader controls active/pressed button background |
| `--clr-ctrl-active-fg` | Reader controls active/pressed button text |
| `--clr-error` | Form error messages |
| `--clr-badge-admin-bg` | Admin badge background |
| `--clr-badge-admin-fg` | Admin badge text |

Dark theme: all tokens above are re-declared under `[data-theme="dark"]` with their dark-mode values.

### 4.2 Typography tokens

| Token | Role |
|---|---|
| `--font-body` | Serif/reading font for chapter prose, headings |
| `--font-ui` | Sans-serif font for UI elements, labels, nav, metadata |
| `--font-size-base` | Base font size — overridden by `[data-font-size]` scale |
| `--line-height-body` | Line height for body prose |

Font-size scale (declared on `[data-font-size]` attributes):

| Selector | Token | Description |
|---|---|---|
| `[data-font-size="sm"]` | `--font-size-base` | Small reading size |
| `[data-font-size="md"]` | `--font-size-base` | Default reading size |
| `[data-font-size="lg"]` | `--font-size-base` | Large reading size |

The owner chooses the three pixel values. The mechanism (data attribute on `<html>`) is already established.

### 4.3 Layout tokens

| Token | Role |
|---|---|
| `--reading-max-width` | Maximum column width for chapter prose and constrained content |
| `--page-padding` | Horizontal padding on the page — `clamp()` value for fluid behavior |
| `--wiki-sidebar-width` | Reserved for a future wiki sidebar; not implemented in Phase 1 |

---

## 5. Responsive Breakpoints Strategy

Three breakpoints, mobile-first:

| Name | Min-width | Intent |
|---|---|---|
| Mobile (base) | — | Single column, full width, no fixed elements |
| Tablet | `481px` | Slightly wider reading column, reader pill stays fixed |
| Desktop | `901px` | Full nav visible, wider content area, potential sidebar |

**Breakpoint usage rules:**

- Write base styles for mobile first; use `min-width` media queries to add layout for larger screens.
- The `--reading-max-width` and `--page-padding` tokens absorb most layout adaptation via `clamp()` — explicit media queries are for structural changes only (e.g., nav collapsing, pill repositioning).
- The existing `reader.css` uses `max-width: 480px` and a range query for tablet. The new files standardize to `max-width: 480px` (mobile-only overrides) and `min-width: 481px` / `min-width: 901px`.
- **No hamburger menu in Phase 1.** The nav wraps naturally on narrow screens. A mobile hamburger can be added as a separate task later.

---

## 6. Typography System

The typography system defines structure; the owner fills in actual font choices.

### Heading hierarchy

| Element | Font family | Size range | Weight | Use |
|---|---|---|---|---|
| `h1` | `--font-body` | `clamp(1.5rem, 3.5vw, 2.2rem)` | Bold | Page title, entry name |
| `h2` | `--font-body` | `clamp(1.1rem, 2.5vw, 1.45rem)` | Bold | Section heading |
| `h3` | `--font-ui` | `1rem` | 700 | Sub-section, module heading |
| Chapter title | `--font-body` | `clamp(1.6rem, 4vw, 2.4rem)` | Bold | Chapter `h1` — slightly larger than global `h1` |

### Body text

- **Chapter prose:** `--font-body`, `1rem`, `--line-height-body` (generous leading for reading). First paragraph and post-HR paragraphs have no indent; all others have `text-indent: 1.5em`.
- **UI text (nav, labels, metadata):** `--font-ui`, `0.875rem` typical.
- **Form labels:** `--font-ui`, `0.75rem`, uppercase, tracked.

### Prose in wiki entries

Wiki entry body (`.wiki-entry__body`) renders user-authored Markdown. Style `h2`/`h3`, `p`, `ul`, `ol`, `blockquote` within this scope. Do not override global heading styles — scope rules to `.wiki-entry__body h2` etc.

---

## 7. Page and Template Coverage

### 7.1 `base.njk` — Global shell

**Elements:** `<html>`, `<body>`, `<header>`, `<nav>`, `<main>`, `<footer>`

**Styling decisions:**
- `body > header` is sticky, `z-index: 100`. Background and border use nav tokens.
- `body > main` has vertical and horizontal padding via `--page-padding`.
- `body > footer` is centered, muted text, top border.
- Theme and font-size data attributes on `<html>` drive all token overrides.
- The anti-FOUC script in `<head>` stays inline. The nav dropdown script moves to `assets/js/nav.js`.

**CSS files used:** `tokens.css`, `base.css`, `nav.css`, `layout.css`

### 7.2 `chapter.njk` — Chapter reading experience

**Elements:** `.reader-controls`, `.chapter`, `.chapter__header`, `.chapter__arc`, `.chapter__number`, `.chapter__title`, `.chapter__date`, `.chapter__summary`, `.chapter__body`, `.chapter__pagination`, `.wiki-link`, `.wiki-link--hidden`

**Styling decisions:**
- Content column is constrained to `--reading-max-width` and centered.
- Prose paragraphs use first-line indent pattern (no indent on first paragraph or after `<hr>`).
- Reader controls pill is `position: fixed`, bottom-right, slides off-screen when scrolling down (driven by `reader-controls--hidden` class toggled by `reader.js`).
- Wiki link visibility toggled by `[data-wiki-links="hidden"]` on `<html>`, scoped to `.chapter__body` to avoid affecting non-chapter wiki links.
- Chapter header has a bottom border separating metadata from prose.
- Chapter pagination (`nav.chapter__pagination`) is a flex row, space-between, for prev/next links (empty now, reserved).

**CSS file:** `chapter.css`

### 7.3 Wiki entry templates — character, faction, location, lore-trait, mechanic, lore

All six templates share the `.wiki-entry` block with a `--{category}` modifier. Structure is identical across all six:

```
.wiki-entry
  .wiki-entry__header
    h1                    ← entry name
    .wiki-entry__category ← "Character", "Faction", etc.
  .wiki-entry__meta
    .wiki-entry__field (repeated)
      .wiki-entry__label
      .wiki-entry__value  or  .wiki-entry__list > li
  .wiki-entry__body       ← rendered Markdown
```

**Styling decisions:**
- `.wiki-entry` constrains width like the chapter column (same `--reading-max-width` or a slightly wider value — owner's call; leave as a token).
- `.wiki-entry__header` has a bottom border; category label is muted, small, uppercase.
- `.wiki-entry__meta` renders as a definition-list-style layout: label on the left, value on the right (or stacked on mobile). Use flexbox on `.wiki-entry__field`.
- `.wiki-entry__label` is muted, small, uppercase — same style as form labels.
- `.wiki-entry__list` removes default list indent; items separated by commas or line breaks — owner decides.
- `.wiki-entry__body` styles prose Markdown content: scoped `h2`, `h3`, `p`, `ul`, `ol`, `blockquote`.
- The `--{category}` modifier classes (`.wiki-entry--character`, etc.) are defined but initially empty — reserved for per-category accent color or icon differentiation if the owner wants it later.

**CSS file:** `wiki.css`

### 7.4 `wiki/index.md` — Wiki category index

Plain Markdown rendered via `base.njk`. Structure is `h2` section headings + a paragraph + a CTA link per category.

**Styling decisions:**
- This page gets a constrained column width matching the wiki entry column.
- Section `h2` headings have a bottom border or some visual separator.
- CTA links ("Browse Characters", etc.) can be plain links or receive a distinct style — owner decides; the plan creates a `.wiki-index` wrapper class for scoping.

**CSS file:** `wiki.css`

### 7.5 `account/index.njk` — Auth page

**Elements:** `.auth-page`, `.tab-strip`, `.tab-btn`, `.tab-panel`, `.form-card`, `.form-group`, label, input, `.form-error`, `.btn-primary`, `.form-success`

**Styling decisions:**
- `.auth-page` is a centered, narrow column (`max-width: 28rem`), with top margin.
- Tab strip uses an underline-active pattern. Active tab has accent-colored bottom border.
- Form card has a surface-colored background, border, rounded corners, padding.
- Input focus state uses accent border color; no custom outline (replaces browser default).
- Error messages are styled in an error color token; success message is body color, centered.
- `.btn-primary` is full-width, filled with accent color.

**CSS file:** `auth.css`

### 7.6 `account/profile/index.njk` — Profile page

**Elements:** `.profile-page`, `.profile-card`, `.profile-field`, `.profile-label`, `.profile-value`, `.btn-secondary`, `.badge`, `.badge--admin`, `.badge--user`, `.badge--free`

**Styling decisions:**
- `.profile-page` is a centered, slightly wider column than auth (`max-width: 32rem`).
- `.profile-card` matches form-card style.
- `.profile-field` is a flex row, label left, value right, separated by a bottom border. Last field has no border.
- Badges are pill-shaped, small, uppercase. Admin badge uses accent tint. User/free badges are neutral.
- `.btn-secondary` is an outline button.

**CSS file:** `auth.css`

### 7.7 `index.md` — Homepage

Content is rendered Markdown with Nunjucks expressions. Current structure: `h1`, intro paragraph, `---` dividers, `h2` "Explore" section, three `h3` subsections each with a CTA link.

**Styling decisions:**
- Homepage content sits in the main column. No special page-specific wrapper exists yet — add a `.home-page` class via a layout template or front-matter body class if needed, or scope by page URL using JS body class injection (owner's call; plan uses a `.home-page` wrapper via a new `home.njk` layout).
- The three "Explore" cards (`h3` + paragraph + link) could be a grid of tiles on wider screens.
- CTA links (`→` suffix links) may receive a distinct "call to action" style.
- Visual rhythm: generous vertical spacing between sections.

**CSS file:** `home.css`

### 7.8 `lorekeeper/index.md` — Novels landing page

Similar structure to homepage. Has a dynamic "Latest chapter" `<article>` block.

**Elements (from template):** `h1`, `h2` section headings, CTA links, `<article>` (latest chapter block with `<p>`, `<strong>`, `<a>`)

**Styling decisions:**
- Latest chapter block is a visually distinct card or bordered article.
- Section headings and CTA links match homepage treatment.

**CSS file:** `home.css`

### 7.9 `wiki/index.md` — already covered in §7.4

### 7.10 `about/index.md` — About page

Not yet written, but will be prose. No special styling needed beyond the global prose defaults in `base.css` and `layout.css`.

---

## 8. What Reader.css Becomes

`reader.css` is a temporary monolith. Migration moves its rules into the new files:

| reader.css section | Destination |
|---|---|
| Custom properties (`:root`, `[data-theme]`, `[data-font-size]`) | `tokens.css` |
| Reset, `html`, `body`, `a`, `img` | `base.css` |
| `h1`, `h2`, `h3` | `base.css` |
| `body > header`, `.nav__*` | `nav.css` |
| `body > main`, `body > footer` | `layout.css` |
| `.chapter`, `.chapter__*`, `.chapter__body`, `.wiki-link*` | `chapter.css` |
| `.reader-controls`, `.reader-controls__*` | `chapter.css` |
| `.auth-page`, `.form-*`, `.btn-*`, `.tab-*`, `.profile-*`, `.badge*` | `auth.css` |

After migration, `reader.css` is deleted and its `<link>` in `base.njk` is replaced.

---

## 9. JS File Organization

| File | Source | Content |
|---|---|---|
| `assets/js/nav.js` | Extracted from `base.njk` inline `<script>` | Nav dropdown toggle, click-outside-to-close, Escape key handling |
| `assets/js/reader.js` | Already exists | Font size, theme, wiki-link toggle, scroll-hide for reader pill |
| `assets/js/auth.js` | Already exists | Supabase auth: `signIn`, `signUp`, `signOut`, `getSession`, nav account state |

The anti-FOUC inline script in `<head>` of `base.njk` stays inline — it is intentionally synchronous and must not be deferred.

`nav.js` is loaded with `defer` at the bottom of `<body>`:

```html
<script src="/assets/js/nav.js" defer></script>
```

---

## 10. Testing Approach

### Visual review checklist

Run `npx @11ty/eleventy --serve` from `frontend/` and review each page:

- [ ] Homepage renders: heading, intro, three explore sections with links
- [ ] Novels landing page renders: sections, latest chapter article
- [ ] Wiki index renders: six category sections with browse links
- [ ] Wiki entry page (one of each type): header, meta fields, body prose
- [ ] Chapter page: header block (arc, number, title, date, summary), prose with indented paragraphs, reader controls pill visible
- [ ] Reader controls: font size buttons toggle size; theme button switches light/dark; wiki links button shows/hides wiki links in prose; pill hides on scroll down, reappears on scroll up
- [ ] Auth page: tab strip switches panels; forms have visible inputs and submit button
- [ ] Profile page: card, fields, sign-out button
- [ ] Nav: dropdowns open on click, close on outside click and Escape
- [ ] Nav: Account button is hidden until auth.js resolves

### Theme testing

- [ ] Load any page → light mode by default (or matches `prefers-color-scheme`)
- [ ] Toggle to dark → all surfaces, text, borders update
- [ ] Refresh → persisted theme is restored (no FOUC)
- [ ] Font size persisted across refreshes

### Responsive testing

At 375px, 768px, 1280px:
- [ ] Nav does not overflow horizontally
- [ ] Chapter prose column is readable
- [ ] Reader controls pill is reachable (centered at 375px, bottom-right at wider sizes)
- [ ] Auth/profile forms are full-width at 375px
- [ ] Wiki meta fields stack vertically at 375px

### Accessibility basics

- [ ] All interactive elements have visible focus indicators
- [ ] Nav toggle buttons have `aria-expanded` and `aria-label`
- [ ] Reader controls toolbar has `role="toolbar"` and `aria-label`
- [ ] Form inputs have associated `<label>` elements
- [ ] Error messages use `role="alert"`
- [ ] Color contrast: check `--clr-text` on `--clr-bg` and `--clr-accent` on `--clr-bg` at 4.5:1 (owner's responsibility when filling in token values)

### Print testing (chapter pages)

- [ ] Open a chapter page and use browser print preview
- [ ] Reader controls pill does not appear in print
- [ ] Nav and footer are hidden in print
- [ ] Prose renders in a single column at full width
- [ ] `--clr-text` resolves to near-black, `--clr-bg` to white (or browser handles it)

---

## 11. Out of Scope for Phase 1

These are noted here so they do not creep into the implementation plan:

- Mobile hamburger menu
- Wiki sidebar / table-of-contents sidebar
- Search UI
- Breadcrumb navigation
- Pagination for chapter list or wiki category list
- Image handling (the passthrough copy for `assets/images` is commented out — leave it that way until images exist)
- Font loading optimization (`@font-face`, `font-display`)
- CSS animations beyond the existing transitions in `reader.css`
- Per-category color differentiation in wiki entry modifiers
