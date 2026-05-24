// At build time, Eleventy executes this file and exposes the returned data
// as `wiki` in every template.
//
// The backend is configured for scale-to-zero on Fly. The first request after
// idle pays a ~2-4s cold start. We give the fetch a 20s budget — long enough
// to cover the cold start AND a slow response, short enough to fail fast if
// the backend is actually broken (so CI builds don't hang indefinitely).

const FETCH_TIMEOUT_MS = 20_000;

module.exports = async function () {
  const baseUrl = process.env.LORE_API_URL_BUILD || 'http://localhost:3000';
  const empty = { entries: [], byCategory: {}, indexedAt: new Date().toISOString() };

  try {
    const response = await fetch(`${baseUrl}/api/wiki/all`, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) {
      console.warn(`[wiki] API returned ${response.status}; continuing with empty wiki data.`);
      return empty;
    }
    const entries = await response.json();

    const byCategory = {};
    for (const e of entries) {
      if (!byCategory[e.category]) byCategory[e.category] = [];
      byCategory[e.category].push(e);
    }

    console.log(`[wiki] Loaded ${entries.length} wiki entries from ${baseUrl}/api/wiki/all`);
    return { entries, byCategory, indexedAt: new Date().toISOString() };
  } catch (err) {
    const reason = err.name === 'TimeoutError'
      ? `timed out after ${FETCH_TIMEOUT_MS}ms (backend cold or unreachable)`
      : err.message;
    console.warn(`[wiki] Failed to fetch from ${baseUrl}: ${reason}. Continuing with empty wiki data.`);
    return empty;
  }
};
