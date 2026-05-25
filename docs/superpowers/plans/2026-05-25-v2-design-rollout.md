# V2 Design Rollout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Roll out the V2 dark techno-arcane visual design across the entire Lore Universe frontend, with the chapter reader rebuilt as a standalone full-page experience isolated from the site shell.

**Architecture:** Three CSS files — `tokens.css` (shared design tokens), `site.css` (always-dark site shell), `reader.css` (reader-scoped, imports tokens) — loaded by two layouts: `base.njk` (all non-reader pages) and the new `reader-layout.njk` (chapter pages only). Homepage, wiki hub, and wiki category listing pages are rebuilt as Nunjucks templates with live data from Eleventy collections and the `wiki` data file.

**Tech Stack:** Eleventy 3.x, Nunjucks, vanilla CSS (custom properties), vanilla JS, Google Fonts (Cinzel Decorative, Rajdhani, Inter).

---

## File Map

| Action | Path |
|---|---|
| **Create** | `frontend/src/assets/css/tokens.css` |
| **Create** | `frontend/src/assets/css/site.css` |
| **Rewrite** | `frontend/src/assets/css/reader.css` |
| **Create** | `frontend/src/_includes/reader-layout.njk` |
| **Update** | `frontend/src/_includes/base.njk` |
| **Update** | `frontend/src/_includes/chapter.njk` |
| **Update** | `frontend/src/_includes/wiki-entry.njk` |
| **Create** | `frontend/src/_includes/wiki-category.njk` |
| **Create** | `frontend/src/index.njk` |
| **Create** | `frontend/src/wiki/index.njk` |
| **Update** | `frontend/src/wiki/*/index.md` (6 files — change layout, add category_key) |
| **Update** | `frontend/src/assets/js/reader.js` |
| **Update** | `frontend/.eleventy.js` (add getPrevNext filter) |
| **Delete** | `frontend/src/design-preview.html` |
| **Delete** | `frontend/src/index.md` |
| **Delete** | `frontend/src/wiki/index.md` |

---

## Task 1: tokens.css

**Files:**
- Create: `frontend/src/assets/css/tokens.css`

- [ ] **Step 1: Create tokens.css**

```css
/* =================================================================
   LORE UNIVERSE — DESIGN TOKENS V2
   Single source of truth for palette, fonts, motion, z-index.
   @import'd by site.css and reader.css — never loaded directly.
   ================================================================= */

@import url('https://fonts.googleapis.com/css2?family=Cinzel+Decorative:wght@400;700&family=Rajdhani:wght@400;500;600;700&family=Inter:ital,wght@0,300;0,400;0,500;0,600;1,400&display=swap');

:root {
  /* Background depth */
  --void:      #07080e;
  --surface-1: #0e1020;
  --surface-2: #161930;
  --surface-3: #1e2240;
  --surface-4: #262b50;

  /* Borders */
  --border:     rgba(255,255,255,0.07);
  --border-med: rgba(255,255,255,0.12);
  --border-hi:  rgba(255,255,255,0.20);

  /* Gold */
  --gold:       #f59e0b;
  --gold-light: #fbbf24;
  --gold-dim:   rgba(245,158,11,0.12);
  --gold-glow:  0 0 20px rgba(245,158,11,0.5), 0 0 60px rgba(245,158,11,0.18);

  /* Blue */
  --blue:       #38bdf8;
  --blue-light: #7dd3fc;
  --blue-dim:   rgba(56,189,248,0.10);
  --blue-glow:  0 0 20px rgba(56,189,248,0.5), 0 0 60px rgba(56,189,248,0.18);

  /* Violet */
  --violet:       #c084fc;
  --violet-light: #d8b4fe;
  --violet-dim:   rgba(192,132,252,0.10);
  --violet-glow:  0 0 20px rgba(192,132,252,0.5), 0 0 60px rgba(192,132,252,0.18);

  /* Text */
  --text-bright:     #f0f1fa;
  --text-primary:    #c4c8de;
  --text-secondary:  #8b8fa8;
  --text-muted:      #545873;
  --text-faint:      #383b56;

  /* Typography */
  --font-display: 'Cinzel Decorative', serif;
  --font-ui:      'Rajdhani', sans-serif;
  --font-body:    'Inter', sans-serif;

  /* Motion */
  --dur-fast: 150ms;
  --dur-base: 220ms;
  --dur-slow: 350ms;
  --ease:     cubic-bezier(0.22, 1, 0.36, 1);

  /* Z-index scale */
  --z-nav:        50;
  --z-reader-bar: 50;
  --z-settings:  100;
}
```

- [ ] **Step 2: Verify build still passes**

```bash
cd frontend && npm run build
```
Expected: build completes, no errors. (tokens.css is not loaded yet — that's fine.)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/assets/css/tokens.css
git commit -m "feat: add V2 design tokens CSS"
```

---

## Task 2: site.css

**Files:**
- Create: `frontend/src/assets/css/site.css`

- [ ] **Step 1: Create site.css**

```css
/* =================================================================
   LORE UNIVERSE — SITE CSS V2
   Loaded by base.njk (all non-reader pages).
   Always dark — no [data-theme] switching at site level.
   ================================================================= */

@import 'tokens.css';

/* -----------------------------------------------------------------
   Reset
   ----------------------------------------------------------------- */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html { scroll-behavior: smooth; }
@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
body {
  background-color: var(--void);
  color: var(--text-primary);
  font-family: var(--font-body);
  font-size: 16px;
  line-height: 1.65;
  overflow-x: hidden;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
body {
  background-image:
    radial-gradient(ellipse 80% 50% at 50% 0%,   rgba(56,189,248,0.055) 0%, transparent 55%),
    radial-gradient(ellipse 60% 40% at 85% 40%,  rgba(192,132,252,0.04) 0%, transparent 50%),
    radial-gradient(ellipse 50% 35% at 15% 75%,  rgba(245,158,11,0.035) 0%, transparent 50%);
}
a { color: inherit; text-decoration: none; }
:focus-visible { outline: 2px solid var(--blue); outline-offset: 3px; border-radius: 4px; }

/* -----------------------------------------------------------------
   Layout
   ----------------------------------------------------------------- */
.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 2rem;
}

/* -----------------------------------------------------------------
   Navigation
   ----------------------------------------------------------------- */
.nav {
  position: fixed;
  top: 1rem; left: 1rem; right: 1rem;
  z-index: var(--z-nav);
  border-radius: 12px;
  background: rgba(7,8,14,0.82);
  backdrop-filter: blur(24px) saturate(160%);
  -webkit-backdrop-filter: blur(24px) saturate(160%);
  border: 1px solid var(--border-med);
  box-shadow: 0 4px 32px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05);
  overflow: hidden;
}
.nav::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 1px;
  background: linear-gradient(90deg,
    transparent 0%, var(--blue) 20%, var(--violet) 50%, var(--gold) 80%, transparent 100%);
  opacity: 0.7;
}
.nav-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.875rem 1.5rem;
}
.nav-brand {
  display: flex; align-items: center; gap: 0.75rem;
  cursor: pointer;
  transition: opacity var(--dur-fast);
  text-decoration: none;
}
.nav-brand:hover { opacity: 0.8; }
.nav-sigil { width: 36px; height: 36px; flex-shrink: 0; }
.nav-wordmark {
  font-family: var(--font-display);
  font-size: 0.8rem; font-weight: 700;
  letter-spacing: 0.1em;
  color: var(--text-bright);
}
.nav-links {
  display: flex; align-items: center; gap: 0.25rem;
  list-style: none;
}
.nav-links a {
  display: block;
  font-family: var(--font-ui);
  font-size: 0.78rem; font-weight: 600;
  letter-spacing: 0.16em; text-transform: uppercase;
  color: var(--text-secondary);
  padding: 0.5rem 0.875rem;
  border-radius: 8px;
  transition: color var(--dur-fast), background var(--dur-fast);
}
.nav-links a:hover { color: var(--text-bright); background: rgba(255,255,255,0.06); }
.nav-account {
  font-family: var(--font-ui);
  font-size: 0.75rem; font-weight: 700;
  letter-spacing: 0.16em; text-transform: uppercase;
  color: var(--gold);
  background: rgba(245,158,11,0.08);
  border: 1px solid rgba(245,158,11,0.35);
  padding: 0.5rem 1.125rem;
  border-radius: 8px;
  cursor: pointer;
  min-height: 44px;
  display: inline-flex; align-items: center;
  text-decoration: none;
  transition: background var(--dur-fast), border-color var(--dur-fast), box-shadow var(--dur-base);
}
.nav-account:hover {
  background: rgba(245,158,11,0.14);
  border-color: rgba(245,158,11,0.65);
  box-shadow: 0 0 18px rgba(245,158,11,0.22);
}
.nav-menu-btn {
  display: none;
  background: none; border: none;
  cursor: pointer; padding: 0.4rem;
  color: var(--text-primary); border-radius: 6px;
  transition: background var(--dur-fast), color var(--dur-fast);
}
.nav-menu-btn:hover { background: rgba(255,255,255,0.06); color: var(--text-bright); }
.nav-menu-btn svg { display: block; }
.nav-mobile {
  display: none; flex-direction: column;
  padding: 0.5rem 1rem 0.75rem;
  border-top: 1px solid var(--border);
  gap: 0.125rem;
}
.nav-mobile--open { display: flex; }
.nav-mobile a {
  font-family: var(--font-ui);
  font-size: 0.85rem; font-weight: 600;
  letter-spacing: 0.1em; text-transform: uppercase;
  color: var(--text-secondary);
  text-decoration: none;
  padding: 0.6rem 0.75rem;
  border-radius: 8px;
  transition: color var(--dur-fast), background var(--dur-fast);
}
.nav-mobile a:hover { color: var(--text-bright); background: rgba(255,255,255,0.06); }

/* -----------------------------------------------------------------
   Footer
   ----------------------------------------------------------------- */
.site-footer {
  border-top: 1px solid var(--border);
  padding: 3rem 0 4rem;
  text-align: center;
}
.footer-row {
  display: flex; align-items: center; justify-content: center;
  gap: 1.25rem; margin-bottom: 1.25rem;
}
.footer-rule { width: 5rem; height: 1px; background: var(--border-med); }
.footer-brand {
  font-family: var(--font-display);
  font-size: 0.68rem; font-weight: 700;
  letter-spacing: 0.2em; color: var(--text-faint);
}
.footer-rune { color: var(--violet); opacity: 0.4; font-size: 0.75rem; }
.footer-copy { font-family: var(--font-body); font-size: 0.78rem; color: var(--text-muted); opacity: 0.55; }

/* -----------------------------------------------------------------
   Shared: Buttons
   ----------------------------------------------------------------- */
