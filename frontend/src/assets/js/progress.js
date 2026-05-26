/**
 * progress.js — Reading progress + wiki favorites cache
 *
 * Mirrors the auth.js session-cache pattern.
 * Side effect: fetches /api/user/progress on DOMContentLoaded if signed in,
 * then dispatches 'progress-ready' CustomEvent so page scripts can re-check.
 */

const API_BASE     = 'https://loreuniverse-api.fly.dev';
const CACHE_KEY    = 'lr-progress';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ---------------------------------------------------------------------------
// Cache helpers
// ---------------------------------------------------------------------------

function getCache() {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL_MS) {
      sessionStorage.removeItem(CACHE_KEY);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

function setCache(data) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ data, ts: Date.now() }));
  } catch { /* quota exceeded — degrade silently */ }
}

function updateCache(fn) {
  const data = getCache() ?? { readChapters: [], favoriteWiki: [] };
  setCache(fn(data));
}

// ---------------------------------------------------------------------------
// Public read helpers (synchronous — check the local cache only)
// ---------------------------------------------------------------------------

export function isRead(bookSlug, chapterSlug) {
  const data = getCache();
  return data ? data.readChapters.includes(`${bookSlug}/${chapterSlug}`) : false;
}

export function isFavorited(category, slug) {
  const data = getCache();
  return data ? data.favoriteWiki.includes(`${category}/${slug}`) : false;
}

// ---------------------------------------------------------------------------
// Public write helpers (hit API, update cache in-place)
// ---------------------------------------------------------------------------

export async function markRead(bookSlug, chapterSlug) {
  try {
    const res = await fetch(
      `${API_BASE}/api/user/chapters/${bookSlug}/${chapterSlug}/read`,
      { method: 'POST', credentials: 'include' },
    );
    if (res.status === 401) return { ok: false, needsAuth: true };
    if (!res.ok) return { ok: false, needsAuth: false };
    updateCache((d) => {
      const key = `${bookSlug}/${chapterSlug}`;
      if (!d.readChapters.includes(key)) d.readChapters.push(key);
      return d;
    });
    return { ok: true, needsAuth: false };
  } catch {
    return { ok: false, needsAuth: false };
  }
}

export async function unmarkRead(bookSlug, chapterSlug) {
  try {
    await fetch(
      `${API_BASE}/api/user/chapters/${bookSlug}/${chapterSlug}/read`,
      { method: 'DELETE', credentials: 'include' },
    );
    updateCache((d) => {
      d.readChapters = d.readChapters.filter((k) => k !== `${bookSlug}/${chapterSlug}`);
      return d;
    });
  } catch { /* degrade silently */ }
}

export async function toggleFavorite(category, slug) {
  try {
    const res = await fetch(
      `${API_BASE}/api/user/wiki/${category}/${slug}/favorite`,
      { method: 'POST', credentials: 'include' },
    );
    if (!res.ok) return { favorited: isFavorited(category, slug) };
    const { favorited } = await res.json();
    updateCache((d) => {
      const key = `${category}/${slug}`;
      if (favorited) {
        if (!d.favoriteWiki.includes(key)) d.favoriteWiki.push(key);
      } else {
        d.favoriteWiki = d.favoriteWiki.filter((k) => k !== key);
      }
      return d;
    });
    return { favorited };
  } catch {
    return { favorited: isFavorited(category, slug) };
  }
}

// ---------------------------------------------------------------------------
// Boot: fetch progress on page load if signed in
// ---------------------------------------------------------------------------

async function loadProgress() {
  try {
    const raw = sessionStorage.getItem('lr-session');
    if (!raw) return;
    const { session } = JSON.parse(raw);
    if (!session?.user) return;

    if (getCache()) return;

    const res = await fetch(`${API_BASE}/api/user/progress`, { credentials: 'include' });
    if (!res.ok) {
      setCache({ readChapters: [], favoriteWiki: [] });
      return;
    }
    setCache(await res.json());
  } catch {
    setCache({ readChapters: [], favoriteWiki: [] });
  } finally {
    document.dispatchEvent(new CustomEvent('progress-ready'));
  }
}

document.addEventListener('DOMContentLoaded', loadProgress);
