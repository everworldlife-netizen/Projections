// ============================================================================
// PicoClaw Game Strip Component
// Horizontal scrollable strip of today's games
// ============================================================================

import { getState, subscribe } from '../state.js';
import { navigate } from '../router.js';
import { $ } from '../utils/dom.js';
import { formatGameStatus } from '../utils/format.js';

export function renderGameStrip() {
  const container = $('game-strip');
  if (!container) return;

  const { games, selectedGameId } = getState();

  if (games.length === 0) {
    container.innerHTML = '<div class="strip-empty">No NBA games scheduled today</div>';
    return;
  }

  container.innerHTML = `
    <div class="game-strip-scroll" id="strip-scroll">
      ${games.map(game => renderStripGame(game, selectedGameId)).join('')}
    </div>
  `;

  bindStripEvents();
}

function renderStripGame(game, selectedGameId) {
  const isLive = game.status === 'in_progress';
  const isActive = game.gameId === selectedGameId;
  const status = formatGameStatus(game);

  return `
    <div class="strip-game${isActive ? ' active' : ''}" data-game-id="${game.gameId}">
      ${isLive ? '<div class="strip-live-dot"></div>' : ''}
      <div class="strip-team">
        <img src="${game.awayTeam.logo}" alt="${game.awayTeam.abbrev}"
             onerror="this.style.display='none'">
        <span class="strip-team-abbr">${game.awayTeam.abbrev}</span>
        <span class="strip-team-score">${game.status !== 'scheduled' ? game.awayTeam.score : ''}</span>
      </div>
      <div class="strip-team">
        <img src="${game.homeTeam.logo}" alt="${game.homeTeam.abbrev}"
             onerror="this.style.display='none'">
        <span class="strip-team-abbr">${game.homeTeam.abbrev}</span>
        <span class="strip-team-score">${game.status !== 'scheduled' ? game.homeTeam.score : ''}</span>
      </div>
      <div class="strip-status${isLive ? ' live' : ''}">${status}</div>
    </div>
  `;
}

function bindStripEvents() {
  const scroll = $('strip-scroll');
  if (!scroll) return;

  scroll.addEventListener('click', (e) => {
    const card = e.target.closest('[data-game-id]');
    if (card) {
      navigate(`/game/${card.dataset.gameId}`);
    }
  });
}

// Re-render when games or selection changes
subscribe(['games', 'selectedGameId'], () => {
  renderGameStrip();
});
