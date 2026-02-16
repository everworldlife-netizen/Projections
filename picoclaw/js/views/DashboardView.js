// ============================================================================
// PicoClaw Dashboard View
// Main overview showing today's games summary and key stats
// ============================================================================

import { getState } from '../state.js';
import { navigate } from '../router.js';
import { $ } from '../utils/dom.js';
import { formatGameStatus, round, confidenceClass } from '../utils/format.js';
import { updateBreadcrumb } from '../components/Header.js';

export function renderDashboardView() {
  updateBreadcrumb('Dashboard');

  const container = $('view-container');
  const { games, projections } = getState();

  const liveCount = games.filter(g => g.status === 'in_progress').length;
  const finalCount = games.filter(g => g.status === 'final').length;
  const scheduledCount = games.filter(g => g.status === 'scheduled').length;

  container.innerHTML = `
    <div class="fade-in">
      <!-- Overview Cards -->
      <div class="overview-grid">
        <div class="overview-card">
          <div class="overview-card-label">Total Games</div>
          <div class="overview-card-value">${games.length}</div>
          <div class="overview-card-change" style="color:var(--pc-text-secondary)">Today's slate</div>
        </div>
        <div class="overview-card">
          <div class="overview-card-label">Live Now</div>
          <div class="overview-card-value" style="color:var(--pc-success)">${liveCount}</div>
          <div class="overview-card-change" style="color:var(--pc-success)">${liveCount > 0 ? 'In progress' : 'None active'}</div>
        </div>
        <div class="overview-card">
          <div class="overview-card-label">Final</div>
          <div class="overview-card-value">${finalCount}</div>
          <div class="overview-card-change" style="color:var(--pc-text-secondary)">Completed</div>
        </div>
        <div class="overview-card">
          <div class="overview-card-label">Upcoming</div>
          <div class="overview-card-value">${scheduledCount}</div>
          <div class="overview-card-change" style="color:var(--pc-text-secondary)">Scheduled</div>
        </div>
      </div>

      <!-- Games List -->
      <div class="pc-section-header">
        <div>
          <div class="pc-section-title">Today's Games</div>
          <div class="pc-section-subtitle">Click a game to view live projections</div>
        </div>
      </div>

      ${games.length > 0 ? renderGamesList(games) : renderEmptyState()}
    </div>
  `;

  bindDashboardEvents(container);
}

function renderGamesList(games) {
  return `
    <div class="pc-grid pc-grid-2" style="gap:16px" id="games-grid">
      ${games.map(game => renderGameCard(game)).join('')}
    </div>
  `;
}

function renderGameCard(game) {
  const isLive = game.status === 'in_progress';
  const isFinal = game.status === 'final';
  const status = formatGameStatus(game);

  return `
    <div class="pc-card" style="cursor:pointer" data-game-id="${game.gameId}">
      <div class="pc-card-body" style="padding:16px">
        <div class="pc-flex" style="justify-content:space-between;margin-bottom:12px">
          <span class="${isLive ? 'pc-badge pc-badge-live' : isFinal ? 'pc-badge pc-badge-info' : 'pc-badge pc-badge-accent'}">${isLive ? 'LIVE' : status}</span>
          ${isLive ? `<span style="color:var(--pc-success);font-size:12px;font-weight:600">${status}</span>` : ''}
        </div>

        <!-- Away team -->
        <div class="pc-flex pc-gap-md" style="margin-bottom:8px">
          <img src="${game.awayTeam.logo}" alt="${game.awayTeam.abbrev}"
               style="width:32px;height:32px;object-fit:contain"
               onerror="this.style.display='none'">
          <div style="flex:1">
            <div style="font-weight:600;font-size:14px">${game.awayTeam.name}</div>
            <div style="font-size:11px;color:var(--pc-text-secondary)">${game.awayTeam.record}</div>
          </div>
          <div style="font-size:24px;font-weight:800;font-variant-numeric:tabular-nums">
            ${game.status !== 'scheduled' ? game.awayTeam.score : '-'}
          </div>
        </div>

        <!-- Home team -->
        <div class="pc-flex pc-gap-md">
          <img src="${game.homeTeam.logo}" alt="${game.homeTeam.abbrev}"
               style="width:32px;height:32px;object-fit:contain"
               onerror="this.style.display='none'">
          <div style="flex:1">
            <div style="font-weight:600;font-size:14px">${game.homeTeam.name}</div>
            <div style="font-size:11px;color:var(--pc-text-secondary)">${game.homeTeam.record}</div>
          </div>
          <div style="font-size:24px;font-weight:800;font-variant-numeric:tabular-nums">
            ${game.status !== 'scheduled' ? game.homeTeam.score : '-'}
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderEmptyState() {
  return `
    <div class="pc-empty">
      <div class="pc-empty-icon">&#128164;</div>
      <div class="pc-empty-title">No games scheduled today</div>
      <div class="pc-empty-hint">Check back on a game day or paste an ESPN URL in the search bar</div>
    </div>
  `;
}

function bindDashboardEvents(container) {
  container.addEventListener('click', (e) => {
    const card = e.target.closest('[data-game-id]');
    if (card) {
      navigate(`/game/${card.dataset.gameId}`);
    }
  });
}
