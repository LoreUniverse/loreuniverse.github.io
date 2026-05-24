# Visual Design Overhaul — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decompose the monolithic `reader.css` into a structured multi-file CSS architecture, extract the inline nav script into `nav.js`, and add the missing wiki entry and home/landing page styles — leaving all color and font values as owner-fillable custom property tokens.

**Architecture:** All styles live in `frontend/src/assets/css/` as plain CSS files linked from `base.njk`; Eleventy's existing passthrough copy for `src/assets/css` delivers them to `_site/` unchanged. Theming is entirely data-attribute-driven (`[data-theme]`, `[data-font-size]` on `<html>`) so no JavaScript changes are required for the token system.

**Tech Stack:** Plain CSS custom properties, no preprocessor, Eleventy 3 passthrough copy

---

## Context: What Already Exists

Before executing tasks, be aware of the actual current state:

- `frontend/src/assets/css/reader.css` — a single large stylesheet covering tokens, reset, nav, chapter, reader controls, auth, profile, badges. It is the source of truth for existing aesthetic values. **Do not delete it until Task 10.**
- `frontend/src/assets/js/reader.js` — already exists; handles font size, theme, wiki-link toggle, scroll-hide.
- `frontend/src/assets/js/auth.js` — already exists; handles Supabase auth and nav account state.
- `frontend/src/_includes/base.njk` — links `/assets/css/reader.css` and loads `reader.js` + `auth.js`. Contains one inline `<script>` block (nav dropdown behavior) that must be extracted. The anti-FOUC `<script>` in `<head>` stays inline.
- Wiki entry templates use `.wiki-entry`, `.wiki-entry__header`, `.wiki-entry__meta`, `.wiki-entry__field`, `.wiki-entry__label`, `.wiki-entry__value`, `.wiki-entry__list`, `.wiki-entry__body` — **none of these classes have rules in reader.css**. They are genuinely unstyled.

---

## Task 1 — Create directory structure and `tokens.css`

### Files to create

- `frontend/src/assets/css/tokens.css`
- `frontend/src/assets/js/` directory (already exists — verify only)

### What to do

Create `tokens.css` by extracting the custom property declarations from `reader.css` into a standalone file. The values are preserved exactly as they are in `reader.css` — the owner will update them when making aesthetic decisions. Token names map one-for-one.

Add two tokens that are missing from `reader.css` and needed by the new files:
- `--clr-error` — used by `.form-error`; currently hardcoded to `#c0392b` in `reader.css`
- `--clr-badge-admin-bg` and `--clr-badge-admin-fg` — used by `.badge--admin`; currently hardcoded

### `frontend/src/assets/css/tokens.css`

```css
/* =================================================================
   LORE UNIVERSE — DESIGN TOKENS
   All CSS custom properties. Owner fills in aesthetic values here.
   Structural names are fixed; values are placeholders.

   HOW TO CUSTOMIZE:
     1. Replace values in :root {} with your chosen light-theme palette.
     2. Replace values in [data-theme="dark"] {} with dark-theme equivalents.
     3. Choose font-size-base values for sm/md/lg reading sizes.
   ================================================================= */

/* -----------------------------------------------------------------
   Light theme (default)
   ----------------------------------------------------------------- */
:root {
  /* --- Color palette --- */
  --clr-bg:              #f7f3ec;       /* page background */
  --clr-surface:         #ffffff;       /* cards, dropdowns */
  --clr-text:            #28200e;       /* primary body text */
  --clr-text-muted:      #6b5d48;       /* metadata, labels */
  --clr-border:          #ddd5c5;       /* dividers, input borders */
  --clr-accent:          #6b4fa8;       /* links, active states */
  --clr-accent-hover:    #4e3888;       /* hovered accent elements */
  --clr-error:           #c0392b;       /* form error messages */

  /* --- Navigation --- */
  --clr-nav-bg:          #ffffff;       /* header background */
  --clr-nav-border:      #e2d9cc;       /* header bottom border */

  /* --- Reader controls pill --- */
  --clr-ctrl-bg:         #ffffff;
  --clr-ctrl-border:     #ddd5c5;
  --clr-ctrl-text:       #28200e;
  --clr-ctrl-active-bg:  #ede8f7;       /* pressed button background */
  --clr-ctrl-active-fg:  #4e3888;       /* pressed button text */

  /* --- Badges --- */
  --clr-badge-admin-bg:  #ede8f7;
  --clr-badge-admin-fg:  #4e3888;

  /* --- Typography --- */
  --font-body:           Georgia, 'Times New Roman', serif;
  --font-ui:             system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --font-size-base:      18px;          /* overridden by [data-font-size] */
  --line-height-body:    1.85;

  /* --- Layout --- */
  --reading-max-width:   680px;         /* chapter + wiki entry column width */
  --page-padding:        clamp(1rem, 5vw, 2.5rem); /* horizontal page padding */
}

/* -----------------------------------------------------------------
   Dark theme
   Applied when JS sets data-theme="dark" on <html>.
   ----------------------------------------------------------------- */
[data-theme="dark"] {
  --clr-bg:              #161210;
  --clr-surface:         #1e1a15;
  --clr-text:            #e5dcc5;
  --clr-text-muted:      #9a8a70;
  --clr-border:          #2e2820;
  --clr-accent:          #c0a0e0;
  --clr-accent-hover:    #dbbcff;
  --clr-error:           #e05c5c;       /* slightly lighter for dark bg contrast */

  --clr-nav-bg:          #1e1a15;
  --clr-nav-border:      #2e2820;

  --clr-ctrl-bg:         #1e1a15;
  --clr-ctrl-border:     #2e2820;
  --clr-ctrl-text:       #e5dcc5;
  --clr-ctrl-active-bg:  #2e2848;
  --clr-ctrl-active-fg:  #c0a0e0;

  --clr-badge-admin-bg:  #2e2848;
  --clr-badge-admin-fg:  #c0a0e0;
}

/* -----------------------------------------------------------------
   Font-size scale
   Applied by reader.js and the anti-FOUC inline script in base.njk.
   ----------------------------------------------------------------- */
[data-font-size="sm"] { --font-size-base: 15px; }
[data-font-size="md"] { --font-size-base: 18px; }
[data-font-size="lg"] { --font-size-base: 22px; }
```

