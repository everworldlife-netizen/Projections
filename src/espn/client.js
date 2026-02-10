const cache = require('../cache');

const BASE = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba';
const TIMEOUT_MS = 8000;

async function fetchJSON(path, cacheKey, ttl) {
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const url = `${BASE}${path}`;
  console.log(`[ESPN] Fetching: ${url}`);
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`ESPN API error: ${res.status} for ${path}`);
    const data = await res.json();
    cache.set(cacheKey, data, ttl);
    return data;
  } catch (err) {
    console.log(`[ESPN] Fetch failed for ${path}: ${err.message}`);
    throw err;
  }
}

async function fetchExternalJSON(url, cacheKey, ttl = 30000) {
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  console.log(`[External] Fetching: ${url}`);
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`External API error: ${res.status} for ${url}`);
    const data = await res.json();
    cache.set(cacheKey, data, ttl);
    return data;
  } catch (err) {
    console.log(`[External] Fetch failed for ${url}: ${err.message}`);
    throw err;
  }
}

module.exports = { fetchJSON, fetchExternalJSON };
