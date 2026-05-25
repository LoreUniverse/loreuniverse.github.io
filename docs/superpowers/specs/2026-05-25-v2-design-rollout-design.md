# V2 Design Rollout — Spec

**Date:** 2026-05-25
**Status:** Approved

## Overview

Roll out the V2 dark techno-arcane visual design (established in `frontend/src/design-preview.html`) across the entire Lore Universe frontend. The chapter reader is rebuilt as a standalone full-page experience, isolated from the site shell via its own layout and scoped CSS. A shared `tokens.css` file is the single source of truth for the V2 design palette.

---

## 1. CSS Architecture

### Three files

| File | Loaded by | Purpose |
|---|---|---|
| `tokens.css` | `site.css` + `reader.css` via `@import` | Design tokens only — never loaded directly |
| `site.css` | `base.njk` | Dark site shell, homepage, wiki, account, about |
| `reader.css` | `reader-layout.njk` | Reader top bar, settings panel, prose, pagination |

### `tokens.css` contents

- **Palette:** `--void: #07080e`, `--surface-1` through `--surface-4`, `--border`, `--border-med`, `--gold`, `--gold-glow`, `--blue`, `--blue-glow`, `--violet`, `--violet-glow`, `--text-bright`, `--text-primary`, `--text-secondary`, `--text-muted`, `--text-faint`
- **Fonts:** `--font-display: 'Cinzel Decorative'`, `--font-ui: 'Rajdhani'`, `--font-body: 'Inter'`
- **Motion:** `--dur-fast: 150ms`, `--dur-base: 220ms`, `--dur-slow: 350ms`
- **Z-index scale:** `--z-nav: 50`, `--z-reader-bar: 50`, `--z-settings: 100`
- **Google Fonts `@import`** for Cinzel Decorative, Rajdhani, and Inter

### `site.css`

- Always dark — no `[data-theme]` switching at site level
- Covers: glass nav, footer, homepage, wiki layouts, about, account/auth pages, forms
- The existing `reader.css` is fully replaced; `site.css` takes over all site-level styles

### `reader.css`

- Reader theme toggled via `data-reader-theme="light|dark"` on `.reader-wrap` — never touches `<html>`
- Font size controlled via `--reader-font-size` CSS variable scoped to `.reader-prose` — does not affect top bar or settings panel chrome
- Default: dark (matching site). Light mode shifts background to `#f7f3ec`, prose to near-black, top bar to frosted light surface

---

## 2. Layout Architecture

### `base.njk` (updated)

- Loads `site.css` and `auth.js`
- Header: V2 glass nav — floating pill with hexagon sigil SVG, "LORE UNIVERSE" wordmark, HOME / LIBRARY / WIKI / ABOUT links, gold ACCOUNT button
- Footer: `⬡ Lore Universe ⬡` with copyright
- Anti-FOUC inline script removed — site is always dark, no theme switching
- All non-reader pages use this layout

### `reader-layout.njk` (new)

- Standalone — extends nothing, no `<header>` or `<footer>` from `base.njk`
- Loads `tokens.css` (via reader.css import), `reader.css`, `reader.js`
- Anti-FOUC inline script in `<head>` reads `lr-reader-theme` from `localStorage` and sets `data-reader-theme` on `.reader-wrap` before first paint
- `chapter.njk` updated to use `layout: reader-layout.njk`

### Reader top bar

Fixed, full-width, ~48px tall. Glass morphism (`rgba(7,8,14,0.82)` + `backdrop-filter: blur(24px)`), no border-radius. Four controls:

| Button | Icon | Action |
|---|---|---|
| Back | Home icon (⌂) | Links to the book's chapter listing page |
| Prev | Left arrow (←) | Previous chapter — hidden if none |
| Next | Right arrow (→) | Next chapter — hidden if none |
| Settings | Gear (⚙) | Opens settings popover |

On mobile (≤ 600px): labels hide, icons only.

### Settings popover

Compact popover anchored to the Settings button (top-right). Three rows:

1. **Font size** — `S · M · L` toggle buttons. Sets `--reader-font-size` on `.reader-prose` only. Does not change `html` font-size.
2. **Wiki links** — `Show / Hide` toggle. Controls `.wiki-link` visibility within `.reader-prose`.
3. **Theme** — `Dark / Light` toggle. Sets `data-reader-theme` on `.reader-wrap`.

State persists to `localStorage`. The font size and wiki-links keys are unchanged (`lr-font-size`, `lr-wiki-links`). The theme key changes from `lr-theme` to `lr-reader-theme` — the site no longer has a theme toggle, so the key is reader-specific. Existing `lr-theme` values in storage are ignored (users get the dark default on first load of the new reader).