.btn-primary {
  display: inline-flex; align-items: center; gap: 0.5rem;
  min-height: 48px; padding: 0 2rem;
  font-family: var(--font-ui); font-size: 0.8rem; font-weight: 700;
  letter-spacing: 0.18em; text-transform: uppercase;
  color: #030b16; background: var(--blue);
  border: none; border-radius: 8px; cursor: pointer;
  transition: background var(--dur-fast), box-shadow var(--dur-base), transform var(--dur-fast);
  text-decoration: none;
}
.btn-primary:hover {
  background: var(--blue-light);
  box-shadow: var(--blue-glow);
  transform: translateY(-2px);
}
.btn-secondary {
  display: inline-flex; align-items: center; gap: 0.5rem;
  min-height: 48px; padding: 0 2rem;
  font-family: var(--font-ui); font-size: 0.8rem; font-weight: 700;
  letter-spacing: 0.18em; text-transform: uppercase;
  color: var(--gold); background: transparent;
  border: 1px solid rgba(245,158,11,0.45);
  border-radius: 8px; cursor: pointer;
  transition: background var(--dur-fast), border-color var(--dur-fast), box-shadow var(--dur-base), transform var(--dur-fast);
  text-decoration: none;
}
.btn-secondary:hover {
  background: rgba(245,158,11,0.10);
  border-color: var(--gold);
  box-shadow: var(--gold-glow);
  transform: translateY(-2px);
}

/* -----------------------------------------------------------------
   Shared: Section divider + header
   ----------------------------------------------------------------- */
.s-divider {
  display: flex; align-items: center; justify-content: center;
  gap: 1rem; padding: 4rem 0 3rem;
}
.s-divider::before, .s-divider::after {
  content: ''; flex: 1; max-width: 18rem;
  height: 1px; background: var(--border);
}
.s-divider-label {
  display: flex; align-items: center; gap: 0.75rem;
  font-family: var(--font-ui); font-size: 0.63rem; font-weight: 600;
  letter-spacing: 0.32em; text-transform: uppercase;
  color: var(--text-faint); white-space: nowrap;
}
.s-divider-rune { color: var(--violet); opacity: 0.55; font-size: 0.75rem; }
.s-header { text-align: center; margin-bottom: 3rem; }
.s-label {
  font-family: var(--font-ui); font-size: 0.65rem; font-weight: 700;
  letter-spacing: 0.3em; text-transform: uppercase;
  color: var(--violet); margin-bottom: 0.6rem;
}
.s-title {
  font-family: var(--font-display);
  font-size: clamp(1.4rem, 4vw, 2rem); font-weight: 700;
  color: var(--text-bright); letter-spacing: 0.04em;
}

/* -----------------------------------------------------------------
   Homepage: Hero
   ----------------------------------------------------------------- */
.hero {
  position: relative;
  min-height: 100vh;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  text-align: center;
  padding: 9rem 2rem 7rem;
  overflow: hidden;
}
.hero::before {
  content: '';
  position: absolute; inset: 0;
  background: radial-gradient(ellipse 70% 70% at 50% 50%, transparent 30%, rgba(7,8,14,0.5) 100%);
  pointer-events: none; z-index: 1;
}
.hero > * { position: relative; z-index: 2; }
.starfield { z-index: 0; }

@keyframes star-drift {
  from { transform: translateY(0); }
  to   { transform: translateY(-80px); }
}
.starfield {
  position: absolute; inset: 0;
  pointer-events: none; overflow: hidden;
}
.starfield::before {
  content: '';
  position: absolute; inset: -10%;
  width: 120%; height: 120%;
  background-image:
    radial-gradient(circle, rgba(255,255,255,0.85) 1px, transparent 1px),
    radial-gradient(circle, rgba(255,255,255,0.65) 1px, transparent 1px),
    radial-gradient(circle, rgba(255,255,255,0.5)  1px, transparent 1px),
    radial-gradient(circle, rgba(255,255,255,0.7)  1px, transparent 1px);
  background-size: 233px 233px, 317px 317px, 411px 411px, 149px 149px;
  background-position: 0 0, 80px 60px, 150px 25px, 30px 110px;
  opacity: 0.35;
  animation: star-drift 120s linear infinite;
}
.starfield::after {
  content: '';
  position: absolute; inset: -10%;
  width: 120%; height: 120%;
  background-image:
    radial-gradient(circle, rgba(56,189,248,0.7)   1.5px, transparent 1.5px),
    radial-gradient(circle, rgba(245,158,11,0.6)   1.5px, transparent 1.5px),
    radial-gradient(circle, rgba(192,132,252,0.5)  1.5px, transparent 1.5px),
    radial-gradient(circle, rgba(255,255,255,0.6)  1px,   transparent 1px);
  background-size: 617px 617px, 833px 833px, 521px 521px, 389px 389px;
  background-position: 120px 80px, 300px 200px, 60px 350px, 200px 50px;
  opacity: 0.25;
  animation: star-drift 180s linear infinite reverse;
}
.hero-eyebrow {
  display: flex; align-items: center; gap: 1rem;
  font-family: var(--font-ui); font-size: 0.7rem; font-weight: 600;
  letter-spacing: 0.3em; text-transform: uppercase;
  color: var(--blue); margin-bottom: 2.5rem;
}
.hero-eyebrow::before, .hero-eyebrow::after {
  content: ''; display: block; width: 3rem; height: 1px;
  background: linear-gradient(90deg, transparent, var(--blue));
}
.hero-eyebrow::after { background: linear-gradient(270deg, transparent, var(--blue)); }
.hero-title {
  font-family: var(--font-display);
  font-size: clamp(3.5rem, 10vw, 7.5rem); font-weight: 700;
  line-height: 1.02; letter-spacing: 0.04em;
  color: var(--text-bright); margin-bottom: 0.15em;
}
.hero-title-gold { display: block; color: var(--gold); text-shadow: var(--gold-glow); }
.hero-subtitle {
  font-family: var(--font-ui);
  font-size: clamp(0.72rem, 1.8vw, 0.9rem); font-weight: 500;
  letter-spacing: 0.45em; text-transform: uppercase;
  color: var(--text-muted); margin-bottom: 3rem;
}
.arcane-divider {
  display: flex; align-items: center; justify-content: center;
  gap: 0.875rem; margin-bottom: 2.5rem;
}
.arcane-divider::before, .arcane-divider::after {
  content: ''; display: block; width: 5rem; height: 1px;
  background: linear-gradient(90deg, transparent, var(--text-faint));
}
.arcane-divider::after { background: linear-gradient(270deg, transparent, var(--text-faint)); }
.arcane-glyph { font-size: 0.85rem; color: var(--violet); letter-spacing: 0.4em; opacity: 0.7; }
.hero-lead {
  font-family: var(--font-body);
  font-size: clamp(1rem, 2vw, 1.1rem); line-height: 1.8;
  color: var(--text-secondary); max-width: 44ch;
  margin: 0 auto 3rem;
}
.hero-ctas {
  display: flex; gap: 1rem; justify-content: center;
  flex-wrap: wrap; margin-bottom: 5rem;
}
.scroll-cue {
  display: flex; flex-direction: column; align-items: center; gap: 0.6rem;
  font-family: var(--font-ui); font-size: 0.6rem; font-weight: 600;
  letter-spacing: 0.3em; text-transform: uppercase; color: var(--text-faint);
}
@keyframes pulse-down {
  0%, 100% { opacity: 0.3; transform: translateY(0); }
  50%       { opacity: 0.8; transform: translateY(8px); }
}
.scroll-line {
  width: 1px; height: 2.5rem;
  background: linear-gradient(180deg, var(--text-faint), transparent);
  animation: pulse-down 2.5s var(--ease) infinite;
}

/* -----------------------------------------------------------------
   Homepage: Paths of Power (explore cards)
   ----------------------------------------------------------------- */
.explore { padding-bottom: 6rem; }
.explore-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  column-gap: 1.25rem;
}
.explore-card {
  position: relative;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 12px; padding: 2rem;
  overflow: hidden; cursor: pointer;
  display: grid;
  grid-template-rows: subgrid;
  grid-row: span 5;
  row-gap: 0;
  align-content: start;
  text-decoration: none;
  transition: border-color var(--dur-base), box-shadow var(--dur-base), transform var(--dur-base);
}
.explore-card::before {
  content: ''; position: absolute;
  top: 0; left: 0; right: 0; height: 2px;
  transition: opacity var(--dur-base);
}
.explore-card--blue::before   { background: linear-gradient(90deg, transparent, var(--blue),   transparent); }
.explore-card--gold::before   { background: linear-gradient(90deg, transparent, var(--gold),   transparent); }
.explore-card--violet::before { background: linear-gradient(90deg, transparent, var(--violet), transparent); }
.explore-card::after {
  content: ''; position: absolute;
  bottom: 1.25rem; right: 1.25rem;
  width: 2.5rem; height: 2.5rem;
  border-right: 1px solid; border-bottom: 1px solid;
  border-radius: 0 0 4px 0; opacity: 0.1;
  transition: opacity var(--dur-base);
}
.explore-card--blue::after   { border-color: var(--blue);   }
.explore-card--gold::after   { border-color: var(--gold);   }
.explore-card--violet::after { border-color: var(--violet); }
.explore-card--blue:hover   { border-color: rgba(56,189,248,0.4);  box-shadow: 0 0 0 1px rgba(56,189,248,0.08),  0 12px 48px rgba(56,189,248,0.1);  transform: translateY(-4px); }
.explore-card--gold:hover   { border-color: rgba(245,158,11,0.4);  box-shadow: 0 0 0 1px rgba(245,158,11,0.08),  0 12px 48px rgba(245,158,11,0.1);  transform: translateY(-4px); }
.explore-card--violet:hover { border-color: rgba(192,132,252,0.4); box-shadow: 0 0 0 1px rgba(192,132,252,0.08), 0 12px 48px rgba(192,132,252,0.1); transform: translateY(-4px); }
.explore-card:hover::after { opacity: 0.35; }
.card-icon { width: 40px; height: 40px; margin-bottom: 1.25rem; }
.card-tag { font-family: var(--font-ui); font-size: 0.63rem; font-weight: 700; letter-spacing: 0.28em; text-transform: uppercase; margin-bottom: 0.6rem; }
.explore-card--blue   .card-tag { color: var(--blue);   }
.explore-card--gold   .card-tag { color: var(--gold);   }
.explore-card--violet .card-tag { color: var(--violet); }
.card-title { font-family: var(--font-display); font-size: 1rem; font-weight: 700; color: var(--text-bright); margin-bottom: 0.75rem; letter-spacing: 0.025em; }
.card-desc  { font-family: var(--font-body); font-size: 0.875rem; line-height: 1.7; color: var(--text-secondary); }
.card-arrow {
  display: inline-flex; align-items: center; gap: 0.4rem; margin-top: 1.5rem;
  font-family: var(--font-ui); font-size: 0.7rem; font-weight: 700;
  letter-spacing: 0.16em; text-transform: uppercase;
  transition: gap var(--dur-fast);
}
.explore-card--blue   .card-arrow { color: var(--blue);   }
.explore-card--gold   .card-arrow { color: var(--gold);   }
.explore-card--violet .card-arrow { color: var(--violet); }
.explore-card:hover .card-arrow { gap: 0.7rem; }

/* -----------------------------------------------------------------
   Homepage: Now Reading (chapter teaser)
   ----------------------------------------------------------------- */