### Test

- [ ] `tokens.css` exists at `frontend/src/assets/css/tokens.css`
- [ ] File parses without errors (open any browser DevTools → no CSS parse errors)

### Commit

```
git add frontend/src/assets/css/tokens.css
git commit -m "feat: add tokens.css — extracted design token custom properties"
```

---

## Task 2 — Extract nav JS from `base.njk` → `assets/js/nav.js`

### Files to create/edit

- `frontend/src/assets/js/nav.js` (new)
- `frontend/src/_includes/base.njk` (edit — remove inline script, add `<script defer>` link)

### What to do

Extract the IIFE that handles nav dropdowns from the inline `<script>` at the bottom of `base.njk` into a new file. Replace it with a `defer`-loaded `<script src>` tag. The anti-FOUC script in `<head>` is **not touched**.

### `frontend/src/assets/js/nav.js`

```js
/*
  nav.js
  Nav dropdown behavior: click chevron to toggle, click outside to close,
  Escape to close. Click-to-open (not hover) so touch devices work.

  Loaded with defer from base.njk.
*/
(function () {
  const toggles = document.querySelectorAll('[data-nav-toggle]');

  function closeAll() {
    toggles.forEach(t => {
      t.setAttribute('aria-expanded', 'false');
      const submenu = t.nextElementSibling;
      if (submenu) submenu.hidden = true;
    });
  }

  toggles.forEach(toggle => {
    toggle.addEventListener('click', e => {
      e.stopPropagation();
      const isOpen = toggle.getAttribute('aria-expanded') === 'true';
      closeAll();
      if (!isOpen) {
        toggle.setAttribute('aria-expanded', 'true');
        toggle.nextElementSibling.hidden = false;
      }
    });
  });

  document.addEventListener('click', e => {
    if (!e.target.closest('.nav__item')) closeAll();
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeAll();
  });
})();
```

### Edit `frontend/src/_includes/base.njk`

Remove this entire block from `base.njk` (the nav dropdown inline script):

```html
  {#
    Dropdown behavior. Click chevron to toggle, click outside to close,
    Escape to close. Click-to-open (not hover) so touch devices work.
  #}
  <script>
    (function () {
      const toggles = document.querySelectorAll('[data-nav-toggle]');

      function closeAll() {
        toggles.forEach(t => {
          t.setAttribute('aria-expanded', 'false');
          const submenu = t.nextElementSibling;
          if (submenu) submenu.hidden = true;
        });
      }

      toggles.forEach(toggle => {
        toggle.addEventListener('click', e => {
          e.stopPropagation();
          const isOpen = toggle.getAttribute('aria-expanded') === 'true';
          closeAll();
          if (!isOpen) {
            toggle.setAttribute('aria-expanded', 'true');
            toggle.nextElementSibling.hidden = false;
          }
        });
      });

      document.addEventListener('click', e => {
        if (!e.target.closest('.nav__item')) closeAll();
      });

      document.addEventListener('keydown', e => {
        if (e.key === 'Escape') closeAll();
      });
    })();
  </script>
```

Add `nav.js` to the script block at the bottom of `<body>` so it reads:

```html
  <script src="/assets/js/nav.js" defer></script>
  <script src="/assets/js/reader.js" defer></script>
  <script type="module" src="/assets/js/auth.js"></script>
```

### Test

- [ ] `nav.js` exists at `frontend/src/assets/js/nav.js`
- [ ] `base.njk` no longer contains the inline nav dropdown `<script>` block
- [ ] `base.njk` `<body>` end contains `<script src="/assets/js/nav.js" defer></script>`
- [ ] Build the site (`npx @11ty/eleventy` from `frontend/`) — nav dropdowns open and close correctly in browser

### Commit

```
git add frontend/src/assets/js/nav.js frontend/src/_includes/base.njk
git commit -m "refactor: extract nav dropdown JS from base.njk into nav.js"
```

---

## Task 3 — Create `base.css` and update `base.njk` to link the new CSS files

### Files to create/edit

- `frontend/src/assets/css/base.css` (new)
- `frontend/src/_includes/base.njk` (edit — replace `reader.css` link with new file links)

### What to do

Create `base.css` containing the reset, body, typographic element defaults, and theme transitions. These rules are extracted from `reader.css`. The source values in `reader.css` are referenced via `var(--token)` — this file consumes tokens but does not define them.

Update `base.njk` to link `tokens.css` first, then `base.css`. **Keep the `reader.css` link for now** — it remains as a fallback until all component files are created (Tasks 4–9). It will be removed in Task 10.

### `frontend/src/assets/css/base.css`

```css
/* =================================================================
   LORE UNIVERSE — BASE STYLES
   Reset, global element defaults, and theme transitions.
   Depends on tokens.css being loaded first.
   ================================================================= */

/* -----------------------------------------------------------------
   Box model
   ----------------------------------------------------------------- */
*, *::before, *::after {
  box-sizing: border-box;
}

/* -----------------------------------------------------------------
   Document root
   ----------------------------------------------------------------- */
html {
  font-size: var(--font-size-base);
  transition: font-size 0.15s ease;
}

/* -----------------------------------------------------------------
   Body
   ----------------------------------------------------------------- */
body {
  margin: 0;
  background-color: var(--clr-bg);
  color: var(--clr-text);
  font-family: var(--font-body);
  font-size: 1rem;
  line-height: var(--line-height-body);
  transition: background-color 0.2s ease, color 0.2s ease;
  -webkit-font-smoothing: antialiased;
}

/* -----------------------------------------------------------------
   Links
   ----------------------------------------------------------------- */
a {
  color: var(--clr-accent);
  text-decoration: none;
}

a:hover {
  color: var(--clr-accent-hover);
  text-decoration: underline;
}

/* -----------------------------------------------------------------
   Images
   ----------------------------------------------------------------- */
img {
  max-width: 100%;
  height: auto;
}

/* -----------------------------------------------------------------
   Headings
   ----------------------------------------------------------------- */
h1 {
  font-family: var(--font-body);
  font-size: clamp(1.5rem, 3.5vw, 2.2rem);
  color: var(--clr-text);
  margin: 0 0 0.5rem;
  line-height: 1.2;
}

h2 {
  font-family: var(--font-body);
  font-size: clamp(1.1rem, 2.5vw, 1.45rem);
  color: var(--clr-text);
  margin: 1.75em 0 0.5em;
}

h3 {
  font-family: var(--font-ui);
  font-size: 1rem;
  font-weight: 700;
  color: var(--clr-text);
  margin: 1.5em 0 0.4em;
}

/* -----------------------------------------------------------------
   Paragraphs and horizontal rules
   ----------------------------------------------------------------- */
p {
  margin: 0 0 1em;
}

hr {
  border: none;
  border-top: 1px solid var(--clr-border);
  margin: 2em 0;
}
```

