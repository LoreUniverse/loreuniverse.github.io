/**
 * create-structure.js
 * 
 * One-time setup script that creates the full Lore Universe project folder
 * structure and placeholder files. Safe to inspect after running — it will
 * not overwrite files that already exist.
 * 
 * Usage: node scripts/create-structure.js
 * Run from the project root (lorekeeper.github.io/).
 */

const fs   = require("fs");
const path = require("path");

// ---------------------------------------------------------------------------
// 1. DEFINE THE STRUCTURE
// ---------------------------------------------------------------------------
// Each entry is either:
//   - A string           → a folder to create
//   - An object          → a file to create, with a `path` and `content`
// ---------------------------------------------------------------------------

const folders = [
  "src/_data",
  "src/_includes",
  "src/wiki/characters",
  "src/wiki/lore-traits",
  "src/wiki/mechanics",
  "src/wiki/locations",
  "src/wiki/factions",
  "src/wiki/lore",
  "src/chapters",
  ".github/workflows",
  "scripts",
];

const files = [
  // --- Eleventy config (root) ----------------------------------------------
  {
    path: ".eleventy.js",
    content: `// Eleventy configuration — to be fully implemented in a later step.\nmodule.exports = function(eleventyConfig) {\n  return {\n    dir: {\n      input: "src",\n      output: "_site",\n    },\n  };\n};\n`,
  },

  // --- Global site data ----------------------------------------------------
  {
    path: "src/_data/config.js",
    content: `// Global site configuration.\n// wikiLinksVisible controls whether inline wiki links in chapters\n// render as visible hyperlinks (true) or unstyled plain text (false).\nmodule.exports = {\n  wikiLinksVisible: true,\n};\n`,
  },

  // --- Nunjucks layout templates -------------------------------------------
  {
    path: "src/_includes/base.njk",
    content: `{# Root layout — wraps every page. To be fully implemented in a later step. #}\n<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>{{ title }} | Lore Universe</title>\n</head>\n<body>\n  <header>\n    <nav><!-- Navigation to be added --></nav>\n  </header>\n  <main>\n    {{ content | safe }}\n  </main>\n  <footer>\n    <!-- Footer to be added -->\n  </footer>\n</body>\n</html>\n`,
  },
  {
    path: "src/_includes/wiki-entry.njk",
    content: `{# Wiki entry layout — extends base.njk. To be fully implemented in a later step. #}\n---\nlayout: base.njk\n---\n<article class="wiki-entry">\n  <h1>{{ name }}</h1>\n  {{ content | safe }}\n</article>\n`,
  },
  {
    path: "src/_includes/chapter.njk",
    content: `{# Chapter layout — extends base.njk. To be fully implemented in a later step. #}\n---\nlayout: base.njk\n---\n<article class="chapter">\n  <h1>{{ title }}</h1>\n  {{ content | safe }}\n</article>\n`,
  },

  // --- Homepage ------------------------------------------------------------
  {
    path: "src/index.md",
    content: `---\ntitle: Home\nlayout: base.njk\n---\n\n# Welcome to Lore Universe\n\nPlaceholder homepage.\n`,
  },

  // --- GitHub Actions workflow (placeholder) -------------------------------
  {
    path: ".github/workflows/deploy.yml",
    content: `# GitHub Actions deployment workflow — to be fully implemented in a later step.\n`,
  },

  // --- .gitignore ----------------------------------------------------------
  {
    path: ".gitignore",
    content: `# Node dependencies\nnode_modules/\n\n# Eleventy compiled output\n_site/\n\n# OS files\n.DS_Store\nThumbs.db\n`,
  },

  // --- Scripts folder marker -----------------------------------------------
  {
    path: "scripts/README.md",
    content: `# Scripts\n\nUtility scripts for the Lore Universe project.\n\n| Script | Purpose | Run once? |\n|---|---|---|\n| create-structure.js | Creates the initial project folder structure and placeholder files | Yes |\n`,
  },
];

// ---------------------------------------------------------------------------
// 2. CREATE FOLDERS
// ---------------------------------------------------------------------------

console.log("\n--- Creating folders ---\n");

for (const folder of folders) {
  if (fs.existsSync(folder)) {
    console.log(`  SKIP   ${folder}  (already exists)`);
  } else {
    fs.mkdirSync(folder, { recursive: true });
    console.log(`  CREATE ${folder}`);
  }
}

// ---------------------------------------------------------------------------
// 3. CREATE FILES
// ---------------------------------------------------------------------------

console.log("\n--- Creating files ---\n");

for (const file of files) {
  if (fs.existsSync(file.path)) {
    console.log(`  SKIP   ${file.path}  (already exists)`);
  } else {
    // Ensure the parent directory exists before writing the file.
    // This is a safety measure in case a folder was missed above.
    fs.mkdirSync(path.dirname(file.path), { recursive: true });
    fs.writeFileSync(file.path, file.content, "utf8");
    console.log(`  CREATE ${file.path}`);
  }
}

// ---------------------------------------------------------------------------
// 4. DONE
// ---------------------------------------------------------------------------

console.log("\n--- Done! ---\n");
console.log("Next step: implement .eleventy.js and the Nunjucks templates.");
console.log("See PROJECT_BRIEFING.md for the full build plan.\n");