.chapter-wrap { padding-bottom: 6rem; }
.chapter-card {
  position: relative;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-left: 3px solid var(--gold);
  border-radius: 12px; padding: 2.5rem 3rem;
  display: flex; align-items: center;
  justify-content: space-between;
  gap: 2rem; overflow: hidden;
}
.chapter-card::before {
  content: ''; position: absolute; inset: 0;
  background: radial-gradient(ellipse 60% 100% at 100% 50%, rgba(245,158,11,0.05) 0%, transparent 65%);
  pointer-events: none;
}
.chapter-card::after {
  content: ''; position: absolute;
  top: 1.25rem; right: 1.25rem;
  width: 3rem; height: 3rem;
  border-top: 1px solid rgba(245,158,11,0.2);
  border-right: 1px solid rgba(245,158,11,0.2);
  border-radius: 0 4px 0 0;
}
.chapter-meta { display: flex; align-items: center; gap: 0.875rem; margin-bottom: 1rem; }
.chapter-chip {
  font-family: var(--font-ui); font-size: 0.62rem; font-weight: 700;
  letter-spacing: 0.2em; text-transform: uppercase;
  color: #07080e; background: var(--gold);
  padding: 0.3rem 0.75rem; border-radius: 4px;
}
.chapter-book { font-family: var(--font-ui); font-size: 0.72rem; font-weight: 500; letter-spacing: 0.14em; color: var(--text-muted); }
.chapter-title { font-family: var(--font-display); font-size: clamp(1.2rem, 3vw, 1.65rem); font-weight: 700; color: var(--text-bright); margin-bottom: 0.875rem; letter-spacing: 0.03em; }
.chapter-excerpt { font-family: var(--font-body); font-size: 0.9rem; line-height: 1.75; color: var(--text-secondary); font-style: italic; max-width: 52ch; }

/* -----------------------------------------------------------------
   Homepage: Wiki preview
   ----------------------------------------------------------------- */
.wiki-wrap { padding-bottom: 7rem; }
.wiki-header { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 2rem; }
.wiki-heading { font-family: var(--font-display); font-size: clamp(1.2rem, 3vw, 1.65rem); font-weight: 700; color: var(--text-bright); letter-spacing: 0.04em; }
.wiki-view-all {
  font-family: var(--font-ui); font-size: 0.7rem; font-weight: 700;
  letter-spacing: 0.2em; text-transform: uppercase; color: var(--violet);
  cursor: pointer; text-decoration: none;
  transition: color var(--dur-fast), text-shadow var(--dur-base);
}
.wiki-view-all:hover { color: var(--violet-light); text-shadow: var(--violet-glow); }
.wiki-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; }
.wiki-card {
  background: var(--surface-2); border: 1px solid var(--border);
  border-radius: 10px; padding: 1.5rem;
  cursor: pointer; display: block; text-decoration: none;
  transition: border-color var(--dur-base), box-shadow var(--dur-base), transform var(--dur-base);
}
.wiki-card:hover { border-color: rgba(192,132,252,0.3); box-shadow: 0 4px 28px rgba(192,132,252,0.08); transform: translateY(-3px); }
.wiki-card--more {
  background: var(--surface-1); border-style: dashed;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  text-align: center; gap: 0.5rem; min-height: 140px;
}
.wiki-card--more:hover { border-color: rgba(192,132,252,0.4); background: rgba(192,132,252,0.04); }
.wiki-cat { font-family: var(--font-ui); font-size: 0.6rem; font-weight: 700; letter-spacing: 0.28em; text-transform: uppercase; color: var(--violet); margin-bottom: 0.5rem; }
.wiki-entry-title { font-family: var(--font-display); font-size: 0.925rem; font-weight: 700; color: var(--text-bright); margin-bottom: 0.6rem; letter-spacing: 0.02em; }
.wiki-entry-desc { font-family: var(--font-body); font-size: 0.825rem; line-height: 1.6; color: var(--text-secondary); }

/* -----------------------------------------------------------------
   Wiki hub page
   ----------------------------------------------------------------- */
.wiki-hub { padding: 8rem 0 6rem; }
.wiki-hub-header { text-align: center; margin-bottom: 4rem; }
.wiki-hub-eyebrow {
  font-family: var(--font-ui); font-size: 0.65rem; font-weight: 700;
  letter-spacing: 0.3em; text-transform: uppercase;
  color: var(--violet); margin-bottom: 0.75rem;
}
.wiki-hub-title {
  font-family: var(--font-display);
  font-size: clamp(2rem, 5vw, 3rem); font-weight: 700;
  color: var(--text-bright); letter-spacing: 0.04em;
  margin-bottom: 1rem;
}
.wiki-hub-lead { font-family: var(--font-body); font-size: 1rem; color: var(--text-secondary); max-width: 52ch; margin: 0 auto; line-height: 1.7; }
.wiki-hub-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  column-gap: 1.25rem;
}
/* Reuse .explore-card for wiki hub category cards — same component */

/* -----------------------------------------------------------------
   Wiki category listing
   ----------------------------------------------------------------- */
.wiki-category { padding: 8rem 0 6rem; }
.wiki-category-header { margin-bottom: 3rem; }
.wiki-category-back {
  display: inline-flex; align-items: center; gap: 0.5rem;
  font-family: var(--font-ui); font-size: 0.72rem; font-weight: 600;
  letter-spacing: 0.14em; text-transform: uppercase;
  color: var(--text-muted); text-decoration: none;
  margin-bottom: 2rem;
  transition: color var(--dur-fast);
}
.wiki-category-back:hover { color: var(--text-primary); }
.wiki-category-title {
  font-family: var(--font-display);
  font-size: clamp(1.8rem, 4vw, 2.5rem); font-weight: 700;
  color: var(--text-bright); letter-spacing: 0.04em;
  margin-bottom: 0.5rem;
}
.wiki-category-count {
  font-family: var(--font-ui); font-size: 0.72rem; font-weight: 600;
  letter-spacing: 0.14em; text-transform: uppercase;
  color: var(--text-muted);
}
.wiki-entry-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem; }
.wiki-entry-card {
  background: var(--surface-2); border: 1px solid var(--border);
  border-radius: 10px; padding: 1.5rem;
  display: block; text-decoration: none;
  transition: border-color var(--dur-base), box-shadow var(--dur-base), transform var(--dur-base);
}
.wiki-entry-card:hover { border-color: rgba(192,132,252,0.3); box-shadow: 0 4px 28px rgba(192,132,252,0.08); transform: translateY(-3px); }
.wiki-entry-card-badge {
  font-family: var(--font-ui); font-size: 0.58rem; font-weight: 700;
  letter-spacing: 0.22em; text-transform: uppercase;
  color: #07080e; background: var(--violet);
  padding: 0.2rem 0.6rem; border-radius: 4px;
  display: inline-block; margin-bottom: 0.75rem;
}
.wiki-entry-card-name { font-family: var(--font-display); font-size: 0.95rem; font-weight: 700; color: var(--text-bright); margin-bottom: 0.5rem; letter-spacing: 0.02em; }
.wiki-entry-card-desc { font-family: var(--font-body); font-size: 0.825rem; line-height: 1.6; color: var(--text-secondary); }
.wiki-empty { padding: 3rem; text-align: center; border: 1px dashed var(--border-med); border-radius: 10px; }
.wiki-empty-text { font-family: var(--font-ui); font-size: 0.8rem; color: var(--text-muted); letter-spacing: 0.06em; }

/* -----------------------------------------------------------------
   Wiki entry pages (wiki-entry.njk and per-category templates)
   ----------------------------------------------------------------- */
.wiki-entry-page { padding: 8rem 0 6rem; }
.wiki-entry-page-inner { max-width: 780px; margin: 0 auto; padding: 0 2rem; }
.wiki-entry-page-back {
  display: inline-flex; align-items: center; gap: 0.5rem;
  font-family: var(--font-ui); font-size: 0.72rem; font-weight: 600;
  letter-spacing: 0.14em; text-transform: uppercase;
  color: var(--text-muted); text-decoration: none;
  margin-bottom: 2.5rem;
  transition: color var(--dur-fast);
}
.wiki-entry-page-back:hover { color: var(--text-primary); }
.wiki-entry-page-badge {
  font-family: var(--font-ui); font-size: 0.6rem; font-weight: 700;
  letter-spacing: 0.22em; text-transform: uppercase;
  color: #07080e; background: var(--violet);
  padding: 0.25rem 0.75rem; border-radius: 4px;
  display: inline-block; margin-bottom: 1.25rem;
}
.wiki-entry-page-title {
  font-family: var(--font-display);
  font-size: clamp(1.8rem, 4vw, 2.75rem); font-weight: 700;
  color: var(--text-bright); letter-spacing: 0.03em;
  margin-bottom: 2.5rem;
  padding-bottom: 1.5rem;
  border-bottom: 1px solid var(--border);
}
.wiki-entry-page-prose {
  max-width: 680px;
  font-family: var(--font-body); font-size: 1rem; line-height: 1.8; color: var(--text-primary);
}
.wiki-entry-page-prose h1,
.wiki-entry-page-prose h2,
.wiki-entry-page-prose h3 {
  font-family: var(--font-display);
  color: var(--text-bright); margin: 2rem 0 0.75rem;
}
.wiki-entry-page-prose h2 { font-size: 1.3rem; letter-spacing: 0.03em; }
.wiki-entry-page-prose h3 { font-size: 1.05rem; letter-spacing: 0.02em; }
.wiki-entry-page-prose p  { margin-bottom: 1.2rem; }
.wiki-entry-page-prose a  { color: var(--blue); text-decoration: underline; text-underline-offset: 3px; }
.wiki-entry-page-prose a:hover { color: var(--blue-light); }
.wiki-entry-page-prose ul,
.wiki-entry-page-prose ol { margin: 0.75rem 0 1.2rem 1.5rem; }
.wiki-entry-page-prose li { margin-bottom: 0.35rem; }
.wiki-entry-page-prose hr { border: none; border-top: 1px solid var(--border); margin: 2rem 0; }