### Edit `frontend/src/_includes/base.njk` `<head>`

Replace:

```html
  <link rel="stylesheet" href="/assets/css/reader.css">
```

With:

```html
  <link rel="stylesheet" href="/assets/css/tokens.css">
  <link rel="stylesheet" href="/assets/css/base.css">
  <link rel="stylesheet" href="/assets/css/reader.css">
```

(Keep `reader.css` — it still provides nav, chapter, auth, and other styles while the component files are built in Tasks 4–9.)

### Test

- [ ] `base.css` exists
- [ ] `base.njk` links `tokens.css`, then `base.css`, then `reader.css` (in that order)
- [ ] Build and load homepage — no visual regression (reader.css still covers everything it covered before)
- [ ] DevTools → Computed → `body` shows `background-color` resolving via `--clr-bg`

### Commit

```
git add frontend/src/assets/css/base.css frontend/src/_includes/base.njk
git commit -m "feat: add base.css; link tokens.css and base.css from base.njk"
```

---

## Task 4 — `nav.css`

### Files to create/edit

- `frontend/src/assets/css/nav.css` (new)
- `frontend/src/_includes/base.njk` (edit — add `nav.css` link)

### What to do

Create `nav.css` by extracting all nav-related rules from `reader.css`. These rules target `body > header`, `.nav__*`, and `.nav__item--account`.

### `frontend/src/assets/css/nav.css`

```css
/* =================================================================
   LORE UNIVERSE — NAVIGATION
   Sticky header, primary nav, dropdowns, account button.
   Depends on tokens.css.
   ================================================================= */

/* -----------------------------------------------------------------
   Site header
   ----------------------------------------------------------------- */
body > header {
  background-color: var(--clr-nav-bg);
  border-bottom: 1px solid var(--clr-nav-border);
  padding: 0.6rem var(--page-padding);
  position: sticky;
  top: 0;
  z-index: 100;
  transition: background-color 0.2s ease, border-color 0.2s ease;
}

/* -----------------------------------------------------------------
   Nav list
   ----------------------------------------------------------------- */
.nav__list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  gap: 1.5rem;
  align-items: center;
  font-family: var(--font-ui);
  font-size: 0.875rem;
}

.nav__item {
  position: relative;
}

/* -----------------------------------------------------------------
   Top-level nav links
   ----------------------------------------------------------------- */
.nav__link {
  color: var(--clr-text);
  font-weight: 500;
  transition: color 0.15s;
}

.nav__link:hover {
  color: var(--clr-accent);
  text-decoration: none;
}

/* -----------------------------------------------------------------
   Dropdown toggle (chevron button)
   ----------------------------------------------------------------- */
.nav__toggle {
  background: none;
  border: none;
  cursor: pointer;
  padding: 0 0.2rem;
  font: inherit;
  font-size: 0.75rem;
  color: var(--clr-text-muted);
  line-height: 1;
  vertical-align: middle;
  transition: color 0.15s;
}

.nav__toggle:hover {
  color: var(--clr-accent);
}

/* -----------------------------------------------------------------
   Dropdown submenu
   ----------------------------------------------------------------- */
.nav__submenu {
  position: absolute;
  top: calc(100% + 0.5rem);
  left: 0;
  list-style: none;
  padding: 0.4rem 0;
  margin: 0;
  min-width: 10rem;
  background: var(--clr-surface);
  border: 1px solid var(--clr-border);
  border-radius: 0.375rem;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
  z-index: 200;
  font-family: var(--font-ui);
  font-size: 0.875rem;
}

.nav__submenu[hidden] {
  display: none;
}

.nav__sublink {
  display: block;
  padding: 0.4rem 1rem;
  color: var(--clr-text);
  transition: background-color 0.1s, color 0.1s;
}

.nav__sublink:hover {
  background-color: var(--clr-border);
  color: var(--clr-accent);
  text-decoration: none;
}

/* Divider row inside dropdowns */
.nav__subitem--divider {
  border-top: 1px solid var(--clr-border);
  margin: 0.25rem 0;
  padding: 0;
}

/* Sign-out button styled to look like a nav link */
.nav__sublink--btn {
  display: block;
  width: 100%;
  background: none;
  border: none;
  cursor: pointer;
  padding: 0.4rem 1rem;
  text-align: left;
  font-family: var(--font-ui);
  font-size: 0.875rem;
  color: var(--clr-text);
  transition: background-color 0.1s, color 0.1s;
}

.nav__sublink--btn:hover {
  background-color: var(--clr-border);
  color: var(--clr-accent);
}

/* -----------------------------------------------------------------
   Account nav item (rightmost, JS-driven visibility)
   ----------------------------------------------------------------- */
.nav__item--account {
  margin-left: auto;
}

.nav__account-btn {
  background: none;
  border: 1px solid var(--clr-border);
  border-radius: 0.375rem;
  cursor: pointer;
  padding: 0.25rem 0.75rem;
  font-family: var(--font-ui);
  font-size: 0.875rem;
  color: var(--clr-text);
  transition: border-color 0.15s, color 0.15s;
  white-space: nowrap;
}

.nav__account-btn:hover {
  border-color: var(--clr-accent);
  color: var(--clr-accent);
}
```

### Edit `base.njk`

Add `nav.css` after `base.css` in the `<head>`:

