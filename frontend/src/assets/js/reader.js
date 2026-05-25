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
