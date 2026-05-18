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

---

## 3. Folder Structure

```
lorekeeper/
├── src/
│   ├── _data/
│   │   └── config.js           # Site-wide settings (wikiLinksVisible toggle)
│   ├── _includes/              # Nunjucks layout templates
│   │   ├── base.njk            # Root layout (head, header, footer)
│   │   ├── wiki-entry.njk      # Generic wiki layout (fallback)
│   │   ├── character.njk       # Layout for character pages
│   │   ├── lore-trait.njk      # Layout for lore trait pages
│   │   ├── mechanic.njk        # Layout for mechanic pages
│   │   ├── location.njk        # Layout for location pages
│   │   ├── faction.njk         # Layout for faction pages
│   │   ├── lore.njk            # Layout for lore pages
│   │   └── chapter.njk         # Layout for novel chapter pages
│   ├── wiki/
│   │   ├── index.md            # Wiki landing page
│   │   ├── characters/         # One .md file per character
│   │   ├── lore-traits/        # One .md file per Lore Trait
│   │   ├── mechanics/          # One .md file per Mechanic
│   │   ├── locations/          # One .md file per Location
│   │   ├── factions/           # One .md file per Faction
│   │   └── lore/               # One .md file per Lore entry
│   ├── chapters/               # One .md file per novel chapter
│   └── index.md                # Homepage
├── scripts/
│   ├── create-structure.js     # One-time scaffold script (already run)
│   ├── migrate-obsidian.js     # Converts Obsidian notes to site format
│   ├── staging/                # Drop Obsidian .md files here before migrating
│   │   ├── characters/
│   │   ├── locations/
│   │   ├── factions/
│   │   ├── lore-traits/
│   │   ├── mechanics/
│   │   └── lore/
│   ├── converted/              # Output of migrate-obsidian.js (gitignored)
│   └── README.md               # Script usage instructions
├── .eleventy.js                # Eleventy configuration
├── .github/
│   └── workflows/
│       └── deploy.yml          # GitHub Actions deployment workflow
├── .gitignore
├── package.json
└── PROJECT_BRIEFING.md         # This file
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
- `{character|aldren|Aldren}` — links to the character entry with slug `aldren`, displays as "Aldren"
- `{location|the-shattered-reach|the Shattered Reach}` — links to a location entry

**Visibility toggle:**  
A site-wide setting in `src/_data/config.js` controls whether these render as visible hyperlinks or unstyled plain text. When invisible, the link exists in the HTML but has no visual indicator (no underline, no color change). The reader cannot tell the word is linked unless they hover or inspect.

```js
// src/_data/config.js
module.exports = {
  wikiLinksVisible: true  // set to false to hide all inline wiki links
};
```

### Obsidian Migration
The script `scripts/migrate-obsidian.js` converts Obsidian `[[double bracket]]` links to the `{category|slug|display}` syntax above.

**Workflow:**
1. Copy Obsidian `.md` files into the matching subfolder under `scripts/staging/` (e.g., character notes → `scripts/staging/characters/`)
2. Run: `node scripts/migrate-obsidian.js`
3. Find converted files in `scripts/converted/{category}/` — each has a minimal `name:` front matter field; fill in the remaining schema fields by hand
4. Copy the completed files into `src/wiki/{category}/`

The script builds a lookup index from both staging files and already-migrated `src/wiki/` entries. Unresolved links (page name not found in either source) are left unconverted and reported in the console output.

### Naming Conventions
- Entry filenames: lowercase, hyphen-separated (e.g., `aldren-voss.md`, `the-shattered-reach.md`)
- Slugs in cross-references match filenames without the `.md` extension
- Template files: camelCase or hyphen-separated `.njk` files in `_includes/`

---

## 6. Current State

*(Update this section at the end of every working session.)*

| Area | Status |
|---|---|
| GitHub repository | ✅ Created — https://github.com/LoreUniverse/loreuniverse.github.io |
| Local environment (Node, Git, VS Code) | ✅ Set up |
| Eleventy project initialized | ✅ Done |
| GitHub Actions deploy workflow | ✅ Done |
| Base templates (base.njk, wiki-entry.njk, chapter.njk) | ✅ Done |
| Per-category templates (character, faction, location, etc.) | ✅ Done |
| Wiki collections configured | ✅ Done (all 6 categories with .11tydata.json and index pages) |
| Obsidian migration script | ✅ Done (`scripts/migrate-obsidian.js`) |
| Wiki link processor | ✅ Done (built into `.eleventy.js`) |
| Homepage | ✅ Done (`src/index.md`) |
| Chapter listing page | ✅ Done (`src/chapters/index.md`) |
| Wiki populated with real entries | ⬜ Not started |
| Visual design / theme | ⬜ Not started (deferred) |

**Next planned step:** Use `scripts/migrate-obsidian.js` to populate the site with real wiki entries — copy Obsidian notes into `scripts/staging/{category}/`, run the script, fill in the remaining front matter fields on the converted files, then copy them into `src/wiki/{category}/`.

---

## 7. Pending Decisions

- [ ] Whether to implement per-reader wiki link toggle (button on page) in addition to site-wide toggle — deferred until after initial build
- [ ] Visual design and theme — explicitly deferred; do not design yet

---

## 8. Working Preferences

- Always explain what generated code does, even briefly — the owner is learning, not just copy-pasting
- Ask before making structural changes to the schema or folder layout
- When multiple approaches exist, briefly describe the tradeoff before recommending one
- Prefer generating complete, ready-to-use files over code snippets where possible
- Flag anything that will need to be manually updated after generation (e.g., placeholder values, version numbers)

---

## 9. Working Directory
- All work for this project will be done in `C:\Users\timmy\OneDrive\Desktop\LoreUniverse`

---

## 10. Future Scope

Ideas and architectural concerns captured here so the foundation can grow into them. Not being worked on now — the current focus is a foundational Novels module with one book and a working wiki.

### Architectural direction
- **Module-based URL structure.** The site will be reorganized into independent "modules" under the root domain:
  - `/` — Site hub (homepage with module access)
  - `/lorekeeper/` — Novels module landing page
  - `/lorekeeper/wiki/` — Wiki submodule
  - `/lorekeeper/book-1/chapters/chapter-XX` — Books submodule (per-book namespacing avoids chapter-number collisions across books)
  - Future modules might include `/game-resources/`, `/art/`, etc.
- **Base navbar:** Home, Novels, About — module-specific links live in module landing pages, not the global navbar.
- **Two-step navbar dropdown.** "Novels" in the navbar opens a small dropdown listing "Books landing" and "Wiki". The Books landing page itself lists individual books — no nested dropdowns.
- **Dropdown behavior:** click/tap to open, not hover. Hover dropdowns break on touch devices. A separate chevron/affordance handles the distinction between "go to landing page" vs. "expand menu."
- **Repo rename:** to host the site root at `loreuniverse.github.io`, the GitHub repo must be renamed to exactly `loreuniverse.github.io` (the GitHub org-page convention).
- **Shared design layer:** before the second landing page is built, extract reusable partials (hero, module card, footer) into `_includes/partials/` and define shared CSS variables for color/typography.

### Cross-module linking convention
- The current wiki link transform hardcodes `/lorekeeper/wiki/${category}/${slug}/`. This works for now because all custom links target wiki entries.
- Once links need to cross module boundaries (e.g., a wiki entry referencing a chapter, or a homepage tile linking into the wiki), introduce a single link-builder — a Nunjucks shortcode or Eleventy filter — that takes a logical reference like `{module: "lorekeeper", type: "chapter", book: 1, chapter: 3}` and returns the URL. One source of truth so URL changes don't require hunting through templates.
- Do NOT copy-paste the existing wiki link transform into other modules with hardcoded paths. When the second cross-module link target appears, that is the trigger to generalize.

### Authoring tooling
- **Automated chapter reference linker (Claude skill).** A skill that parses a chapter file's prose and automatically rewrites references to known wiki entities into the `{category|slug|display}` syntax — e.g., spotting a character's name in narration and wrapping it as `{character|aldren|Aldren}`. Acknowledged as ambitious because it requires real judgment:
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

### Discoverability mitigation (for when the module restructure happens)
The new structure buries wiki content two levels deep. The homepage and Novels landing page need to do real curatorial work to prevent visitors from missing the wiki's existence:
- Homepage: featured content tiles (latest chapter, featured character, recent wiki entries) — not just module buttons.
- Novels landing page: previews both submodules (latest chapter, popular wiki entries, content stats) — a real content page, not a routing intersection.