```html
  <link rel="stylesheet" href="/assets/css/tokens.css">
  <link rel="stylesheet" href="/assets/css/base.css">
  <link rel="stylesheet" href="/assets/css/nav.css">
  <link rel="stylesheet" href="/assets/css/reader.css">
```

### Test

- [ ] `nav.css` exists
- [ ] Build and test nav: header visible, links styled, dropdowns open/close
- [ ] No duplicate rule conflicts between `nav.css` and `reader.css` (both define the same selectors; they produce the same output, so no visual change yet — this is expected during the migration)

### Commit

```
git add frontend/src/assets/css/nav.css frontend/src/_includes/base.njk
git commit -m "feat: add nav.css — extracted header and nav styles"
```

---

## Task 5 — `layout.css`

### Files to create/edit

- `frontend/src/assets/css/layout.css` (new)
- `frontend/src/_includes/base.njk` (edit — add `layout.css` link)

### What to do

Create `layout.css` covering the page shell: `body > main` padding and `body > footer` styles.

### `frontend/src/assets/css/layout.css`

```css
/* =================================================================
   LORE UNIVERSE — LAYOUT
   Page shell: main content area and footer.
   Depends on tokens.css.
   ================================================================= */

/* -----------------------------------------------------------------
   Main content area
   ----------------------------------------------------------------- */
body > main {
  padding: 2rem var(--page-padding) 5rem;
}

/* -----------------------------------------------------------------
   Footer
   ----------------------------------------------------------------- */
body > footer {
  border-top: 1px solid var(--clr-border);
  padding: 1.25rem var(--page-padding);
  font-family: var(--font-ui);
  font-size: 0.75rem;
  color: var(--clr-text-muted);
  text-align: center;
  transition: border-color 0.2s ease;
}
```

### Edit `base.njk`

```html
  <link rel="stylesheet" href="/assets/css/tokens.css">
  <link rel="stylesheet" href="/assets/css/base.css">
  <link rel="stylesheet" href="/assets/css/nav.css">
  <link rel="stylesheet" href="/assets/css/layout.css">
  <link rel="stylesheet" href="/assets/css/reader.css">
```

### Test

- [ ] `layout.css` exists
- [ ] Main content area has padding; footer has top border and muted text
- [ ] No visual regression on any page

### Commit

```
git add frontend/src/assets/css/layout.css frontend/src/_includes/base.njk
git commit -m "feat: add layout.css — main and footer page shell styles"
```

---

## Task 6 — `wiki.css` — Wiki entry and index pages

### Files to create/edit

- `frontend/src/assets/css/wiki.css` (new)
- `frontend/src/_includes/base.njk` (edit — add `wiki.css` link)

### What to do

Create `wiki.css` covering all wiki entry page styles. These classes exist in all six wiki templates but have **no rules in reader.css** — this is genuinely new styling.

### `frontend/src/assets/css/wiki.css`

```css
/* =================================================================
   LORE UNIVERSE — WIKI ENTRIES AND INDEX
   Styles for all wiki entry templates (character, faction, location,
   lore-trait, mechanic, lore) and the wiki category index page.
   Depends on tokens.css.
   ================================================================= */

/* -----------------------------------------------------------------
   Wiki entry — outer container
   ----------------------------------------------------------------- */
.wiki-entry {
  max-width: var(--reading-max-width);
  margin: 0 auto;
}

/* -----------------------------------------------------------------
   Entry header: name + category label
   ----------------------------------------------------------------- */
.wiki-entry__header {
  margin-bottom: 2rem;
  padding-bottom: 1.25rem;
  border-bottom: 1px solid var(--clr-border);
}

.wiki-entry__header h1 {
  margin-bottom: 0.25rem;
}

.wiki-entry__category {
  font-family: var(--font-ui);
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--clr-accent);
  margin: 0;
}

/* -----------------------------------------------------------------
   Structured metadata fields
   ----------------------------------------------------------------- */
.wiki-entry__meta {
  margin-bottom: 2.5rem;
}

.wiki-entry__field {
  display: flex;
  gap: 1rem;
  align-items: baseline;
  padding: 0.6rem 0;
  border-bottom: 1px solid var(--clr-border);
}

.wiki-entry__field:last-of-type {
  border-bottom: none;
}

/* -----------------------------------------------------------------
   Field label (e.g. "Status", "Species")
   ----------------------------------------------------------------- */
.wiki-entry__label {
  flex-shrink: 0;
  min-width: 8rem;
  font-family: var(--font-ui);
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--clr-text-muted);
}

/* -----------------------------------------------------------------
   Field value
   ----------------------------------------------------------------- */
.wiki-entry__value {
  font-family: var(--font-ui);
  font-size: 0.9rem;
  color: var(--clr-text);
}

/* -----------------------------------------------------------------
   Field value as a list (factions, skills, etc.)
   ----------------------------------------------------------------- */
.wiki-entry__list {
  list-style: none;
  padding: 0;
  margin: 0;
  font-family: var(--font-ui);
  font-size: 0.9rem;
  color: var(--clr-text);
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem 0.6rem;
}

/* -----------------------------------------------------------------
   Prose body (rendered Markdown)
   ----------------------------------------------------------------- */
.wiki-entry__body {
  line-height: var(--line-height-body);
}

.wiki-entry__body p {
  margin: 0 0 1em;
}

.wiki-entry__body h2 {
  font-family: var(--font-body);
  font-size: clamp(1.05rem, 2.2vw, 1.35rem);
  color: var(--clr-text);
  margin: 2em 0 0.5em;
  padding-bottom: 0.3rem;
  border-bottom: 1px solid var(--clr-border);
}

.wiki-entry__body h3 {
  font-family: var(--font-ui);
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--clr-text);
  margin: 1.5em 0 0.4em;
}

.wiki-entry__body ul,
.wiki-entry__body ol {
  padding-left: 1.5rem;
  margin: 0 0 1em;
}

.wiki-entry__body li {
  margin-bottom: 0.3em;
}

.wiki-entry__body blockquote {
  margin: 1.5em 0;
  padding: 0.75rem 1rem;
  border-left: 3px solid var(--clr-border);
  color: var(--clr-text-muted);
  font-style: italic;
}

/* -----------------------------------------------------------------
   Category modifier hooks (reserved for future per-category theming)
   ----------------------------------------------------------------- */
.wiki-entry--character  {}
.wiki-entry--faction    {}
.wiki-entry--location   {}
.wiki-entry--lore-trait {}
.wiki-entry--mechanic   {}
.wiki-entry--lore       {}

/* -----------------------------------------------------------------
   Responsive — stack label/value on mobile
   ----------------------------------------------------------------- */
@media (max-width: 480px) {
  .wiki-entry__field {
    flex-direction: column;
    gap: 0.2rem;
  }

  .wiki-entry__label {
    min-width: 0;
  }
}
```

