const path = require("path");
const { HtmlBasePlugin } = require("@11ty/eleventy");
const site = require("./src/_data/site.js");
// siteConfig (src/_data/config.js) is no longer imported here.
// wikiLinksVisible is read directly by the browser via a <meta> tag in
// base.njk, where Eleventy exposes _data files as template variables.

// pathPrefix is "/" because the site is now served from the org-page root
// (https://loreuniverse.github.io/). If the site is ever moved back to a
// subdirectory, change this value and HtmlBasePlugin will rewrite all
// root-relative URLs accordingly.
const PATH_PREFIX = "/";

// =============================================================================
// LORE UNIVERSE — ELEVENTY CONFIGURATION
// =============================================================================
// This file is the central configuration for the Eleventy static site
// generator. It tells Eleventy:
//   - Where to find source files and where to output the built site
//   - Which folders are collections (one per wiki category)
//   - Which file types to pass through to _site without processing
//   - Which templating languages to use
//
// Future implementations to add to this file:
//   - Wiki link processor transform ({category|slug|display} syntax)
// =============================================================================

module.exports = function(eleventyConfig) {

  // ---------------------------------------------------------------------------
  // 0. PLUGINS
  // ---------------------------------------------------------------------------
  // HtmlBasePlugin rewrites all root-relative URLs in the final HTML output
  // to include the pathPrefix defined in the return config below. This is
  // required because the site is served from a subdirectory on GitHub Pages
  // (loreuniverse.github.io/lorekeeper) rather than the domain root.
  // Without this, nav links and all internal hrefs would 404.

  eleventyConfig.addPlugin(HtmlBasePlugin);

  // ---------------------------------------------------------------------------
  // 1. PASSTHROUGH COPY
  // ---------------------------------------------------------------------------
  // Tells Eleventy to copy these asset types directly to _site/ without
  // processing them. Uncomment each line when you add those assets to src/.
  //
  eleventyConfig.addPassthroughCopy("src/assets/css");
  eleventyConfig.addPassthroughCopy("src/assets/js");
  // eleventyConfig.addPassthroughCopy("src/assets/images");
  // eleventyConfig.addPassthroughCopy("src/assets/fonts");

  // ---------------------------------------------------------------------------
  // 2. COLLECTIONS
  // ---------------------------------------------------------------------------
  // Each wiki category is registered as a named Eleventy collection.
  // Eleventy scans the specified glob pattern and returns all matching
  // Markdown files as an array of page objects, accessible in templates
  // via `collections.characters`, `collections.locations`, etc.
  //
  // The `data` property of each item in a collection contains the YAML
  // front matter fields defined in that entry's .md file.

  eleventyConfig.addCollection("characters", function(collectionApi) {
    return collectionApi.getFilteredByGlob("src/lorekeeper/wiki/characters/*.md");
  });

  eleventyConfig.addCollection("loreTraits", function(collectionApi) {
    return collectionApi.getFilteredByGlob("src/lorekeeper/wiki/lore-traits/*.md");
  });

  eleventyConfig.addCollection("mechanics", function(collectionApi) {
    return collectionApi.getFilteredByGlob("src/lorekeeper/wiki/mechanics/*.md");
  });

  eleventyConfig.addCollection("locations", function(collectionApi) {
    return collectionApi.getFilteredByGlob("src/lorekeeper/wiki/locations/*.md");
  });

  eleventyConfig.addCollection("factions", function(collectionApi) {
    return collectionApi.getFilteredByGlob("src/lorekeeper/wiki/factions/*.md");
  });

  eleventyConfig.addCollection("lore", function(collectionApi) {
    return collectionApi.getFilteredByGlob("src/lorekeeper/wiki/lore/*.md");
  });

  eleventyConfig.addCollection("chapters", function(collectionApi) {
    return collectionApi
      .getFilteredByGlob("src/lorekeeper/books/book1/chapters/*.md")
      .sort((a, b) => a.data.chapter_number - b.data.chapter_number);
  });

  // ---------------------------------------------------------------------------
  // 3. FILTERS
  // ---------------------------------------------------------------------------
  // Filters are functions you can call inside Nunjucks templates to transform
  // a value. For example: {{ publication_date | readableDate }}
  //
  // readableDate: converts a YYYY-MM-DD date string into a human-readable
  // format like "January 1, 2025". Used on chapter pages.

  eleventyConfig.addFilter("readableDate", function(dateString) {
    if (!dateString) return "";
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "UTC",
    });
  });

  // slugify: converts a display string into a URL-safe slug.
  // Example: "The Shattered Reach" → "the-shattered-reach"
  // Useful in templates when building links from freeform text fields.

  eleventyConfig.addFilter("slugify", function(str) {
    if (!str) return "";
    return str
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, "")
      .replace(/[\s_]+/g, "-");
  });

  // ---------------------------------------------------------------------------
  // 4. WIKI LINK PROCESSOR
  // ---------------------------------------------------------------------------
  // Transforms {category|slug|display} tokens in rendered HTML into anchor
  // tags or invisible spans, depending on the page type and per-page flag.
  //
  // Wiki entry pages: links are always rendered as <a>.
  // Chapter pages with wiki_links: true: links are always rendered as <a>.
  //   Visibility is controlled client-side via CSS + reader.js (the reader
  //   can toggle them; their preference persists in localStorage).
  // Chapter pages with wiki_links: false: tokens become invisible <span>s
  //   (per-page hard opt-out — the reader toggle has no effect here).
  //
  // The site-wide wikiLinksVisible default (src/_data/config.js) is no longer
  // evaluated here. It is read by the browser via <meta name="wiki-links-default">
  // in base.njk to seed the reader's first-visit preference.
  //
  // The six valid category values match the site's wiki folder names exactly.

  const WIKI_LINK_RE = /\{(characters|locations|factions|lore-traits|mechanics|lore)\|([^|]+)\|([^}]+)\}/g;

  eleventyConfig.addTransform("wikiLinks", function(content, outputPath) {
    if (!outputPath || !outputPath.endsWith(".html")) return content;

    const normalizedPath = outputPath.replace(/\\/g, "/");
    const isWiki    = normalizedPath.includes("/wiki/");
    const isChapter = normalizedPath.includes("/chapters/");

    if (!isWiki && !isChapter) return content;

    // Wiki pages and chapters with wiki_links: true always get real <a> tags.
    // Chapters with wiki_links: false fall through to the hidden-span branch.
    const visible = isWiki || content.includes('data-wiki-links="true"');

    return content.replace(WIKI_LINK_RE, (match, category, slug, display) => {
      if (visible) {
        return `<a class="wiki-link" href="${site.modules.lorekeeper.wiki}/${category}/${slug}/">${display}</a>`;
      }
      return `<span class="wiki-link wiki-link--hidden">${display}</span>`;
    });
  });

  // ---------------------------------------------------------------------------
  // 5. ELEVENTY RETURN CONFIG
  // ---------------------------------------------------------------------------
  // Tells Eleventy the input/output directories and which templating
  // languages to use for each file type.
  //
  // markdownTemplateEngine: "njk" means Markdown files can contain Nunjucks
  // expressions (e.g. {{ title }}) in addition to standard Markdown.
  //
  // htmlTemplateEngine: "njk" means plain .html files are also processed
  // as Nunjucks templates if needed.

  return {
    // pathPrefix tells Eleventy (and HtmlBasePlugin) that the site is served
    // from /lorekeeper/ on GitHub Pages, not the domain root. Update this
    // value if the repo is ever renamed or moved to a custom domain.
    pathPrefix: PATH_PREFIX,
    dir: {
      input: "src",
      output: "_site",
      includes: "_includes",
      data: "_data",
    },
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
    templateFormats: ["md", "njk", "html"],
  };

};