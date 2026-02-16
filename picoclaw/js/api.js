// ============================================================================
// PicoClaw API Client
// ============================================================================

const API_BASE = '/api';

async function request(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }

  return res.json();
}

export async function fetchGames() {
  return request('/games');
}

export async function fetchProjections(gameId) {
  return request(`/games/${encodeURIComponent(gameId)}/projections`);
}

export async function parseUrl(url) {
  return request('/parse-url', {
    method: 'POST',
    body: JSON.stringify({ url }),
  });
}
