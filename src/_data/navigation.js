// =============================================================================
// navigation.js — Global site navigation
// =============================================================================
// Eleventy exposes this file as the `navigation` variable in every template.
// base.njk renders the navbar from this array, so adding, removing, or
// reordering nav items is a one-file edit — no template changes needed.
//
// ITEM SHAPE
// ----------
//   {
//     label:    string  — visible nav text
//     href:     string  — destination URL when the label is clicked
//     submenu:  array   — optional. If present, a dropdown is rendered.
//                         Items inside follow the same { label, href } shape.
//                         Only one level of nesting is supported by design
//                         (no submenus inside submenus).
//   }
//
// BEHAVIOR
// --------
// - Items without a submenu render as a plain link.
// - Items with a submenu render as a link + a chevron button. Clicking the
//   label navigates to the href; clicking the chevron toggles the dropdown.
//   This split keeps the parent landing page reachable from the navbar even
//   on touch devices where there is no hover state.
// =============================================================================

module.exports = [
  { label: "Home", href: "/" },
  {
    label: "Novels",
    href:  "/lorekeeper/",
    submenu: [
      { label: "Books", href: "/lorekeeper/books/" },
      { label: "Wiki",  href: "/lorekeeper/wiki/"  },
    ],
  },
  { label: "About", href: "/about/" },
];
