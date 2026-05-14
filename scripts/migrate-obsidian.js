// =============================================================================
// migrate-obsidian.js
//
// Converts Obsidian [[double bracket]] links in wiki entry notes to the site's
// custom {category|slug|display} syntax, then writes the converted files to
// scripts/converted/ ready to be copied into src/wiki/{category}/.
//
// WORKFLOW
// --------
//   1. Copy the Obsidian .md files you want to migrate into the appropriate
//      subfolder under scripts/staging/:
//
//        scripts/staging/
//          characters/       <- character notes go here
//          locations/        <- location notes go here
//          factions/
//          lore-traits/
//          mechanics/
//          lore/
//
//      The subfolder name must exactly match the site category name.
//
//   2. Run: node scripts/migrate-obsidian.js
//
//   3. Find the converted files in scripts/converted/{category}/.
//      Each file has a minimal name: field in its front matter and its body
//      prose with [[links]] replaced. Add the remaining schema fields
//      (status, species, etc.) by hand before copying to the site.
//
//   4. Copy converted files into src/wiki/{category}/ in the site.
//
// LINK RESOLUTION
// ---------------
// The script builds an index of known entries from two sources:
//   - All .md files currently in scripts/staging/ subfolders
//   - All .md files already in src/wiki/ (previously migrated entries)
//
// A [[link]] is resolved if the linked page name is found in the index.
// Unresolved links are left unconverted and reported in the output so you
// know what still needs attention.
//
// LINK FORMATS SUPPORTED
//   [[Page Name]]           -> {category|slug|Page Name}
//   [[Page Name|Alias]]     -> {category|slug|Alias}
// =============================================================================

const fs   = require("fs");
const path = require("path");

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const SCRIPT_DIR   = __dirname;
const SITE_ROOT    = path.resolve(SCRIPT_DIR, "..");
const STAGING_DIR  = path.join(SCRIPT_DIR, "staging");
const CONVERTED_DIR = path.join(SCRIPT_DIR, "converted");
const WIKI_DIR     = path.join(SITE_ROOT, "src", "wiki");

const CATEGORIES = [
  "characters",
  "locations",
  "factions",
  "lore-traits",
  "mechanics",
  "lore",
];

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function slugify(str) {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-");
}

// Returns the value of the `name:` field from YAML front matter, or null.
function readNameFromFrontMatter(content) {
  if (!content.startsWith("---")) return null;
  const end = content.indexOf("\n---", 3);
  if (end === -1) return null;
  const fm = content.slice(3, end);
  const match = fm.match(/^name:\s*(.+)$/m);
  return match ? match[1].trim() : null;
}

// Strips YAML front matter and returns the body text only.
function stripFrontMatter(content) {
  if (!content.startsWith("---")) return content;
  const end = content.indexOf("\n---", 3);
  if (end === -1) return content;
  return content.slice(end + 4).trimStart();
}

// ---------------------------------------------------------------------------
// Index builder
// ---------------------------------------------------------------------------
// The index maps a lowercased page name to { category, slug } so that link
// conversion can look up "aldren voss" and get { category: "characters",
// slug: "aldren-voss" }.

function buildIndex() {
  const index = {};

  function add(lookupName, category, slug) {
    index[lookupName.toLowerCase().trim()] = { category, slug };
  }

  // Source 1: staging subfolders — filename is the Obsidian page title
  for (const category of CATEGORIES) {
    const dir = path.join(STAGING_DIR, category);
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith(".md")) continue;
      const pageName = path.basename(file, ".md");
      add(pageName, category, slugify(pageName));
    }
  }

  // Source 2: existing src/wiki/ entries — read name: from front matter so
  // that [[Aldren Voss]] resolves correctly even if the filename is aldren-voss.md
  for (const category of CATEGORIES) {
    const dir = path.join(WIKI_DIR, category);
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith(".md") || file === "index.md") continue;
      const slug = path.basename(file, ".md");
      const content = fs.readFileSync(path.join(dir, file), "utf8");
      const name = readNameFromFrontMatter(content);
      if (name) add(name, category, slug);
      // Also index by slug in case a link uses it directly
      add(slug, category, slug);
    }
  }

  return index;
}

// ---------------------------------------------------------------------------
// Link conversion
// ---------------------------------------------------------------------------

function convertLinks(content, index, unresolvedSet) {
  return content.replace(
    /\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g,
    (match, pageName, alias) => {
      const display = (alias || pageName).trim();
      const entry = index[pageName.toLowerCase().trim()];
      if (!entry) {
        unresolvedSet.add(pageName.trim());
        return match; // leave unconverted
      }
      return `{${entry.category}|${entry.slug}|${display}}`;
    }
  );
}

// ---------------------------------------------------------------------------
// File migration
// ---------------------------------------------------------------------------

function migrateFile(srcPath, category, index) {
  const raw      = fs.readFileSync(srcPath, "utf8");
  const pageName = path.basename(srcPath, ".md");
  const slug     = slugify(pageName);
  const body     = stripFrontMatter(raw);

  const unresolved = new Set();
  const convertedBody = convertLinks(body, index, unresolved);

  // Write minimal front matter. The name: field is set from the Obsidian
  // filename. Add the remaining schema fields by hand (status, species, etc.)
  // before copying to the site.
  const output = `---\nname: ${pageName}\n---\n\n${convertedBody}`;

  const destDir = path.join(CONVERTED_DIR, category);
  fs.mkdirSync(destDir, { recursive: true });
  fs.writeFileSync(path.join(destDir, `${slug}.md`), output, "utf8");

  return { slug, unresolved: [...unresolved] };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

// Ensure staging category subfolders exist so the user can see where to drop files
for (const category of CATEGORIES) {
  fs.mkdirSync(path.join(STAGING_DIR, category), { recursive: true });
}

// Clear converted output from any previous run
if (fs.existsSync(CONVERTED_DIR)) {
  fs.rmSync(CONVERTED_DIR, { recursive: true });
}

// Build the lookup index
const index      = buildIndex();
const indexCount = Object.keys(index).length;
console.log(`Index: ${indexCount} entr${indexCount === 1 ? "y" : "ies"} found across staging and wiki.\n`);

// Process staging files
let totalFiles      = 0;
let totalUnresolved = 0;

for (const category of CATEGORIES) {
  const dir = path.join(STAGING_DIR, category);
  if (!fs.existsSync(dir)) continue;

  const files = fs.readdirSync(dir).filter(f => f.endsWith(".md"));
  if (files.length === 0) continue;

  console.log(`${category} (${files.length} file${files.length !== 1 ? "s" : ""})`);

  for (const file of files) {
    const { slug, unresolved } = migrateFile(
      path.join(dir, file),
      category,
      index
    );
    totalFiles++;

    if (unresolved.length > 0) {
      console.log(`  OK  ${slug}.md  [${unresolved.length} unresolved: ${unresolved.join(", ")}]`);
      totalUnresolved += unresolved.length;
    } else {
      console.log(`  OK  ${slug}.md`);
    }
  }
  console.log();
}

if (totalFiles === 0) {
  console.log("Nothing to migrate. Drop .md files into scripts/staging/{category}/ and re-run.");
} else {
  console.log(`Done. ${totalFiles} file${totalFiles !== 1 ? "s" : ""} converted -> scripts/converted/`);
  if (totalUnresolved > 0) {
    console.log(
      `${totalUnresolved} unresolved link${totalUnresolved !== 1 ? "s" : ""} left unconverted.` +
      ` The page name was not found in staging or the wiki.`
    );
  }
}
