// ============================================================================
// PicoClaw Dashboard - Main Entry Point
// ============================================================================

import { fetchGames } from './api.js';
import { getState, setState, subscribe } from './state.js';
import { registerRoute, initRouter, navigate } from './router.js';
import { renderSidebar } from './components/Sidebar.js';
import { renderHeader } from './components/Header.js';
import { renderGameStrip } from './components/GameStrip.js';
import { renderDashboardView } from './views/DashboardView.js';
import { renderGameView, refreshGameView } from './views/GameView.js';
import { renderPlayerView } from './views/PlayerView.js';

const POLL_INTERVAL = 20000; // 20 seconds
let refreshTimer = null;

// ---- Route Registration ----

registerRoute('/', () => {
  setState({ view: 'dashboard' });
  renderDashboardView();
});

registerRoute('/game/:gameId', (params) => {
  setState({ view: 'game' });
  renderGameView(params);
});

registerRoute('/compare', () => {
  setState({ view: 'player' });
  renderPlayerView();
});

// ---- Data Loading ----

async function loadGames() {
  try {
    const data = await fetchGames();
    setState({
      games: data.games || [],
      dataSource: data.source || 'live',
      lastUpdated: Date.now(),
    });
    return data.games;
  } catch (err) {
    console.error('[PicoClaw] Failed to load games:', err);
    setState({ error: err.message });
    return [];
  }
}

// ---- Auto-Refresh ----

async function refresh() {
  await loadGames();

  const { view, selectedGameId } = getState();
  if (view === 'game' && selectedGameId) {
    await refreshGameView();
  }

  setState({ lastUpdated: Date.now() });
}

function startPolling() {
  stopPolling();
  refreshTimer = setInterval(refresh, POLL_INTERVAL);
}

function stopPolling() {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
}

// ---- Initialization ----

async function init() {
  console.log('[PicoClaw] Initializing dashboard...');

  // Render shell components
  renderSidebar();
  renderHeader();

  // Load initial data
  await loadGames();

  // Render game strip
  renderGameStrip();

  // Initialize client-side router (renders the current view)
  initRouter();

  // Start auto-refresh
  startPolling();

  // Pause polling when tab is hidden
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopPolling();
    } else {
      refresh();
      startPolling();
    }
  });

  console.log('[PicoClaw] Dashboard ready.');
}

init();
