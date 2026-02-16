// ============================================================================
// PicoClaw Sidebar Component
// ============================================================================

import { getState, setState, subscribe } from '../state.js';
import { navigate } from '../router.js';
import { $ } from '../utils/dom.js';

const NAV_ITEMS = [
  { id: 'dashboard', icon: '\u25A6', label: 'Dashboard',  route: '/' },
  { id: 'game',      icon: '\u26F9', label: 'Game View',   route: null },
  { id: 'player',    icon: '\u2606', label: 'Compare',     route: '/compare' },
];

export function renderSidebar() {
  const sidebar = $('sidebar');
  if (!sidebar) return;

  const state = getState();

  sidebar.innerHTML = `
    <div class="sidebar-brand">
      <img src="assets/logo.svg" alt="PicoClaw">
      <span class="sidebar-brand-text">PicoClaw</span>
    </div>
    <nav class="sidebar-nav">
      <div class="sidebar-section-title">Navigation</div>
      ${NAV_ITEMS.map(item => `
        <div class="sidebar-item${state.view === item.id ? ' active' : ''}"
             data-nav="${item.id}" data-route="${item.route || ''}">
          <span class="sidebar-icon">${item.icon}</span>
          <span class="nav-label">${item.label}</span>
        </div>
      `).join('')}

      <div class="sidebar-section-title">Games Today</div>
      <div id="sidebar-games"></div>
    </nav>
    <div class="sidebar-footer">
      <div class="sidebar-item" data-action="toggle-sidebar">
        <span class="sidebar-icon">\u2B9C</span>
        <span class="nav-label">Collapse</span>
      </div>
    </div>
  `;

  renderSidebarGames();
  bindSidebarEvents(sidebar);
}

function renderSidebarGames() {
  const container = $('sidebar-games');
  if (!container) return;

  const { games, selectedGameId } = getState();

  if (games.length === 0) {
    container.innerHTML = '<div class="sidebar-item" style="opacity:0.4"><span class="sidebar-icon">-</span><span class="nav-label">No games today</span></div>';
    return;
  }

  container.innerHTML = games.map(game => {
    const isActive = game.gameId === selectedGameId;
    const isLive = game.status === 'in_progress';
    return `
      <div class="sidebar-item${isActive ? ' active' : ''}" data-game-id="${game.gameId}">
        <span class="sidebar-icon" style="font-size:10px;${isLive ? 'color:var(--pc-success)' : ''}">${isLive ? '\u25CF' : '\u25CB'}</span>
        <span class="nav-label">${game.awayTeam.abbrev} @ ${game.homeTeam.abbrev}</span>
      </div>
    `;
  }).join('');
}

function bindSidebarEvents(sidebar) {
  sidebar.addEventListener('click', (e) => {
    const navItem = e.target.closest('[data-nav]');
    if (navItem) {
      const route = navItem.dataset.route;
      if (route) navigate(route);
      return;
    }

    const gameItem = e.target.closest('[data-game-id]');
    if (gameItem) {
      const gameId = gameItem.dataset.gameId;
      navigate(`/game/${gameId}`);
      return;
    }

    const action = e.target.closest('[data-action]');
    if (action?.dataset.action === 'toggle-sidebar') {
      const sidebar = $('sidebar');
      sidebar.classList.toggle('collapsed');
      setState({ sidebarCollapsed: sidebar.classList.contains('collapsed') });
    }
  });
}

// Re-render sidebar games when state changes
subscribe(['games', 'selectedGameId', 'view'], () => {
  renderSidebarGames();
  // Update active nav items
  const state = getState();
  document.querySelectorAll('.sidebar-item[data-nav]').forEach(item => {
    item.classList.toggle('active', item.dataset.nav === state.view);
  });
});