### Edit `base.njk`

```html
  <link rel="stylesheet" href="/assets/css/tokens.css">
  <link rel="stylesheet" href="/assets/css/base.css">
  <link rel="stylesheet" href="/assets/css/nav.css">
  <link rel="stylesheet" href="/assets/css/layout.css">
  <link rel="stylesheet" href="/assets/css/wiki.css">
  <link rel="stylesheet" href="/assets/css/reader.css">
```

### Test

- [ ] `wiki.css` exists
- [ ] Open a wiki entry page (e.g. a character page) — header renders with name and "Character" label, meta fields are in a label/value row layout, body prose is readable
- [ ] On a 375px viewport — fields stack vertically
- [ ] Wiki links within entry body are still styled (they use `.wiki-link` from `reader.css`/`chapter.css`, not affected by this file)

### Commit

```
git add frontend/src/assets/css/wiki.css frontend/src/_includes/base.njk
git commit -m "feat: add wiki.css — wiki entry and index page styles (previously unstyled)"
```

---

## Task 7 — `chapter.css` — Chapter reading experience

### Files to create/edit

- `frontend/src/assets/css/chapter.css` (new)
- `frontend/src/_includes/base.njk` (edit — add `chapter.css` link)

### What to do

Extract all chapter and reader-controls rules from `reader.css` into `chapter.css`. This is the largest extraction.

### `frontend/src/assets/css/chapter.css`

```css
/* =================================================================
   LORE UNIVERSE — CHAPTER READING EXPERIENCE
   Chapter layout, prose styles, wiki link toggle, reader controls.
   Depends on tokens.css.
   ================================================================= */

/* -----------------------------------------------------------------
   Chapter container
   ----------------------------------------------------------------- */
.chapter {
  max-width: var(--reading-max-width);
  margin: 0 auto;
}

/* -----------------------------------------------------------------
   Chapter header (arc, number, title, date, summary)
   ----------------------------------------------------------------- */
.chapter__header {
  margin-bottom: 2.5rem;
  padding-bottom: 1.5rem;
  border-bottom: 1px solid var(--clr-border);
}

.chapter__arc {
  font-family: var(--font-ui);
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--clr-accent);
  margin: 0 0 0.5rem;
}

.chapter__number {
  font-family: var(--font-ui);
  font-size: 0.8rem;
  color: var(--clr-text-muted);
  margin: 0 0 0.25rem;
}

.chapter__title {
  font-family: var(--font-body);
  font-size: clamp(1.6rem, 4vw, 2.4rem);
  font-weight: bold;
  line-height: 1.2;
  margin: 0 0 0.75rem;
  color: var(--clr-text);
}

.chapter__date {
  font-family: var(--font-ui);
  font-size: 0.75rem;
  color: var(--clr-text-muted);
  margin: 0 0 1rem;
}

.chapter__summary {
  font-style: italic;
  color: var(--clr-text-muted);
  font-size: 0.95rem;
  line-height: 1.6;
  margin: 0;
  padding: 0.75rem 1rem;
  border-left: 3px solid var(--clr-border);
}

/* -----------------------------------------------------------------
   Chapter prose body
   ----------------------------------------------------------------- */
.chapter__body p {
  margin: 0 0 1.4em;
  text-indent: 1.5em;
}

/* No indent on first paragraph or after a scene break */
.chapter__body p:first-child,
.chapter__body hr + p {
  text-indent: 0;
}

.chapter__body hr {
  border: none;
  border-top: 1px solid var(--clr-border);
  margin: 2em auto;
  width: 40%;
}

/* -----------------------------------------------------------------
   Wiki links in chapter prose
   ----------------------------------------------------------------- */
.wiki-link {
  color: var(--clr-accent);
  text-decoration: underline;
  text-underline-offset: 3px;
  text-decoration-thickness: 1px;
  transition: color 0.15s;
}

.wiki-link:hover {
  color: var(--clr-accent-hover);
  text-decoration: underline;
}

/* Invisible wiki links (wiki_links: false in front matter) */
.wiki-link--hidden {
  color: inherit;
  text-decoration: none;
}

/* Reader-toggled wiki link hide: scoped to .chapter__body so
   wiki entry internal links are never affected. */
[data-wiki-links="hidden"] .chapter__body .wiki-link {
  color: inherit;
  text-decoration: none;
  pointer-events: none;
  cursor: text;
}

/* -----------------------------------------------------------------
   Chapter pagination nav (prev / next)
   ----------------------------------------------------------------- */
.chapter__pagination {
  display: flex;
  justify-content: space-between;
  margin-top: 3rem;
  padding-top: 1.5rem;
  border-top: 1px solid var(--clr-border);
  font-family: var(--font-ui);
  font-size: 0.875rem;
}

/* -----------------------------------------------------------------
   Reader controls — floating pill (fixed, bottom-right)
   ----------------------------------------------------------------- */
.reader-controls {
  position: fixed;
  bottom: 1.5rem;
  right: 1.5rem;
  z-index: 50;
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.45rem 0.75rem;
  background: var(--clr-ctrl-bg);
  border: 1px solid var(--clr-ctrl-border);
  border-radius: 2rem;
  box-shadow: 0 2px 16px rgba(0, 0, 0, 0.12);
  font-family: var(--font-ui);
  transition: background-color 0.2s ease, border-color 0.2s ease,
              transform 0.22s ease;
}

/* Slide the pill below the viewport when scrolling down */
.reader-controls--hidden {
  transform: translateY(calc(100% + 2.5rem));
}

.reader-controls__divider {
  width: 1px;
  height: 1.25rem;
  background: var(--clr-border);
  margin: 0 0.125rem;
}

/* Font-size buttons */
.reader-controls__btn {
  background: none;
  border: none;
  border-radius: 0.25rem;
  cursor: pointer;
  color: var(--clr-ctrl-text);
  line-height: 1;
  padding: 0.3rem 0.4rem;
  font-family: var(--font-ui);
  font-weight: 600;
  transition: background-color 0.15s, color 0.15s;
}

.reader-controls__btn:hover {
  background-color: var(--clr-border);
}

.reader-controls__btn[aria-pressed="true"] {
  background-color: var(--clr-ctrl-active-bg);
  color: var(--clr-ctrl-active-fg);
}

/* Visually distinct sizes to illustrate the scale */
.reader-controls__btn--sm { font-size: 0.7rem; }
.reader-controls__btn--md { font-size: 0.9rem; }
.reader-controls__btn--lg { font-size: 1.1rem; }

.reader-controls__btn--wiki {
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.07em;
  text-transform: uppercase;
}

.reader-controls__theme-btn {
  background: none;
  border: none;
  border-radius: 0.25rem;
  cursor: pointer;
  color: var(--clr-text-muted);
  padding: 0.3rem 0.4rem;
  font-family: var(--font-ui);
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  line-height: 1;
  transition: color 0.15s, background-color 0.15s;
}

.reader-controls__theme-btn:hover {
  background-color: var(--clr-border);
  color: var(--clr-text);
}

/* -----------------------------------------------------------------
   Responsive — Mobile (≤ 480px)
   ----------------------------------------------------------------- */
@media (max-width: 480px) {
  /* Center the pill at the bottom on small screens */
  .reader-controls {
    right: 50%;
    transform: translateX(50%);
    bottom: 1rem;
  }

  /* Hidden state must carry both transforms */
  .reader-controls--hidden {
    transform: translateX(50%) translateY(calc(100% + 2rem));
  }

  /* Drop text-indent on mobile — narrow columns read better without it */
  .chapter__body p {
    text-indent: 0;
  }

  .chapter__body p + p {
    margin-top: 0.75em;
  }
}

/* -----------------------------------------------------------------
   Responsive — Tablet (481px – 900px)
   ----------------------------------------------------------------- */
@media (min-width: 481px) and (max-width: 900px) {
  :root {
    --reading-max-width: 92vw;
  }
}

/* -----------------------------------------------------------------
   Print — chapter pages
   ----------------------------------------------------------------- */
@media print {
  .reader-controls {
    display: none;
  }

  body > header,
  body > footer {
    display: none;
  }

  .chapter {
    max-width: 100%;
    margin: 0;
  }

  .chapter__body p {
    text-indent: 0;
    orphans: 3;
    widows: 3;
  }

  a {
    color: inherit;
    text-decoration: none;
  }
}
```

