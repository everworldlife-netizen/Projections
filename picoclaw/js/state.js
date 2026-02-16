// ============================================================================
// PicoClaw State Management
// Simple observable store for dashboard state
// ============================================================================

const listeners = new Map();

const state = {
  games: [],
  selectedGameId: null,
  projections: null,
  gameInfo: null,
  view: 'dashboard', // 'dashboard' | 'game' | 'player'
  loading: false,
  error: null,
  lastUpdated: null,
  sidebarCollapsed: false,
  dataSource: 'live',
  selectedPlayers: [], // for comparison view
};

export function getState() {
  return state;
}

export function setState(updates) {
  const changed = [];

  for (const [key, value] of Object.entries(updates)) {
    if (state[key] !== value) {
      state[key] = value;
      changed.push(key);
    }
  }

  if (changed.length > 0) {
    notify(changed);
  }
}

export function subscribe(keys, callback) {
  const id = Symbol();
  const keySet = new Set(Array.isArray(keys) ? keys : [keys]);
  listeners.set(id, { keys: keySet, callback });

  return () => listeners.delete(id);
}

function notify(changedKeys) {
  for (const { keys, callback } of listeners.values()) {
    const relevant = changedKeys.some(k => keys.has(k) || keys.has('*'));
    if (relevant) {
      try {
        callback(state, changedKeys);
      } catch (err) {
        console.error('[State] Listener error:', err);
      }
    }
  }
}
