const path = require("path");

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
  // 1. PASSTHROUGH COPY
  // ---------------------------------------------------------------------------
  // Tells Eleventy to copy these asset types directly to _site/ without
  // processing them. Uncomment each line when you add those assets to src/.
  //
  // eleventyConfig.addPassthroughCopy("src/assets/css");
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
    return collectionApi.getFilteredByGlob("src/wiki/characters/*.md");
  });

  eleventyConfig.addCollection("loreTraits", function(collectionApi) {
    return collectionApi.getFilteredByGlob("src/wiki/lore-traits/*.md");
  });

  eleventyConfig.addCollection("mechanics", function(collectionApi) {
    return collectionApi.getFilteredByGlob("src/wiki/mechanics/*.md");
  });

  eleventyConfig.addCollection("locations", function(collectionApi) {
    return collectionApi.getFilteredByGlob("src/wiki/locations/*.md");
  });

  eleventyConfig.addCollection("factions", function(collectionApi) {
    return collectionApi.getFilteredByGlob("src/wiki/factions/*.md");
  });

  eleventyConfig.addCollection("lore", function(collectionApi) {
    return collectionApi.getFilteredByGlob("src/wiki/lore/*.md");
  });

  eleventyConfig.addCollection("chapters", function(collectionApi) {
    return collectionApi
      .getFilteredByGlob("src/chapters/*.md")
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
  // 4. FUTURE: WIKI LINK PROCESSOR
  // ---------------------------------------------------------------------------
  // A transform will be added here to process the {category|slug|display}
  // inline wiki link syntax in chapter pages. It will convert these tokens
  // into anchor tags (or plain text) depending on the wikiLinksVisible
  // setting in src/_data/config.js.
  //
  // This is deferred until wiki entries and chapters exist to link between.

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