/* Wiki entry structured meta (character.njk, faction.njk, etc.) */
.wiki-entry__header { margin-bottom: 2rem; padding-bottom: 1.5rem; border-bottom: 1px solid var(--border); }
.wiki-entry__header h1 {
  font-family: var(--font-display); font-size: clamp(1.8rem, 4vw, 2.75rem);
  font-weight: 700; color: var(--text-bright); letter-spacing: 0.03em;
  margin-bottom: 0.75rem;
}
.wiki-entry__category {
  font-family: var(--font-ui); font-size: 0.6rem; font-weight: 700;
  letter-spacing: 0.22em; text-transform: uppercase;
  color: #07080e; background: var(--violet);
  padding: 0.25rem 0.75rem; border-radius: 4px;
  display: inline-block;
}
.wiki-entry__meta {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 1rem; margin-bottom: 2rem;
}
.wiki-entry__field {
  background: var(--surface-2); border: 1px solid var(--border);
  border-radius: 8px; padding: 0.875rem 1rem;
}
.wiki-entry__label {
  font-family: var(--font-ui); font-size: 0.62rem; font-weight: 700;
  letter-spacing: 0.18em; text-transform: uppercase;
  color: var(--text-muted); display: block; margin-bottom: 0.3rem;
}
.wiki-entry__value { font-family: var(--font-body); font-size: 0.875rem; color: var(--text-primary); }
.wiki-entry__list { list-style: none; padding: 0; }
.wiki-entry__list li + li { margin-top: 0.25rem; }
.wiki-entry__list a { color: var(--blue); }
.wiki-entry__list a:hover { color: var(--blue-light); }
.wiki-entry__body { max-width: 680px; font-family: var(--font-body); font-size: 1rem; line-height: 1.8; color: var(--text-primary); }
.wiki-entry__body h1, .wiki-entry__body h2, .wiki-entry__body h3 { font-family: var(--font-display); color: var(--text-bright); margin: 2rem 0 0.75rem; }
.wiki-entry__body h2 { font-size: 1.3rem; }
.wiki-entry__body h3 { font-size: 1.05rem; }
.wiki-entry__body p { margin-bottom: 1.2rem; }
.wiki-entry__body a { color: var(--blue); text-decoration: underline; text-underline-offset: 3px; }
.wiki-entry__body ul, .wiki-entry__body ol { margin: 0.75rem 0 1.2rem 1.5rem; }
.wiki-entry__body li { margin-bottom: 0.35rem; }
.wiki-entry__body hr { border: none; border-top: 1px solid var(--border); margin: 2rem 0; }

/* Wiki link token — show/hide driven by [data-wiki-links] on <html> */
.wiki-link { color: var(--violet); text-decoration: underline; text-decoration-style: dotted; text-underline-offset: 3px; }
[data-wiki-links="hidden"] .wiki-link { display: none; }
[data-wiki-links="hidden"] .wiki-link--hidden { display: none; }

/* -----------------------------------------------------------------
   Responsive
   ----------------------------------------------------------------- */
@media (max-width: 900px) {
  .explore-grid { grid-template-columns: 1fr 1fr; gap: 1.25rem; }
  .explore-card { display: flex; flex-direction: column; grid-row: unset; row-gap: unset; }
  .card-desc { flex: 1; }
  .wiki-grid { grid-template-columns: 1fr 1fr; }
  .wiki-hub-grid { grid-template-columns: 1fr 1fr; gap: 1.25rem; }
  .nav-menu-btn { display: flex; align-items: center; }
  .nav-links { display: none; }
  .nav-account { display: none; }
}
@media (max-width: 600px) {
  .container { padding: 0 1.25rem; }
  .explore-grid, .wiki-hub-grid { grid-template-columns: 1fr; }
  .wiki-grid, .wiki-entry-grid { grid-template-columns: 1fr; }
  .chapter-card { flex-direction: column; padding: 1.75rem; }
  .hero-ctas { flex-direction: column; align-items: center; }
  .hero { padding: 7rem 1.25rem 5rem; }
}
```

- [ ] **Step 2: Build**

```bash
cd frontend && npm run build
```
Expected: clean build.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/assets/css/site.css
git commit -m "feat: add V2 site CSS"
```

---

## Task 3: reader.css Rewrite

**Files:**
- Rewrite: `frontend/src/assets/css/reader.css`

- [ ] **Step 1: Replace reader.css entirely**

```css
/* =================================================================
   LORE UNIVERSE — READER CSS V2
   Loaded only by reader-layout.njk (chapter pages).
   Imports tokens for the full token set.
   Reader theme toggled via data-reader-theme on .reader-wrap.
   Font size scoped to .reader-prose via --reader-font-size.
   ================================================================= */

@import 'tokens.css';

/* -----------------------------------------------------------------
   Reset (minimal — reader pages only)
   ----------------------------------------------------------------- */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}

/* -----------------------------------------------------------------
   Reader wrap — dark default
   ----------------------------------------------------------------- */
.reader-wrap {
  min-height: 100vh;
  background-color: var(--void);
  color: var(--text-primary);
  font-family: var(--font-body);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
body {
  margin: 0;
  background-color: var(--void);
}
a { color: inherit; text-decoration: none; }
:focus-visible { outline: 2px solid var(--blue); outline-offset: 3px; border-radius: 4px; }

/* -----------------------------------------------------------------
   Light theme override — scoped to .reader-wrap
   ----------------------------------------------------------------- */
.reader-wrap[data-reader-theme="light"],
:root[data-reader-theme="light"] .reader-wrap {
  --void:           #f7f3ec;
  --surface-1:      #ffffff;
  --surface-2:      #f0ebe0;
  --border:         rgba(0,0,0,0.08);
  --border-med:     rgba(0,0,0,0.12);
  --text-bright:    #1a1408;
  --text-primary:   #28200e;
  --text-secondary: #6b5d48;
  --text-muted:     #9a8874;
  --text-faint:     #c4b89e;
  background-color: var(--void);
  color: var(--text-primary);
}
:root[data-reader-theme="light"] body,
.reader-wrap[data-reader-theme="light"] {
  background-color: #f7f3ec;
}

/* -----------------------------------------------------------------
   Reader top bar
   ----------------------------------------------------------------- */
.reader-bar {
  position: fixed;
  top: 0; left: 0; right: 0;
  height: 48px;
  z-index: var(--z-reader-bar);
  background: rgba(7,8,14,0.82);
  backdrop-filter: blur(24px) saturate(160%);
  -webkit-backdrop-filter: blur(24px) saturate(160%);
  border-bottom: 1px solid var(--border-med);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 1rem;
  gap: 0.5rem;
}
.reader-wrap[data-reader-theme="light"] .reader-bar,
:root[data-reader-theme="light"] .reader-bar {
  background: rgba(247,243,236,0.90);
  border-bottom-color: rgba(0,0,0,0.10);
}
.reader-bar::after {
  content: '';
  position: absolute;
  bottom: 0; left: 0; right: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--gold), var(--violet), var(--blue), transparent);
  opacity: 0.35;
}
.reader-bar-left,
.reader-bar-right {
  display: flex; align-items: center; gap: 0.25rem;
}
.reader-btn {
  display: inline-flex; align-items: center; gap: 0.4rem;
  height: 34px; padding: 0 0.75rem;
  font-family: var(--font-ui); font-size: 0.72rem; font-weight: 600;
  letter-spacing: 0.1em; text-transform: uppercase;
  color: var(--text-secondary); background: transparent;
  border: none; border-radius: 6px; cursor: pointer;
  text-decoration: none;
  transition: color var(--dur-fast), background var(--dur-fast);
}
.reader-btn:hover { color: var(--text-bright); background: rgba(255,255,255,0.07); }
.reader-wrap[data-reader-theme="light"] .reader-btn:hover,
:root[data-reader-theme="light"] .reader-btn:hover {
  background: rgba(0,0,0,0.05);
}
.reader-btn svg { flex-shrink: 0; }
.reader-btn-label { /* hide on mobile */ }

/* -----------------------------------------------------------------
   Reader prose
   ----------------------------------------------------------------- */
.reader-prose-wrap {
  padding-top: 80px; /* clear the fixed top bar */
  padding-bottom: 6rem;
  min-height: 100vh;
}
.reader-prose {
  --reader-font-size: 18px;
  max-width: 680px;
  margin: 0 auto;
  padding: 2rem 2rem 0;
  font-size: var(--reader-font-size);
  line-height: 1.85;
}
.reader-chapter-header { margin-bottom: 3rem; padding-bottom: 2rem; border-bottom: 1px solid var(--border); }
.reader-arc {
  font-family: var(--font-ui); font-size: 0.65rem; font-weight: 600;
  letter-spacing: 0.28em; text-transform: uppercase;
  color: var(--violet); margin-bottom: 0.5rem;
}
.reader-chapter-num {
  font-family: var(--font-ui); font-size: 0.72rem; font-weight: 700;
  letter-spacing: 0.2em; text-transform: uppercase;
  color: var(--text-muted); margin-bottom: 0.75rem;
}
.reader-chapter-title {
  font-family: var(--font-display);
  font-size: clamp(1.5rem, 4vw, 2.25rem); font-weight: 700;
  color: var(--text-bright); letter-spacing: 0.03em;
  margin-bottom: 0.75rem;
}
.reader-chapter-date {
  font-family: var(--font-ui); font-size: 0.72rem;
  color: var(--text-muted); letter-spacing: 0.08em;
  margin-bottom: 0.75rem;
}
.reader-chapter-summary {
  font-family: var(--font-body); font-size: 0.9rem; line-height: 1.7;
  color: var(--text-secondary); font-style: italic;
}
/* Prose body content */
.reader-prose p  { margin-bottom: 1.4em; color: var(--text-primary); }
.reader-prose h1, .reader-prose h2, .reader-prose h3 { font-family: var(--font-display); color: var(--text-bright); margin: 2em 0 0.75em; }
.reader-prose h2 { font-size: 1.3em; }
.reader-prose h3 { font-size: 1.05em; }
.reader-prose hr { border: none; border-top: 1px solid var(--border); margin: 2.5em 0; }
.reader-prose a { color: var(--blue); text-decoration: underline; text-underline-offset: 3px; }
.reader-prose a:hover { color: var(--blue-light); }
.reader-prose ul, .reader-prose ol { margin: 0.75em 0 1.4em 1.5em; }
.reader-prose li { margin-bottom: 0.35em; }

/* Wiki links */
.wiki-link { color: var(--violet); text-decoration: underline; text-decoration-style: dotted; text-underline-offset: 3px; }
[data-wiki-links="hidden"] .wiki-link { display: none; }
[data-wiki-links="hidden"] .wiki-link--hidden { display: none; }

/* Reader pagination */
.reader-pagination {
  display: flex; align-items: center; justify-content: center;
  gap: 2rem; padding: 3rem 2rem;
  max-width: 680px; margin: 0 auto;
  border-top: 1px solid var(--border);
}

/* -----------------------------------------------------------------
   Settings popover
   ----------------------------------------------------------------- */
.reader-settings-anchor { position: relative; }

.reader-settings {
  position: absolute;
  top: calc(100% + 0.75rem);
  right: 0;
  z-index: var(--z-settings);
  width: 260px;
  background: var(--surface-2);
  border: 1px solid var(--border-med);
  border-radius: 12px;
  padding: 1.25rem;
  box-shadow: 0 8px 40px rgba(0,0,0,0.5);
  display: none;
}
.reader-settings--open { display: block; }
.reader-settings-row { display: flex; align-items: center; justify-content: space-between; padding: 0.625rem 0; }
.reader-settings-row + .reader-settings-row { border-top: 1px solid var(--border); }
.reader-settings-label {
  font-family: var(--font-ui); font-size: 0.72rem; font-weight: 600;
  letter-spacing: 0.1em; text-transform: uppercase; color: var(--text-secondary);
}
.reader-toggle-group { display: flex; gap: 0.25rem; }
.reader-toggle-btn {
  height: 28px; padding: 0 0.625rem;
  font-family: var(--font-ui); font-size: 0.7rem; font-weight: 700;
  letter-spacing: 0.08em; text-transform: uppercase;
  color: var(--text-muted); background: var(--surface-3);
  border: 1px solid var(--border);
  border-radius: 6px; cursor: pointer;
  transition: color var(--dur-fast), background var(--dur-fast), border-color var(--dur-fast);
}
.reader-toggle-btn:hover { color: var(--text-primary); background: var(--surface-4); }
.reader-toggle-btn[aria-pressed="true"] {
  color: var(--text-bright); background: var(--surface-4);
  border-color: var(--border-med);
}
/* Light theme popover */
.reader-wrap[data-reader-theme="light"] .reader-settings,
:root[data-reader-theme="light"] .reader-settings {
  background: #fff;
  border-color: rgba(0,0,0,0.12);
  box-shadow: 0 8px 40px rgba(0,0,0,0.15);
}

/* -----------------------------------------------------------------
   Responsive
   ----------------------------------------------------------------- */
@media (max-width: 600px) {
  .reader-btn-label { display: none; }
  .reader-prose { padding: 1.5rem 1.25rem 0; }
}
```