### Edit `base.njk`

```html
  <link rel="stylesheet" href="/assets/css/tokens.css">
  <link rel="stylesheet" href="/assets/css/base.css">
  <link rel="stylesheet" href="/assets/css/nav.css">
  <link rel="stylesheet" href="/assets/css/layout.css">
  <link rel="stylesheet" href="/assets/css/wiki.css">
  <link rel="stylesheet" href="/assets/css/chapter.css">
  <link rel="stylesheet" href="/assets/css/reader.css">
```

### Test

- [ ] `chapter.css` exists
- [ ] Open a chapter page — all reader controls work (font size, theme, wiki links, scroll-hide)
- [ ] Print preview a chapter — nav/footer hidden, pill hidden, prose full-width
- [ ] No visual regression on non-chapter pages

### Commit

```
git add frontend/src/assets/css/chapter.css frontend/src/_includes/base.njk
git commit -m "feat: add chapter.css — chapter reading experience and reader controls"
```

---

## Task 8 — `auth.css` — Auth and profile pages

### Files to create/edit

- `frontend/src/assets/css/auth.css` (new)
- `frontend/src/_includes/base.njk` (edit — add `auth.css` link)

### What to do

Extract all auth, profile, form, button, tab strip, and badge rules from `reader.css` into `auth.css`. Replace the hardcoded `#c0392b` error color with `var(--clr-error)`.

### `frontend/src/assets/css/auth.css`

