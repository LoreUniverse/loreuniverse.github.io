// =============================================================================
// site.js — Global site data
// =============================================================================
// Eleventy automatically exposes every file in src/_data/ as a template
// variable named after the file. This file is accessible in any template as
// `site` (e.g. {{ site.modules.lorekeeper.wiki }}).
//
// PURPOSE
// -------
// Single source of truth for URL paths used across the site. Templates and
// the wiki link transform in .eleventy.js both reference these values, so
// renaming a module or restructuring URLs requires editing this file only.
//
// CONVENTION
// ----------
// All paths are absolute (start with /) and do NOT have a trailing slash.
// Templates that build a URL should append a trailing slash and any extra
// path segments themselves:
//
//   <a href="{{ site.modules.lorekeeper.wiki }}/characters/{{ slug }}/">
//
// This keeps the structure flexible — you can append "/characters/", or
// "/factions/", or anything else, without the data file needing to know
// every possible suffix.
// =============================================================================

module.exports = {
  modules: {
    lorekeeper: {
      root:  "/lorekeeper",
      wiki:  "/lorekeeper/wiki",
      books: "/lorekeeper/books",
    },
  },
};