---

## 3. Homepage

`index.md` → `index.njk` (Nunjucks template, `layout: base.njk`).

Renders the full V2 design from `design-preview.html` with live data:

| Section | Data source |
|---|---|
| Hero | Static — title, lead copy, two CTAs |
| Paths of Power | Static — three cards (Library, Compendium, About) |
| Now Reading | Most recent chapter by `publication_date` (descending) from the Eleventy `chapters` collection; falls back to a static placeholder if the collection is empty |
| World Entries | First 5 entries from `wiki` data file in insertion order (sync order from `sync-wiki.js`); falls back gracefully to an empty state with a "coming soon" message |
| Footer | Static |

`design-preview.html` is deleted once the homepage is live.

---

## 4. Wiki Layouts

All wiki pages use `base.njk`.

### Wiki hub (`wiki/index.njk`)

Replaces `wiki/index.md`. Grid of category cards (same subgrid-aligned card component as Paths of Power): one per category with icon, label, description, and live entry count badge from `wiki` data.

Categories: Characters, Lore Traits, Mechanics, Locations, Factions, Lore.

### Category listing pages

Each `wiki/[category]/index.md` becomes `index.njk`. Layout: section header (category name + total count), then 2-column entry card grid. Each card: type badge, entry name, one-line description excerpt, link to entry.

### Individual wiki entries (`wiki-entry.njk`)

Updated from stub. Two zones:
1. **Header block** — entry name in Cinzel Decorative, type badge, back-link to category listing
2. **Prose** — content in Inter at `680px` max-width, same comfortable reading width as chapter prose

> **Note:** Wiki layouts are intentionally MVP. A full redesign is planned when the wiki content grows significantly.

---

## 5. Reader Details

### Visual start state

Opens dark by default. Anti-FOUC script applies saved `lr-reader-theme` from `localStorage` before first paint — no flash.

### Font size scoping

```css
.reader-prose {
  --reader-font-size: 18px; /* default */
  font-size: var(--reader-font-size);
}
```

S/M/L buttons set this variable on `.reader-prose` via JS. The top bar and settings panel use explicit `rem` values anchored to browser default — unaffected by reader size setting.

### Reader theme scoping

```css
.reader-wrap { /* dark default — inherits tokens */ }
.reader-wrap[data-reader-theme="light"] {
  --void: #f7f3ec;
  --surface-1: #ffffff;
  --text-primary: #28200e;
  --text-secondary: #6b5d48;
  /* top bar gets frosted light surface */
}
```

### Accessibility

- All four top bar buttons have `aria-label`
- Settings popover: `role="dialog"`, `aria-modal="true"`, focus trapped while open, `Escape` closes
- Font size buttons: `aria-pressed` state
- `prefers-reduced-motion`: disables all transitions/animations
- `focus-visible` outlines on all interactive elements
- Prev/Next hidden with `hidden` attribute when unavailable (not just `visibility:hidden`)

---

## 6. Files Changed

### New files
- `frontend/src/assets/css/tokens.css`
- `frontend/src/assets/css/site.css`
- `frontend/src/_includes/reader-layout.njk`
- `frontend/src/index.njk`
- `frontend/src/wiki/index.njk`
- `frontend/src/wiki/characters/index.njk`
- `frontend/src/wiki/factions/index.njk`
- `frontend/src/wiki/locations/index.njk`
- `frontend/src/wiki/lore-traits/index.njk`
- `frontend/src/wiki/lore/index.njk`
- `frontend/src/wiki/mechanics/index.njk`

### Modified files
- `frontend/src/assets/css/reader.css` — full rewrite (reader-only, scoped)
- `frontend/src/assets/js/reader.js` — update font size logic, reader theme scoping
- `frontend/src/_includes/base.njk` — V2 nav + footer, remove anti-FOUC theme script
- `frontend/src/_includes/chapter.njk` — change layout to `reader-layout.njk`
- `frontend/src/_includes/wiki-entry.njk` — expand from stub to full V2 entry layout

### Deleted files
- `frontend/src/design-preview.html` — reference file, deleted after homepage ships
- `frontend/src/index.md` — replaced by `index.njk`
- `frontend/src/wiki/index.md` — replaced by `wiki/index.njk`

---

## 7. Out of Scope

- About page content layout (styled by site nav/footer only for now)
- Account page visual redesign beyond nav/footer
- Wiki layout redesign when content grows (planned future work)
- Light mode for the site shell (reader only)
- Any new homepage sections beyond the five in `design-preview.html`