```css
/* =================================================================
   LORE UNIVERSE — AUTH AND PROFILE
   Account page, profile page, shared form primitives, buttons, badges.
   Depends on tokens.css.
   ================================================================= */

/* -----------------------------------------------------------------
   Auth page layout (/account/)
   ----------------------------------------------------------------- */
.auth-page {
  max-width: 28rem;
  margin: 3rem auto;
}

.auth-page h1 {
  font-family: var(--font-ui);
  font-size: 1.5rem;
  margin-bottom: 1.5rem;
  text-align: center;
}

/* -----------------------------------------------------------------
   Tab strip (sign-in / register tabs)
   ----------------------------------------------------------------- */
.tab-strip {
  display: flex;
  border-bottom: 2px solid var(--clr-border);
  margin-bottom: 1.5rem;
}

.tab-btn {
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  margin-bottom: -2px;
  cursor: pointer;
  padding: 0.5rem 1.25rem;
  font-family: var(--font-ui);
  font-size: 0.875rem;
  color: var(--clr-text-muted);
  transition: color 0.15s, border-color 0.15s;
}

.tab-btn[aria-selected="true"] {
  color: var(--clr-accent);
  border-bottom-color: var(--clr-accent);
}

.tab-panel[hidden] {
  display: none;
}

/* -----------------------------------------------------------------
   Form card container
   ----------------------------------------------------------------- */
.form-card {
  background: var(--clr-surface);
  border: 1px solid var(--clr-border);
  border-radius: 0.5rem;
  padding: 1.5rem;
}

/* -----------------------------------------------------------------
   Form field group (label + input)
   ----------------------------------------------------------------- */
.form-group {
  margin-bottom: 1rem;
}

.form-group label {
  display: block;
  font-family: var(--font-ui);
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--clr-text-muted);
  margin-bottom: 0.375rem;
}

.form-group input[type="text"],
.form-group input[type="email"],
.form-group input[type="password"] {
  width: 100%;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--clr-border);
  border-radius: 0.375rem;
  background: var(--clr-bg);
  color: var(--clr-text);
  font-family: var(--font-ui);
  font-size: 0.9rem;
  transition: border-color 0.15s;
}

.form-group input:focus {
  outline: none;
  border-color: var(--clr-accent);
}

/* -----------------------------------------------------------------
   Form feedback
   ----------------------------------------------------------------- */
.form-error {
  font-family: var(--font-ui);
  font-size: 0.8rem;
  color: var(--clr-error);
  margin-top: 0.5rem;
  min-height: 1.2em;
}

.form-success {
  font-family: var(--font-ui);
  font-size: 0.9rem;
  text-align: center;
  padding: 1.25rem 0 0.5rem;
  color: var(--clr-text);
}

/* -----------------------------------------------------------------
   Buttons
   ----------------------------------------------------------------- */
/* Primary: full-width, accent fill */
.btn-primary {
  display: block;
  width: 100%;
  margin-top: 1.25rem;
  padding: 0.6rem 1rem;
  background: var(--clr-accent);
  color: #fff;
  border: none;
  border-radius: 0.375rem;
  font-family: var(--font-ui);
  font-size: 0.9rem;
  cursor: pointer;
  transition: background-color 0.15s;
}

.btn-primary:hover      { background: var(--clr-accent-hover); }
.btn-primary:disabled   { opacity: 0.6; cursor: not-allowed; }

/* Secondary: outline */
.btn-secondary {
  padding: 0.5rem 1.25rem;
  background: none;
  color: var(--clr-text);
  border: 1px solid var(--clr-border);
  border-radius: 0.375rem;
  font-family: var(--font-ui);
  font-size: 0.875rem;
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s;
}

.btn-secondary:hover {
  border-color: var(--clr-accent);
  color: var(--clr-accent);
}

/* -----------------------------------------------------------------
   Profile page layout (/account/profile/)
   ----------------------------------------------------------------- */
.profile-page {
  max-width: 32rem;
  margin: 3rem auto;
}

.profile-page h1 {
  font-family: var(--font-ui);
  font-size: 1.5rem;
  margin-bottom: 1.5rem;
}

.profile-card {
  background: var(--clr-surface);
  border: 1px solid var(--clr-border);
  border-radius: 0.5rem;
  padding: 1.5rem;
  margin-bottom: 1.25rem;
}

.profile-field {
  display: flex;
  gap: 1rem;
  align-items: baseline;
  padding: 0.65rem 0;
  border-bottom: 1px solid var(--clr-border);
}

.profile-field:last-of-type {
  border-bottom: none;
}

.profile-label {
  min-width: 4rem;
  font-family: var(--font-ui);
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--clr-text-muted);
}

.profile-value {
  font-family: var(--font-ui);
  font-size: 0.9rem;
  color: var(--clr-text);
}

/* -----------------------------------------------------------------
   Badges (role / tier)
   ----------------------------------------------------------------- */
.badge {
  display: inline-block;
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
  font-family: var(--font-ui);
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.badge--admin {
  background: var(--clr-badge-admin-bg);
  color: var(--clr-badge-admin-fg);
}

.badge--user,
.badge--free {
  background: var(--clr-ctrl-bg);
  border: 1px solid var(--clr-border);
  color: var(--clr-text-muted);
}
```

### Edit `base.njk`

```html
  <link rel="stylesheet" href="/assets/css/tokens.css">
  <link rel="stylesheet" href="/assets/css/base.css">
  <link rel="stylesheet" href="/assets/css/nav.css">
  <link rel="stylesheet" href="/assets/css/layout.css">
  <link rel="stylesheet" href="/assets/css/wiki.css">
  <link rel="stylesheet" href="/assets/css/chapter.css">
  <link rel="stylesheet" href="/assets/css/auth.css">
  <link rel="stylesheet" href="/assets/css/reader.css">
```

### Test

- [ ] `auth.css` exists
- [ ] Auth page (`/account/`): tab strip, form card, inputs, button visible and styled
- [ ] Profile page (`/account/profile/`): card, fields, sign-out button visible
- [ ] Error color uses token (test by temporarily triggering a sign-in error)
- [ ] Badges render as pill shapes with correct color treatment

### Commit

```
git add frontend/src/assets/css/auth.css frontend/src/_includes/base.njk
git commit -m "feat: add auth.css — auth page, profile page, forms, buttons, badges"
```

---

## Task 9 — `home.css` — Homepage and module landing pages

### Files to create/edit

- `frontend/src/assets/css/home.css` (new)
- `frontend/src/_includes/base.njk` (edit — add `home.css` link)

### What to do

Create `home.css` covering the homepage (`index.md`), the Novels landing page (`lorekeeper/index.md`), and the wiki index page (`wiki/index.md`). These are Markdown pages rendered via `base.njk` — they have no template-level wrappers. Styles are scoped by the structural HTML that Eleventy renders from Markdown (headings, paragraphs, `<article>` for the latest-chapter block, `<hr>` separators).

Because these pages share `body > main` with everything else, class-based scoping is not available without a custom layout wrapper. These rules target broad selectors that are appropriate for prose/landing content. The owner may choose to add a `home.njk` layout or use front-matter body classes later for more precise scoping.

### `frontend/src/assets/css/home.css`

