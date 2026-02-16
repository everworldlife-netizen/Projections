// ============================================================================
// PicoClaw Game View
// Detailed projection view for a single game
// ============================================================================

import { getState, setState } from '../state.js';
import { fetchProjections } from '../api.js';
import { $ } from '../utils/dom.js';
import { formatGameStatus } from '../utils/format.js';
import { updateBreadcrumb } from '../components/Header.js';
import { renderAllTables } from '../components/ProjectionTable.js';

export async function renderGameView(params) {
  const { gameId } = params;
  const container = $('view-container');

  setState({ selectedGameId: gameId, view: 'game', loading: true });
  updateBreadcrumb('Game View');

  container.innerHTML = `
    <div class="pc-empty">
      <div class="loader"></div>
      <p>Loading projections...</p>
    </div>
  `;

  try {
    const data = await fetchProjections(gameId);
    setState({ projections: data.players, gameInfo: data.gameInfo, loading: false });

    const game = getState().games.find(g => g.gameId === gameId);
    if (game) {
      updateBreadcrumb(`${game.awayTeam.abbrev} @ ${game.homeTeam.abbrev}`);
    }

    container.innerHTML = `
      <div class="fade-in">
        ${renderGameHeader(game, data.gameInfo)}
        <div class="pc-flex-col pc-gap-xl" style="margin-top:24px">
          ${renderAllTables(data)}
        </div>
      </div>
    `;
  } catch (err) {
    setState({ loading: false, error: err.message });
    container.innerHTML = `
      <div class="pc-empty">
        <div class="pc-empty-icon">&#9888;</div>
        <div class="pc-empty-title">Failed to load projections</div>
        <div class="pc-empty-hint">${err.message}</div>
        <button class="pc-btn pc-btn-primary" style="margin-top:16px" onclick="location.hash='/'">Back to Dashboard</button>
      </div>
    `;
  }
}

function renderGameHeader(game, gameInfo) {
  if (!game) {
    return `
      <div class="game-view-header">
        <div class="gv-center">
          <div class="gv-status">Game ${gameInfo?.statusName || ''}</div>
        </div>
      </div>
    `;
  }

  const isLive = game.status === 'in_progress';
  const status = formatGameStatus(game);

  return `
    <div class="game-view-header">
      <div class="gv-team">
        <img src="${game.awayTeam.logo}" alt="${game.awayTeam.abbrev}"
             onerror="this.style.display='none'">
        <div>
          <div class="gv-team-name">${game.awayTeam.name}</div>
          <div class="gv-team-record">${game.awayTeam.record}</div>
        </div>
      </div>

      <div class="gv-score">${game.awayTeam.score}</div>

      <div class="gv-center">
        <div class="gv-status${isLive ? ' live' : ''}">${status}</div>
        ${isLive ? '<span class="pc-badge pc-badge-live" style="margin-top:8px">LIVE</span>' : ''}
      </div>

      <div class="gv-score">${game.homeTeam.score}</div>

      <div class="gv-team" style="text-align:right">
        <div>
          <div class="gv-team-name">${game.homeTeam.name}</div>
          <div class="gv-team-record">${game.homeTeam.record}</div>
        </div>
        <img src="${game.homeTeam.logo}" alt="${game.homeTeam.abbrev}"
             onerror="this.style.display='none'">
      </div>
    </div>
  `;
}

/**
 * Refresh projections for the current game.
 */
export async function refreshGameView() {
  const { selectedGameId } = getState();
  if (!selectedGameId) return;

  try {
    const data = await fetchProjections(selectedGameId);
    setState({ projections: data.players, gameInfo: data.gameInfo });

    const tablesContainer = document.querySelector('.view-container .pc-flex-col');
    if (tablesContainer) {
      tablesContainer.innerHTML = renderAllTables(data);
    }

    // Update game header with fresh scores
    const game = getState().games.find(g => g.gameId === selectedGameId);
    const headerEl = document.querySelector('.game-view-header');
    if (headerEl && game) {
      headerEl.outerHTML = renderGameHeader(game, data.gameInfo);
    }
  } catch (err) {
    console.error('[GameView] Refresh error:', err);
  }
}