- [ ] **Step 2: Build**

```bash
cd frontend && npm run build
```
Expected: clean build.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/assets/css/reader.css
git commit -m "feat: rewrite reader.css for V2 scoped reader"
```

---

## Task 4: base.njk — V2 Nav + Footer

**Files:**
- Modify: `frontend/src/_includes/base.njk`

- [ ] **Step 1: Replace base.njk**

```njk
{#
  base.njk — V2
  Root layout for all non-reader pages.
  Always dark — no data-theme switching.
  Loads site.css (which imports tokens.css).
#}
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{ title or name }} | Lore Universe</title>
  <link rel="stylesheet" href="/assets/css/site.css">
</head>
<body>

<nav class="nav" role="navigation" aria-label="Main navigation">
  <div class="nav-inner">

    <a class="nav-brand" href="/" aria-label="Lore Universe — Home">
      <svg class="nav-sigil" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M20 2.5 L36.5 11.5 L36.5 29.5 L20 38.5 L3.5 29.5 L3.5 11.5 Z"
          stroke="rgba(255,255,255,0.1)" stroke-width="1" fill="none"/>
        <path d="M20 2.5 L3.5 11.5 L3.5 29.5 L20 38.5 Z"
          fill="rgba(56,189,248,0.1)" stroke="rgba(56,189,248,0.35)" stroke-width="0.75"/>
        <path d="M20 2.5 L36.5 11.5 L36.5 29.5 L20 38.5 Z"
          fill="rgba(245,158,11,0.08)" stroke="rgba(245,158,11,0.35)" stroke-width="0.75"/>
        <line x1="20" y1="2.5" x2="20" y2="38.5"
          stroke="rgba(255,255,255,0.1)" stroke-width="0.5" stroke-dasharray="2.5 2.5"/>
        <circle cx="20" cy="20.5" r="3.5" fill="rgba(192,132,252,0.75)"/>
        <circle cx="3.5"  cy="11.5" r="1.25" fill="rgba(56,189,248,0.55)"/>
        <circle cx="36.5" cy="11.5" r="1.25" fill="rgba(245,158,11,0.55)"/>
      </svg>
      <span class="nav-wordmark">Lore Universe</span>
    </a>

    <ul class="nav-links" role="list">
      <li><a href="/">Home</a></li>
      <li><a href="/library/">Library</a></li>
      <li><a href="/wiki/">Wiki</a></li>
      <li><a href="/about/">About</a></li>
    </ul>

    <a class="nav-account" href="/account/" id="nav-account-btn">Account</a>

    <button class="nav-menu-btn" id="nav-menu-btn"
      aria-label="Toggle menu" aria-expanded="false" aria-controls="nav-mobile">
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <rect x="2" y="5"    width="16" height="1.5" rx="0.75" fill="currentColor"/>
        <rect x="2" y="9.25" width="16" height="1.5" rx="0.75" fill="currentColor"/>
        <rect x="2" y="13.5" width="16" height="1.5" rx="0.75" fill="currentColor"/>
      </svg>
    </button>

  </div>

  <div class="nav-mobile" id="nav-mobile">
    <a href="/">Home</a>
    <a href="/library/">Library</a>
    <a href="/wiki/">Wiki</a>
    <a href="/about/">About</a>
    <a href="/account/">Account</a>
  </div>
</nav>

<main>
  {{ content | safe }}
</main>

<footer class="site-footer" role="contentinfo">
  <div class="container">
    <div class="footer-row">
      <div class="footer-rule"></div>
      <span class="footer-rune" aria-hidden="true">⬡</span>
      <span class="footer-brand">Lore Universe</span>
      <span class="footer-rune" aria-hidden="true">⬡</span>
      <div class="footer-rule"></div>
    </div>
    <p class="footer-copy">&copy; 2025 Lore Universe. All rights reserved.</p>
  </div>
</footer>

<script>
  (function () {
    var btn  = document.getElementById('nav-menu-btn');
    var menu = document.getElementById('nav-mobile');
    if (!btn || !menu) return;
    btn.addEventListener('click', function () {
      var open = menu.classList.toggle('nav-mobile--open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    document.addEventListener('click', function (e) {
      if (!e.target.closest('.nav')) {
        menu.classList.remove('nav-mobile--open');
        btn.setAttribute('aria-expanded', 'false');
      }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        menu.classList.remove('nav-mobile--open');
        btn.setAttribute('aria-expanded', 'false');
      }
    });
  })();
</script>

<script type="module" src="/assets/js/auth.js"></script>

</body>
</html>
```

- [ ] **Step 2: Build and spot-check**

```bash
cd frontend && npm run build
```
Open `frontend/_site/index.html` in a browser or check it renders — should show V2 nav and footer.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/_includes/base.njk
git commit -m "feat: update base.njk with V2 glass nav and footer"
```

---

## Task 5: reader-layout.njk

**Files:**
- Create: `frontend/src/_includes/reader-layout.njk`

- [ ] **Step 1: Create reader-layout.njk**

```njk
{#
  reader-layout.njk — V2
  Standalone layout for chapter reader pages.
  Extends nothing — no base.njk header/footer.
  Loads reader.css (which imports tokens.css) and reader.js.
  Anti-FOUC: applies saved lr-reader-theme before first paint.
#}
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{ title }} | Lore Universe</title>
  <link rel="stylesheet" href="/assets/css/reader.css">
  <script>
    (function () {
      var t = localStorage.getItem('lr-reader-theme') || 'dark';
      document.documentElement.dataset.readerTheme = t;
    })();
  </script>
</head>
<body>
<div class="reader-wrap" id="reader-wrap">
  {{ content | safe }}
</div>
<script src="/assets/js/reader.js" defer></script>
</body>
</html>
```

- [ ] **Step 2: Build**