```css
/* =================================================================
   LORE UNIVERSE — HOME AND LANDING PAGES
   Homepage (index.md), Novels landing (lorekeeper/index.md),
   and Wiki index (wiki/index.md).

   These are Markdown pages with no custom wrapper class. Rules here
   target the prose structure that Eleventy renders from Markdown.
   Depends on tokens.css.
   ================================================================= */

/* -----------------------------------------------------------------
   Landing page content column
   Constrains prose to a readable width, matching wiki entries.
   ----------------------------------------------------------------- */
body > main > h1:first-child,
body > main > p,
body > main > h2,
body > main > h3,
body > main > ul,
body > main > ol,
body > main > article,
body > main > hr {
  max-width: var(--reading-max-width);
  margin-left: auto;
  margin-right: auto;
}

/* -----------------------------------------------------------------
   Horizontal rule separators between landing sections
   ----------------------------------------------------------------- */
body > main > hr {
  border: none;
  border-top: 1px solid var(--clr-border);
  margin-top: 2.5rem;
  margin-bottom: 2.5rem;
}

/* -----------------------------------------------------------------
   Section CTA links (e.g. "Enter the Novels module →")
   Slightly larger than body links for prominence.
   ----------------------------------------------------------------- */
body > main > p > a:only-child {
  font-family: var(--font-ui);
  font-size: 0.95rem;
  font-weight: 500;
}

/* -----------------------------------------------------------------
   Latest chapter article block (lorekeeper/index.md)
   ----------------------------------------------------------------- */
body > main > article {
  padding: 1.25rem 1.5rem;
  background: var(--clr-surface);
  border: 1px solid var(--clr-border);
  border-radius: 0.375rem;
  font-family: var(--font-ui);
  font-size: 0.9rem;
}

body > main > article p {
  margin: 0 0 0.5rem;
}

body > main > article p:last-child {
  margin-bottom: 0;
}

/* -----------------------------------------------------------------
   Wiki index — category sections
   Each section is an h2 + p + link. Add bottom-border to h2.
   ----------------------------------------------------------------- */
body > main > h2 {
  padding-bottom: 0.4rem;
  border-bottom: 1px solid var(--clr-border);
}
```

### Edit `base.njk`

```html
  <link rel="stylesheet" href="/assets/css/tokens.css">
  <link rel="stylesheet" href="/assets/css/base.css">
  <link rel="stylesheet" href="/assets/css/nav.css">
  <link rel="stylesheet" href="/assets/css/layout.css">
  <link rel="stylesheet" href="/assets/css/wiki.css">
  <link rel="stylesheet" href="/assets/css/chapter.css">
  <link rel="stylesheet" href="/assets/css/auth.css">
  <link rel="stylesheet" href="/assets/css/home.css">
  <link rel="stylesheet" href="/assets/css/reader.css">
```

### Test

- [ ] `home.css` exists
- [ ] Homepage: content column is constrained, `<hr>` separators are styled, CTA links are readable
- [ ] Novels landing page: "Latest chapter" article block has surface background and border
- [ ] Wiki index: `h2` section headings have bottom border
- [ ] No visual regression on wiki entry pages or chapter pages (selectors are scoped to `body > main > *` direct children)

### Commit

```
git add frontend/src/assets/css/home.css frontend/src/_includes/base.njk
git commit -m "feat: add home.css — homepage and module landing page styles"
```

---

## Task 10 — Final review: retire `reader.css` and verify

### Files to edit

- `frontend/src/_includes/base.njk` (remove `reader.css` link)
- `frontend/src/assets/css/reader.css` (delete after verification)

### What to do

All rules from `reader.css` now exist in the new files. Remove the `reader.css` link from `base.njk` and verify that no styles were lost.

### Edit `base.njk` — final `<head>` CSS links

Replace all current stylesheet links with:

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

### Visual review checklist

Work through every page type in a running local build (`npx @11ty/eleventy --serve` from `frontend/`):

**Homepage**
- [ ] Heading, intro paragraph, three "Explore" sections with CTA links
- [ ] `<hr>` separators styled
- [ ] Content column constrained

**Novels landing**
- [ ] Sections and CTA links styled
- [ ] Latest chapter article block visible with surface background

**Wiki index**
- [ ] Six category sections with bordered `h2` headings
- [ ] Browse links styled

**Wiki entry (open one of each type)**
- [ ] Character: name, "Character" category label, meta fields (label/value rows), prose body
- [ ] Faction: same structure, faction-specific fields
- [ ] Location, Lore Trait, Mechanic, Lore: same
- [ ] On 375px: meta fields stack vertically

**Chapter page**
- [ ] Arc, number, title, date, summary header block
- [ ] Prose paragraphs with text-indent (except first and post-HR)
- [ ] Reader controls pill: font size, theme toggle, wiki links toggle, scroll-hide
- [ ] Dark mode: all surfaces update
- [ ] Font size changes persist on refresh
- [ ] Print preview: nav/footer/pill hidden, prose full-width

**Auth page**
- [ ] Tab strip switches between Sign in and Create account panels
- [ ] Form card, inputs, primary button styled
- [ ] Error message styled in error color

**Profile page**
- [ ] Card with fields in label/value rows
- [ ] Sign-out button (outline style)
- [ ] Role and tier badges as pills

**Navigation (all pages)**
- [ ] Dropdowns open on chevron click, close on outside click and Escape
- [ ] Account button hidden until auth.js resolves
- [ ] Nav sticky at top, does not overlap content

**Theme (all pages)**
- [ ] Light mode default
- [ ] Dark mode toggle works and persists
- [ ] No FOUC on reload in either mode

### Delete reader.css

Once all checks pass:

```bash
# from frontend/
rm src/assets/css/reader.css
```

Build again and verify the build succeeds and the site still looks correct.

### Commit

```
git add frontend/src/_includes/base.njk
git rm frontend/src/assets/css/reader.css
git commit -m "refactor: retire reader.css — all styles migrated to component files"
```

---

## Summary of files created / modified

| File | Action |
|---|---|
| `frontend/src/assets/css/tokens.css` | Created |
| `frontend/src/assets/css/base.css` | Created |
| `frontend/src/assets/css/nav.css` | Created |
| `frontend/src/assets/css/layout.css` | Created |
| `frontend/src/assets/css/wiki.css` | Created |
| `frontend/src/assets/css/chapter.css` | Created |
| `frontend/src/assets/css/auth.css` | Created |
| `frontend/src/assets/css/home.css` | Created |
| `frontend/src/assets/css/reader.css` | Deleted |
| `frontend/src/assets/js/nav.js` | Created |
| `frontend/src/_includes/base.njk` | Edited (CSS links, script extraction) |
