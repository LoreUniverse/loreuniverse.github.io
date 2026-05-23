(function () {
  var ROOT      = document.documentElement;
  var THEME_KEY = 'lr-theme';
  var SIZE_KEY  = 'lr-font-size';
  var WIKI_KEY  = 'lr-wiki-links';

  function setFontSize(size) {
    ROOT.dataset.fontSize = size;
    localStorage.setItem(SIZE_KEY, size);
    document.querySelectorAll('[data-font-size-btn]').forEach(function (btn) {
      btn.setAttribute('aria-pressed', btn.dataset.fontSizeBtn === size ? 'true' : 'false');
    });
  }

  function setTheme(theme) {
    ROOT.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
    var btn = document.getElementById('theme-toggle');
    if (btn) btn.textContent = theme === 'dark' ? 'Light' : 'Dark';
  }

  function setWikiLinks(visible) {
    if (visible) {
      delete ROOT.dataset.wikiLinks;
    } else {
      ROOT.dataset.wikiLinks = 'hidden';
    }
    localStorage.setItem(WIKI_KEY, visible ? 'true' : 'false');
    var btn = document.getElementById('wiki-links-toggle');
    if (btn) btn.setAttribute('aria-pressed', visible ? 'true' : 'false');
  }

  // Sync button visual states to the data attributes already applied by the
  // anti-FOUC inline script in <head>.
  function syncState() {
    var size  = ROOT.dataset.fontSize || 'md';
    var theme = ROOT.dataset.theme    || 'light';

    document.querySelectorAll('[data-font-size-btn]').forEach(function (btn) {
      btn.setAttribute('aria-pressed', btn.dataset.fontSizeBtn === size ? 'true' : 'false');
    });

    var themeBtn = document.getElementById('theme-toggle');
    if (themeBtn) themeBtn.textContent = theme === 'dark' ? 'Light' : 'Dark';

    var wikiBtn = document.getElementById('wiki-links-toggle');
    if (wikiBtn) {
      wikiBtn.setAttribute('aria-pressed', ROOT.dataset.wikiLinks === 'hidden' ? 'false' : 'true');
    }
  }

  // Hide the pill when scrolling down, reveal it when scrolling up.
  // Uses rAF throttling and a small threshold to avoid jitter.
  function initScrollHide() {
    var pill = document.querySelector('.reader-controls');
    if (!pill) return;

    var lastY   = window.scrollY;
    var ticking = false;

    window.addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(function () {
        var y = window.scrollY;
        if (y < 80) {
          // Always show near the top of the page.
          pill.classList.remove('reader-controls--hidden');
        } else if (y > lastY + 6) {
          // Scrolling down — slide out.
          pill.classList.add('reader-controls--hidden');
        } else if (y < lastY - 6) {
          // Scrolling up — slide back in.
          pill.classList.remove('reader-controls--hidden');
        }
        lastY   = y;
        ticking = false;
      });
    }, { passive: true });
  }

  document.addEventListener('DOMContentLoaded', function () {
    syncState();
    initScrollHide();

    document.addEventListener('click', function (e) {
      var sizeBtn = e.target.closest('[data-font-size-btn]');
      if (sizeBtn) {
        setFontSize(sizeBtn.dataset.fontSizeBtn);
        return;
      }
      if (e.target.closest('#theme-toggle')) {
        setTheme(ROOT.dataset.theme === 'dark' ? 'light' : 'dark');
        return;
      }
      if (e.target.closest('#wiki-links-toggle')) {
        setWikiLinks(ROOT.dataset.wikiLinks === 'hidden');
      }
    });
  });
})();