```bash
cd frontend && npm run build
```
Expected: clean build. (reader-layout.njk not used by anything yet — that's fine.)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/_includes/reader-layout.njk
git commit -m "feat: add standalone reader-layout.njk"
```

---

## Task 6: .eleventy.js — getPrevNext Filter

**Files:**
- Modify: `frontend/.eleventy.js`

- [ ] **Step 1: Add getPrevNext filter**

Open `frontend/.eleventy.js`. After the `slugify` filter block (around line 124), add:

```js
  // getPrevNext: given a collection and the current page URL,
  // returns { prev, next } page objects (or null if at the boundary).
  // Used in chapter.njk to render the Prev/Next top bar buttons.
  eleventyConfig.addFilter("getPrevNext", function(collection, url) {
    const idx = collection.findIndex(c => c.url === url);
    return {
      prev: idx > 0 ? collection[idx - 1] : null,
      next: idx < collection.length - 1 ? collection[idx + 1] : null,
    };
  });
```

- [ ] **Step 2: Build**

```bash
cd frontend && npm run build
```
Expected: clean build.

- [ ] **Step 3: Commit**

```bash
git add frontend/.eleventy.js
git commit -m "feat: add getPrevNext filter for chapter pagination"
```

---

## Task 7: chapter.njk — V2 Reader Layout

**Files:**
- Modify: `frontend/src/_includes/chapter.njk`

The chapter layout switches from extending `base.njk` to `reader-layout.njk`, adds the V2 reader top bar (Back/Prev/Next/Settings), and wraps prose in `.reader-prose`.

- [ ] **Step 1: Replace chapter.njk**

```njk
---
layout: reader-layout.njk
---
{#
  chapter.njk — V2
  Layout for chapter pages. Extends reader-layout.njk.

  Expected front matter:
    title, chapter_number, arc, publication_date, summary, wiki_links

  Top bar buttons:
    Back → book chapter listing (/library/books/book1/chapters/)
    Prev → previous chapter (hidden if none)
    Next → next chapter (hidden if none)
    Settings → opens settings popover

  Font size: S/M/L buttons set --reader-font-size on .reader-prose via JS.
  Wiki links: Show/Hide toggle controls .wiki-link visibility in .reader-prose.
  Theme: Dark/Light toggle sets data-reader-theme on .reader-wrap.
  All state persists to localStorage.
#}

{% set chapNav = collections.chapters | getPrevNext(page.url) %}

<div class="reader-bar" role="toolbar" aria-label="Reader controls">

  <div class="reader-bar-left">
    <a class="reader-btn" href="/library/books/book1/chapters/" aria-label="Back to chapter list">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
        <polyline points="9 22 9 12 15 12 15 22"/>
      </svg>
      <span class="reader-btn-label">Library</span>
    </a>

    {% if chapNav.prev %}
    <a class="reader-btn" href="{{ chapNav.prev.url }}" aria-label="Previous chapter: {{ chapNav.prev.data.title }}">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M19 12H5M12 19l-7-7 7-7"/>
      </svg>
      <span class="reader-btn-label">Prev</span>
    </a>
    {% endif %}

    {% if chapNav.next %}
    <a class="reader-btn" href="{{ chapNav.next.url }}" aria-label="Next chapter: {{ chapNav.next.data.title }}">
      <span class="reader-btn-label">Next</span>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M5 12h14M12 5l7 7-7 7"/>
      </svg>
    </a>
    {% endif %}
  </div>

  <div class="reader-bar-right">
    <div class="reader-settings-anchor">
      <button class="reader-btn" id="reader-settings-btn"
        aria-label="Reading settings"
        aria-expanded="false"
        aria-controls="reader-settings">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
        </svg>
        <span class="reader-btn-label">Settings</span>
      </button>

      <div class="reader-settings" id="reader-settings"
        role="dialog" aria-modal="true" aria-label="Reading settings">

        <div class="reader-settings-row">
          <span class="reader-settings-label">Font size</span>
          <div class="reader-toggle-group" role="group" aria-label="Font size">
            <button class="reader-toggle-btn" data-font-size="sm" aria-pressed="false" aria-label="Small">S</button>
            <button class="reader-toggle-btn" data-font-size="md" aria-pressed="false" aria-label="Medium">M</button>
            <button class="reader-toggle-btn" data-font-size="lg" aria-pressed="false" aria-label="Large">L</button>
          </div>
        </div>

        <div class="reader-settings-row">
          <span class="reader-settings-label">Wiki links</span>
          <div class="reader-toggle-group" role="group" aria-label="Wiki links visibility">
            <button class="reader-toggle-btn" data-wiki-links-btn="show" aria-pressed="false">Show</button>
            <button class="reader-toggle-btn" data-wiki-links-btn="hide" aria-pressed="false">Hide</button>
          </div>
        </div>

        <div class="reader-settings-row">
          <span class="reader-settings-label">Theme</span>
          <div class="reader-toggle-group" role="group" aria-label="Reader theme">
            <button class="reader-toggle-btn" data-theme-btn="dark"  aria-pressed="false">Dark</button>
            <button class="reader-toggle-btn" data-theme-btn="light" aria-pressed="false">Light</button>
          </div>
        </div>

      </div>
    </div>
  </div>

</div>

<div class="reader-prose-wrap">
  <article class="reader-prose" id="reader-prose">

    <header class="reader-chapter-header">
      {% if arc %}<p class="reader-arc">{{ arc }}</p>{% endif %}
      <p class="reader-chapter-num">Chapter {{ chapter_number }}</p>
      <h1 class="reader-chapter-title">{{ title }}</h1>
      {% if publication_date %}<p class="reader-chapter-date">{{ publication_date | readableDate }}</p>{% endif %}
      {% if summary %}<p class="reader-chapter-summary">{{ summary }}</p>{% endif %}
    </header>

    <section data-wiki-links="{{ wiki_links }}">
      {{ content | safe }}
    </section>

  </article>

  <nav class="reader-pagination" aria-label="Chapter navigation">
    {% if chapNav.prev %}
    <a class="btn-secondary" href="{{ chapNav.prev.url }}"
      aria-label="Previous: {{ chapNav.prev.data.title }}">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
      Previous
    </a>
    {% endif %}
    {% if chapNav.next %}
    <a class="btn-secondary" href="{{ chapNav.next.url }}"
      aria-label="Next: {{ chapNav.next.data.title }}">
      Next
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
    </a>
    {% endif %}
  </nav>
</div>
```

- [ ] **Step 2: Build**

```bash
cd frontend && npm run build
```
Expected: clean build. Check `frontend/_site/library/books/book1/chapters/test-chapter/index.html` — should contain reader-bar and reader-prose markup, NOT the site nav/footer.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/_includes/chapter.njk
git commit -m "feat: update chapter.njk to V2 reader layout"
```

---

## Task 8: reader.js Rewrite

**Files:**
- Rewrite: `frontend/src/assets/js/reader.js`

- [ ] **Step 1: Replace reader.js**

```js
(function () {
  'use strict';

  var PROSE      = null; // set on DOMContentLoaded
  var WRAP       = null;
  var SIZE_KEY   = 'lr-font-size';
  var WIKI_KEY   = 'lr-wiki-links';
  var THEME_KEY  = 'lr-reader-theme';

  var FONT_SIZES = { sm: '15px', md: '18px', lg: '22px' };

  // ---- Font size -------------------------------------------------------
  function setFontSize(size) {
    if (!FONT_SIZES[size]) return;
    if (PROSE) PROSE.style.setProperty('--reader-font-size', FONT_SIZES[size]);
    localStorage.setItem(SIZE_KEY, size);
    document.querySelectorAll('[data-font-size]').forEach(function (btn) {
      btn.setAttribute('aria-pressed', btn.dataset.fontSize === size ? 'true' : 'false');
    });
  }

  // ---- Wiki links -------------------------------------------------------
  function setWikiLinks(show) {
    var prose = PROSE || document.querySelector('.reader-prose');
    if (prose) {
      var section = prose.querySelector('[data-wiki-links]');
      if (section) section.dataset.wikiLinks = show ? 'true' : 'false';
    }
    localStorage.setItem(WIKI_KEY, show ? 'true' : 'false');
    document.querySelectorAll('[data-wiki-links-btn]').forEach(function (btn) {
      btn.setAttribute('aria-pressed', btn.dataset.wikiLinksBtn === (show ? 'show' : 'hide') ? 'true' : 'false');
    });
  }

  // ---- Theme -----------------------------------------------------------
  function setTheme(theme) {
    if (WRAP) WRAP.dataset.readerTheme = theme;
    document.documentElement.dataset.readerTheme = theme;
    localStorage.setItem(THEME_KEY, theme);
    document.querySelectorAll('[data-theme-btn]').forEach(function (btn) {
      btn.setAttribute('aria-pressed', btn.dataset.themeBtn === theme ? 'true' : 'false');
    });
  }

  // ---- Settings popover -----------------------------------------------
  function openSettings() {
    var popover = document.getElementById('reader-settings');
    var btn     = document.getElementById('reader-settings-btn');
    if (!popover || !btn) return;
    popover.classList.add('reader-settings--open');
    btn.setAttribute('aria-expanded', 'true');
    // Move focus to first button in popover
    var first = popover.querySelector('button');
    if (first) first.focus();
  }

  function closeSettings() {
    var popover = document.getElementById('reader-settings');
    var btn     = document.getElementById('reader-settings-btn');
    if (!popover) return;
    popover.classList.remove('reader-settings--open');
    if (btn) btn.setAttribute('aria-expanded', 'false');
    if (btn) btn.focus();
  }

  function isSettingsOpen() {
    var popover = document.getElementById('reader-settings');
    return popover && popover.classList.contains('reader-settings--open');
  }

  // Focus trap inside settings dialog
  function trapFocus(e) {
    if (!isSettingsOpen()) return;
    var popover  = document.getElementById('reader-settings');
    if (!popover) return;
    var focusable = Array.from(popover.querySelectorAll('button, [href], input, [tabindex]:not([tabindex="-1"])'));
    if (!focusable.length) return;
    var first = focusable[0];
    var last  = focusable[focusable.length - 1];
    if (e.key === 'Tab') {
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
  }

  // ---- Sync state to UI -----------------------------------------------
  function syncState() {
    var size  = localStorage.getItem(SIZE_KEY)  || 'md';
    var wiki  = localStorage.getItem(WIKI_KEY);
    var theme = localStorage.getItem(THEME_KEY) || 'dark';
    var showWiki = wiki !== 'false';

    setFontSize(size);
    setWikiLinks(showWiki);
    setTheme(theme);
  }

  // ---- Init -----------------------------------------------------------
  document.addEventListener('DOMContentLoaded', function () {
    PROSE = document.getElementById('reader-prose');
    WRAP  = document.getElementById('reader-wrap');

    syncState();

    // Delegated click handler
    document.addEventListener('click', function (e) {
      // Font size
      var sizeBtn = e.target.closest('[data-font-size]');
      if (sizeBtn) { setFontSize(sizeBtn.dataset.fontSize); return; }

      // Wiki links
      var wikiBtn = e.target.closest('[data-wiki-links-btn]');
      if (wikiBtn) { setWikiLinks(wikiBtn.dataset.wikiLinksBtn === 'show'); return; }

      // Theme
      var themeBtn = e.target.closest('[data-theme-btn]');
      if (themeBtn) { setTheme(themeBtn.dataset.themeBtn); return; }

      // Settings toggle
      if (e.target.closest('#reader-settings-btn')) {
        if (isSettingsOpen()) closeSettings(); else openSettings();
        return;
      }

      // Click outside settings — close
      if (isSettingsOpen() && !e.target.closest('#reader-settings') && !e.target.closest('#reader-settings-btn')) {
        closeSettings();
      }
    });

    // Keyboard: Escape closes settings
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && isSettingsOpen()) { closeSettings(); return; }
      trapFocus(e);
    });
  });
})();
```

- [ ] **Step 2: Build and verify**

```bash
cd frontend && npm run build
```
Open the test chapter in a browser (serve with `npm start`). Verify:
- Top bar appears at the top
- Settings button opens popover
- S/M/L changes prose font size
- Dark/Light toggles background
- Escape closes popover

- [ ] **Step 3: Commit**

```bash
git add frontend/src/assets/js/reader.js
git commit -m "feat: rewrite reader.js for V2 settings popover and scoped theme"
```

---

## Task 9: index.njk — V2 Homepage

**Files:**
- Create: `frontend/src/index.njk`
- Delete: `frontend/src/index.md`

- [ ] **Step 1: Create index.njk**

```njk
---
title: Home
layout: base.njk
permalink: /
---
{#
  index.njk — V2 Homepage

  Data sources:
  - Now Reading: most recent chapter by publication_date from collections.chapters
  - World Entries: first 5 entries from wiki.entries (API data)
#}

{# Find the most recently published chapter #}
{% set latestChapter = null %}
{% for ch in collections.chapters | sort(false, false, "data.publication_date") | reverse %}
  {% if loop.first %}{% set latestChapter = ch %}{% endif %}
{% endfor %}

{# Hero #}
<section class="hero" aria-labelledby="hero-heading">
  <div class="starfield" aria-hidden="true"></div>

  <p class="hero-eyebrow" aria-hidden="true">Serialized Fiction &amp; World Compendium</p>

  <h1 class="hero-title" id="hero-heading">
    Lore
    <span class="hero-title-gold">Universe</span>
  </h1>

  <p class="hero-subtitle">An Infinite Cosmic Expanse</p>

  <div class="arcane-divider" aria-hidden="true">
    <span class="arcane-glyph">⬡ ◆ ⬡</span>
  </div>

  <p class="hero-lead">
    Across a cosmos without limit, every path to power awaits its seeker.
    The arcane and the mechanical are not opposites —
    they are two hands of the same reaching grasp.
  </p>

  <div class="hero-ctas">
    <a class="btn-primary" href="/library/">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
      </svg>
      Begin Reading
    </a>
    <a class="btn-secondary" href="/wiki/">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="11" cy="11" r="8"/>
        <path d="m21 21-4.35-4.35"/>
      </svg>
      Browse the Compendium
    </a>
  </div>

  <div class="scroll-cue" aria-hidden="true">
    <div class="scroll-line"></div>
    <span>Explore</span>
  </div>
</section>

{# Paths of Power #}
<section class="explore" aria-labelledby="explore-heading">
  <div class="container">
    <div class="s-divider">
      <div class="s-divider-label">
        <span class="s-divider-rune" aria-hidden="true">◆</span>
        Paths of Power
        <span class="s-divider-rune" aria-hidden="true">◆</span>
      </div>
    </div>
    <div class="s-header">
      <p class="s-label">Choose your path</p>
      <h2 class="s-title" id="explore-heading">Enter the Universe</h2>
    </div>

    <div class="explore-grid">

      <a class="explore-card explore-card--blue" href="/library/" aria-label="Library — The Novels">
        <svg class="card-icon" viewBox="0 0 40 40" fill="none" aria-hidden="true">
          <rect x="5" y="5" width="30" height="30" rx="3" stroke="rgba(56,189,248,0.25)" stroke-width="1"/>
          <path d="M11 13h18M11 19h18M11 25h11" stroke="rgba(56,189,248,0.7)" stroke-width="1.5" stroke-linecap="round"/>
          <circle cx="31" cy="27" r="5.5" fill="rgba(56,189,248,0.1)" stroke="rgba(56,189,248,0.5)" stroke-width="1"/>
          <path d="M29.2 27l1.4 1.4 2.8-2.8" stroke="rgba(56,189,248,0.9)" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <div class="card-tag">Library · The Novels</div>
        <h3 class="card-title">The Serialized Story</h3>
        <p class="card-desc">Follow the serialized fiction from the beginning. New chapters, living worlds, and the ever-expanding scope of a universe in motion.</p>
        <div class="card-arrow">
          Enter the Library
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
        </div>
      </a>

      <a class="explore-card explore-card--gold" href="/wiki/" aria-label="Compendium — The Wiki">
        <svg class="card-icon" viewBox="0 0 40 40" fill="none" aria-hidden="true">
          <path d="M20 3 L35.5 12 L35.5 30 L20 39 L4.5 30 L4.5 12 Z" stroke="rgba(245,158,11,0.25)" stroke-width="1" fill="none"/>
          <circle cx="20" cy="21" r="6.5" stroke="rgba(245,158,11,0.55)" stroke-width="1" fill="rgba(245,158,11,0.06)"/>
          <path d="M20 14.5v-3M20 30.5v-3M13.5 21h-3M29.5 21h-3" stroke="rgba(245,158,11,0.45)" stroke-width="1" stroke-linecap="round"/>
          <circle cx="20" cy="21" r="2.25" fill="rgba(245,158,11,0.85)"/>
        </svg>
        <div class="card-tag">Compendium · The Wiki</div>
        <h3 class="card-title">The World Compendium</h3>
        <p class="card-desc">Characters, factions, locations, mechanics, and the esoteric laws governing existence. Every facet of the universe, documented.</p>
        <div class="card-arrow">
          Open the Compendium
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
        </div>
      </a>

      <a class="explore-card explore-card--violet" href="/about/" aria-label="About — The Project">
        <svg class="card-icon" viewBox="0 0 40 40" fill="none" aria-hidden="true">
          <circle cx="20" cy="20" r="15" stroke="rgba(192,132,252,0.15)" stroke-width="1"/>
          <circle cx="20" cy="20" r="9"  stroke="rgba(192,132,252,0.3)"  stroke-width="1"/>
          <circle cx="20" cy="20" r="3.5" fill="rgba(192,132,252,0.7)"/>
          <path d="M20 5v4M20 31v4M5 20h4M31 20h4" stroke="rgba(192,132,252,0.28)" stroke-width="1" stroke-linecap="round"/>
          <path d="M9.4 9.4l2.8 2.8M27.8 27.8l2.8 2.8M9.4 30.6l2.8-2.8M27.8 12.2l2.8-2.8"
            stroke="rgba(192,132,252,0.2)" stroke-width="1" stroke-linecap="round"/>
        </svg>
        <div class="card-tag">About · The Project</div>
        <h3 class="card-title">The Lore Universe Project</h3>
        <p class="card-desc">Where arcane and technology fuse into something neither tradition could achieve alone. The project, its direction, its vision.</p>
        <div class="card-arrow">
          Learn More
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
        </div>
      </a>

    </div>
  </div>
</section>

{# Now Reading #}
<section class="chapter-wrap" aria-labelledby="chapter-heading">
  <div class="container">
    <div class="s-divider">
      <div class="s-divider-label">
        <span class="s-divider-rune" aria-hidden="true">◆</span>
        Now Reading
        <span class="s-divider-rune" aria-hidden="true">◆</span>
      </div>
    </div>

    {% if latestChapter %}
    <div class="chapter-card">
      <div>
        <div class="chapter-meta">
          <span class="chapter-chip">Chapter {{ latestChapter.data.chapter_number | string | padStart(2, '0') }}</span>
          {% if latestChapter.data.arc %}<span class="chapter-book">{{ latestChapter.data.arc }}</span>{% endif %}
        </div>
        <h2 class="chapter-title" id="chapter-heading">{{ latestChapter.data.title }}</h2>
        {% if latestChapter.data.summary %}
        <p class="chapter-excerpt">{{ latestChapter.data.summary }}</p>
        {% endif %}
      </div>
      <div style="flex-shrink:0">
        <a class="btn-secondary" href="{{ latestChapter.url }}">Start Reading</a>
      </div>
    </div>
    {% else %}
    <div class="chapter-card">
      <div>
        <div class="chapter-meta">
          <span class="chapter-chip">Coming Soon</span>
        </div>
        <h2 class="chapter-title" id="chapter-heading">The story is being written.</h2>
        <p class="chapter-excerpt">The first chapter of the Lorekeeper series is on its way.</p>
      </div>
      <div style="flex-shrink:0">
        <a class="btn-secondary" href="/library/">Visit Library</a>
      </div>
    </div>
    {% endif %}
  </div>
</section>

{# World Entries #}
<section class="wiki-wrap" aria-labelledby="wiki-heading">
  <div class="container">
    <div class="s-divider">
      <div class="s-divider-label">
        <span class="s-divider-rune" aria-hidden="true">◆</span>
        From the Compendium
        <span class="s-divider-rune" aria-hidden="true">◆</span>
      </div>
    </div>
    <div class="wiki-header">
      <h2 class="wiki-heading" id="wiki-heading">World Entries</h2>
      <a class="wiki-view-all" href="/wiki/">View All</a>
    </div>

    {% if wiki.entries and wiki.entries.length %}
    <div class="wiki-grid">
      {% for entry in wiki.entries | slice(0, 5) %}
      <a class="wiki-card" href="{{ site.modules.wiki.root }}/{{ entry.category }}/{{ entry.slug }}/">
        <div class="wiki-cat">{{ entry.category | replace("-", " ") | title }}</div>
        <h3 class="wiki-entry-title">{{ entry.name }}</h3>
        {% if entry.description %}
        <p class="wiki-entry-desc">{{ entry.description | truncate(100) }}</p>
        {% endif %}
      </a>
      {% endfor %}
      <a class="wiki-card wiki-card--more" href="/wiki/" aria-label="View all wiki entries">
        <div class="wiki-cat" style="color:var(--text-muted)">Compendium</div>
        <p class="wiki-entry-title" style="color:var(--text-secondary)">Explore All Entries</p>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(192,132,252,0.5)" stroke-width="1.5" stroke-linecap="round" aria-hidden="true">
          <path d="M5 12h14M12 5l7 7-7 7"/>
        </svg>
      </a>
    </div>
    {% else %}
    <div class="wiki-grid">
      <a class="wiki-card wiki-card--more" href="/wiki/" aria-label="Browse the wiki"
        style="grid-column: 1 / -1; min-height: 180px;">
        <div class="wiki-cat" style="color:var(--text-muted)">Compendium</div>
        <p class="wiki-entry-title" style="color:var(--text-secondary)">World entries coming soon</p>
        <p class="wiki-entry-desc" style="color:var(--text-muted); font-size:0.78rem; margin-top:0.25rem;">Browse the wiki to see what's available.</p>
      </a>
    </div>
    {% endif %}

  </div>
</section>
```

- [ ] **Step 2: Delete index.md**

```bash
rm frontend/src/index.md
```

- [ ] **Step 3: Build**

```bash
cd frontend && npm run build
```
Expected: clean build. Homepage at `_site/index.html` should have V2 hero, explore cards, chapter teaser, wiki preview sections.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/index.njk
git rm frontend/src/index.md
git commit -m "feat: replace index.md with V2 Nunjucks homepage"
```

---

## Task 10: Wiki Hub (wiki/index.njk)

**Files:**
- Create: `frontend/src/wiki/index.njk`
- Delete: `frontend/src/wiki/index.md`

- [ ] **Step 1: Create wiki/index.njk**

```njk
---
title: Wiki
layout: base.njk
permalink: /wiki/
---
{#
  wiki/index.njk — V2 Wiki Hub

  Shows six category cards with live entry counts from wiki.byCategory.
#}

<div class="wiki-hub">
  <div class="container">

    <div class="wiki-hub-header">
      <p class="wiki-hub-eyebrow">The Compendium</p>
      <h1 class="wiki-hub-title">Lore Universe Wiki</h1>
      <p class="wiki-hub-lead">
        Characters, factions, locations, mechanics, lore, and the systems that govern existence.
        Every facet of the universe, documented.
      </p>
    </div>

    <div class="wiki-hub-grid explore-grid">

      {# Characters #}
      <a class="explore-card explore-card--blue" href="/wiki/characters/"
        aria-label="Browse Characters">
        <svg class="card-icon" viewBox="0 0 40 40" fill="none" aria-hidden="true">
          <circle cx="20" cy="14" r="6" stroke="rgba(56,189,248,0.6)" stroke-width="1.2" fill="rgba(56,189,248,0.08)"/>
          <path d="M8 34c0-6.627 5.373-12 12-12s12 5.373 12 12" stroke="rgba(56,189,248,0.5)" stroke-width="1.2" stroke-linecap="round"/>
        </svg>
        <div class="card-tag">Characters</div>
        <h3 class="card-title">People &amp; Beings</h3>
        <p class="card-desc">Backgrounds, abilities, allegiances, and histories of those who walk the universe.</p>
        <div class="card-arrow">
          {% if wiki.byCategory['characters'] %}{{ wiki.byCategory['characters'].length }} entries{% else %}Browse{% endif %}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
        </div>
      </a>

      {# Lore Traits #}
      <a class="explore-card explore-card--violet" href="/wiki/lore-traits/"
        aria-label="Browse Lore Traits">
        <svg class="card-icon" viewBox="0 0 40 40" fill="none" aria-hidden="true">
          <circle cx="20" cy="20" r="9" stroke="rgba(192,132,252,0.5)" stroke-width="1.2" fill="rgba(192,132,252,0.07)"/>
          <circle cx="20" cy="20" r="3" fill="rgba(192,132,252,0.8)"/>
          <path d="M20 7v4M20 29v4M7 20h4M29 20h4" stroke="rgba(192,132,252,0.35)" stroke-width="1" stroke-linecap="round"/>
        </svg>
        <div class="card-tag">Lore Traits</div>
        <h3 class="card-title">The Magic System</h3>
        <p class="card-desc">Traits characters possess, their subtypes, and the abilities they unlock across the cosmos.</p>
        <div class="card-arrow">
          {% if wiki.byCategory['lore-traits'] %}{{ wiki.byCategory['lore-traits'].length }} entries{% else %}Browse{% endif %}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
        </div>
      </a>

      {# Mechanics #}
      <a class="explore-card explore-card--gold" href="/wiki/mechanics/"
        aria-label="Browse Mechanics">
        <svg class="card-icon" viewBox="0 0 40 40" fill="none" aria-hidden="true">
          <circle cx="20" cy="20" r="7" stroke="rgba(245,158,11,0.55)" stroke-width="1.2" fill="rgba(245,158,11,0.07)"/>
          <path d="M20 5v5M20 30v5M5 20h5M30 20h5M9.4 9.4l3.5 3.5M27.1 27.1l3.5 3.5M9.4 30.6l3.5-3.5M27.1 12.9l3.5-3.5"
            stroke="rgba(245,158,11,0.35)" stroke-width="1" stroke-linecap="round"/>
        </svg>
        <div class="card-tag">Mechanics</div>
        <h3 class="card-title">Rules &amp; Systems</h3>
        <p class="card-desc">The fundamental rules and systems that govern all of the Lore Universe.</p>
        <div class="card-arrow">
          {% if wiki.byCategory['mechanics'] %}{{ wiki.byCategory['mechanics'].length }} entries{% else %}Browse{% endif %}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
        </div>
      </a>

      {# Locations #}
      <a class="explore-card explore-card--blue" href="/wiki/locations/"
        aria-label="Browse Locations">
        <svg class="card-icon" viewBox="0 0 40 40" fill="none" aria-hidden="true">
          <path d="M20 4C14.477 4 10 8.477 10 14c0 8 10 22 10 22s10-14 10-22c0-5.523-4.477-10-10-10z"
            stroke="rgba(56,189,248,0.55)" stroke-width="1.2" fill="rgba(56,189,248,0.07)"/>
          <circle cx="20" cy="14" r="3" fill="rgba(56,189,248,0.75)"/>
        </svg>
        <div class="card-tag">Locations</div>
        <h3 class="card-title">Places &amp; Worlds</h3>
        <p class="card-desc">Cities, regions, planets, dimensions — every significant place in the cosmos.</p>
        <div class="card-arrow">
          {% if wiki.byCategory['locations'] %}{{ wiki.byCategory['locations'].length }} entries{% else %}Browse{% endif %}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
        </div>
      </a>

      {# Factions #}
      <a class="explore-card explore-card--gold" href="/wiki/factions/"
        aria-label="Browse Factions">
        <svg class="card-icon" viewBox="0 0 40 40" fill="none" aria-hidden="true">
          <path d="M20 6l2.5 7.5H30l-6 4.4 2.3 7-6.3-4.6-6.3 4.6 2.3-7-6-4.4h7.5z"
            stroke="rgba(245,158,11,0.55)" stroke-width="1.2" fill="rgba(245,158,11,0.07)" stroke-linejoin="round"/>
        </svg>
        <div class="card-tag">Factions</div>
        <h3 class="card-title">Organizations &amp; Orders</h3>
        <p class="card-desc">Governments, guilds, cults, and the groups whose ambitions shape the universe.</p>
        <div class="card-arrow">
          {% if wiki.byCategory['factions'] %}{{ wiki.byCategory['factions'].length }} entries{% else %}Browse{% endif %}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
        </div>
      </a>

      {# Lore #}
      <a class="explore-card explore-card--violet" href="/wiki/lore/"
        aria-label="Browse Lore">
        <svg class="card-icon" viewBox="0 0 40 40" fill="none" aria-hidden="true">
          <path d="M8 8h24v24H8z" stroke="rgba(192,132,252,0.25)" stroke-width="1" fill="none" rx="2"/>
          <path d="M13 15h14M13 20h14M13 25h8" stroke="rgba(192,132,252,0.65)" stroke-width="1.4" stroke-linecap="round"/>
        </svg>
        <div class="card-tag">Lore</div>
        <h3 class="card-title">History &amp; Myth</h3>
        <p class="card-desc">The histories, myths, and foundational events that shaped everything that came after.</p>
        <div class="card-arrow">
          {% if wiki.byCategory['lore'] %}{{ wiki.byCategory['lore'].length }} entries{% else %}Browse{% endif %}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
        </div>
      </a>

    </div>

  </div>
</div>
```

- [ ] **Step 2: Delete wiki/index.md**

```bash
rm frontend/src/wiki/index.md
```

- [ ] **Step 3: Build**

```bash
cd frontend && npm run build
```
Expected: clean build. `_site/wiki/index.html` should have six category cards.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/wiki/index.njk
git rm frontend/src/wiki/index.md
git commit -m "feat: replace wiki/index.md with V2 wiki hub template"
```

---

## Task 11: wiki-category.njk + Update Category Index Files

**Files:**
- Create: `frontend/src/_includes/wiki-category.njk`
- Modify: `frontend/src/wiki/characters/index.md`
- Modify: `frontend/src/wiki/lore-traits/index.md`
- Modify: `frontend/src/wiki/mechanics/index.md`
- Modify: `frontend/src/wiki/locations/index.md`
- Modify: `frontend/src/wiki/factions/index.md`
- Modify: `frontend/src/wiki/lore/index.md`

- [ ] **Step 1: Create wiki-category.njk**

```njk
{#
  wiki-category.njk — V2
  Shared layout for all six wiki category listing pages.
  Extends base.njk.

  Required front matter on the category index.md:
    title:        "Characters"   (display name)
    category_key: "characters"   (matches wiki.byCategory key and folder name)
    layout:       "wiki-category.njk"
    permalink:    "/wiki/characters/"

  Entry data comes from wiki.byCategory[category_key] (API-backed build data).
  If the API is unavailable at build time, falls back to an empty state.
#}
---
layout: base.njk
---

{% set entries = wiki.byCategory[category_key] %}
{% set entryCount = entries.length if entries else 0 %}

<div class="wiki-category">
  <div class="container">

    <div class="wiki-category-header">
      <a class="wiki-category-back" href="/wiki/">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true">
          <path d="M19 12H5M12 19l-7-7 7-7"/>
        </svg>
        Wiki
      </a>
      <h1 class="wiki-category-title">{{ title }}</h1>
      <p class="wiki-category-count">
        {% if entryCount %}{{ entryCount }} {% if entryCount == 1 %}entry{% else %}entries{% endif %}{% else %}No entries yet{% endif %}
      </p>
    </div>

    {% if entries and entries.length %}
    <div class="wiki-entry-grid">
      {% for entry in entries %}
      <a class="wiki-entry-card" href="{{ site.modules.wiki.root }}/{{ category_key }}/{{ entry.slug }}/">
        <span class="wiki-entry-card-badge">{{ title | truncate(12, true, '') }}</span>
        <p class="wiki-entry-card-name">{{ entry.name }}</p>
        {% if entry.description %}
        <p class="wiki-entry-card-desc">{{ entry.description | truncate(120) }}</p>
        {% endif %}
      </a>
      {% endfor %}
    </div>
    {% else %}
    <div class="wiki-empty">
      <p class="wiki-empty-text">No entries yet — sync wiki data and rebuild.</p>
    </div>
    {% endif %}

  </div>
</div>
```

- [ ] **Step 2: Update wiki/characters/index.md**

Replace entire file:

```markdown
---
title: Characters
layout: wiki-category.njk
permalink: /wiki/characters/
category_key: characters
---
```

- [ ] **Step 3: Update wiki/lore-traits/index.md**

```markdown
---
title: Lore Traits
layout: wiki-category.njk
permalink: /wiki/lore-traits/
category_key: lore-traits
---
```

- [ ] **Step 4: Update wiki/mechanics/index.md**

```markdown
---
title: Mechanics
layout: wiki-category.njk
permalink: /wiki/mechanics/
category_key: mechanics
---
```

- [ ] **Step 5: Update wiki/locations/index.md**

```markdown
---
title: Locations
layout: wiki-category.njk
permalink: /wiki/locations/
category_key: locations
---
```

- [ ] **Step 6: Update wiki/factions/index.md**

```markdown
---
title: Factions
layout: wiki-category.njk
permalink: /wiki/factions/
category_key: factions
---
```

- [ ] **Step 7: Update wiki/lore/index.md**

```markdown
---
title: Lore
layout: wiki-category.njk
permalink: /wiki/lore/
category_key: lore
---
```

- [ ] **Step 8: Build**

```bash
cd frontend && npm run build
```
Expected: clean build. `_site/wiki/characters/index.html` should show the V2 category layout (back-link, title, entry grid or empty state).

- [ ] **Step 9: Commit**

```bash
git add frontend/src/_includes/wiki-category.njk \
        frontend/src/wiki/characters/index.md \
        frontend/src/wiki/lore-traits/index.md \
        frontend/src/wiki/mechanics/index.md \
        frontend/src/wiki/locations/index.md \
        frontend/src/wiki/factions/index.md \
        frontend/src/wiki/lore/index.md
git commit -m "feat: add wiki-category layout and update category index pages"
```

---

## Task 12: wiki-entry.njk Update + Cleanup

**Files:**
- Modify: `frontend/src/_includes/wiki-entry.njk`
- Delete: `frontend/src/design-preview.html`

- [ ] **Step 1: Replace wiki-entry.njk**

```njk
{#
  wiki-entry.njk — V2
  Fallback layout for wiki entry pages that don't have a
  more specific per-category template (character.njk, etc.).
  Extends base.njk.

  Expected front matter: name
#}
---
layout: base.njk
---

<div class="wiki-entry-page">
  <div class="wiki-entry-page-inner">

    <a class="wiki-entry-page-back" href="/wiki/">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true">
        <path d="M19 12H5M12 19l-7-7 7-7"/>
      </svg>
      Wiki
    </a>

    <div class="wiki-entry-page-badge">Entry</div>

    <h1 class="wiki-entry-page-title">{{ name }}</h1>

    <div class="wiki-entry-page-prose">
      {{ content | safe }}
    </div>

  </div>
</div>
```

- [ ] **Step 2: Delete design-preview.html**

```bash
rm frontend/src/design-preview.html
```

- [ ] **Step 3: Build**

```bash
cd frontend && npm run build
```
Expected: clean build with no errors. `design-preview.html` should NOT appear in `_site/`.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/_includes/wiki-entry.njk
git rm frontend/src/design-preview.html
git commit -m "feat: update wiki-entry.njk to V2 and delete design-preview.html"
```

---

## Self-Review Checklist

After completing all tasks, verify these spec requirements are covered:

| Requirement | Task |
|---|---|
| `tokens.css` with full palette, fonts, motion, z-index, Google Fonts | Task 1 |
| `site.css` imports tokens, always dark, covers nav/footer/homepage/wiki | Task 2 |
| `reader.css` imports tokens, scoped to `.reader-wrap`, light/dark theme | Task 3 |
| `base.njk` loads `site.css`, V2 glass nav, footer, no anti-FOUC theme script | Task 4 |
| `reader-layout.njk` standalone, anti-FOUC for reader theme in `<head>` | Task 5 |
| `getPrevNext` filter for chapter pagination | Task 6 |
| `chapter.njk` uses `reader-layout.njk`, top bar with Back/Prev/Next/Settings | Task 7 |
| `reader.js` settings popover, font size → `.reader-prose`, wiki links, theme | Task 8 |
| Homepage with hero, paths of power, now reading (live), world entries (live) | Task 9 |
| Wiki hub with six category cards + live counts | Task 10 |
| `wiki-category.njk` shared layout, category index.md files updated | Task 11 |
| `wiki-entry.njk` expanded to V2, `design-preview.html` deleted | Task 12 |
| `index.md` deleted (replaced by `index.njk`) | Task 9 |
| `wiki/index.md` deleted (replaced by `wiki/index.njk`) | Task 10 |
| Font size scoped to `.reader-prose` via `--reader-font-size` CSS var | Tasks 3, 8 |
| Reader theme on `.reader-wrap` / `:root`, not `<html>` site-wide | Tasks 3, 8 |
| `lr-theme` key retired; reader uses `lr-reader-theme` | Task 8 |
| Settings popover: `role="dialog"`, `aria-modal`, focus trap, Escape closes | Task 8 |
| Prev/Next hidden with `hidden` attr when unavailable | Tasks 7 (uses `{% if %}`) |
| Mobile: labels hidden on ≤600px | Task 3 (`reader-btn-label`) |
