// ============================================================================
// PicoClaw Player Comparison View
// Side-by-side player comparison with stat charts
// ============================================================================

import { getState, setState, subscribe } from '../state.js';
import { $ } from '../utils/dom.js';
import { updateBreadcrumb } from '../components/Header.js';
import { renderPlayerCard, renderPlayerCardCompact } from '../components/PlayerCard.js';
import { PRIMARY_STATS, round, confidenceColor } from '../utils/format.js';

export function renderPlayerView() {
  updateBreadcrumb('Player Compare');
  setState({ view: 'player' });

  const container = $('view-container');
  const { projections, gameInfo, selectedPlayers } = getState();

  if (!projections || projections.length === 0) {
    container.innerHTML = `
      <div class="pc-empty">
        <div class="pc-empty-icon">&#9733;</div>
        <div class="pc-empty-title">No player data available</div>
        <div class="pc-empty-hint">Select a game first to load player projections, then return here to compare players.</div>
        <button class="pc-btn pc-btn-primary" style="margin-top:16px" onclick="location.hash='/'">Go to Dashboard</button>
      </div>
    `;
    return;
  }

  const activePlayers = projections.filter(p => !p.didNotPlay);

  container.innerHTML = `
    <div class="fade-in">
      <div class="pc-section-header">
        <div>
          <div class="pc-section-title">Player Comparison</div>
          <div class="pc-section-subtitle">Select two players below to compare their projections</div>
        </div>
      </div>

      <!-- Player selector -->
      <div class="pc-card" style="margin-bottom:24px">
        <div class="pc-card-body">
          <div class="pc-flex pc-gap-lg" style="flex-wrap:wrap">
            <div style="flex:1;min-width:200px">
              <label style="font-size:12px;color:var(--pc-text-secondary);display:block;margin-bottom:4px">Player A</label>
              <select class="pc-input" id="compare-player-a" style="width:100%">
                <option value="">Select a player...</option>
                ${activePlayers.map(p => `<option value="${p.id}" ${selectedPlayers[0] === p.id ? 'selected' : ''}>${p.name} (${p.teamAbbrev})</option>`).join('')}
              </select>
            </div>
            <div style="align-self:flex-end;font-size:18px;font-weight:700;color:var(--pc-text-muted);padding-bottom:8px">vs</div>
            <div style="flex:1;min-width:200px">
              <label style="font-size:12px;color:var(--pc-text-secondary);display:block;margin-bottom:4px">Player B</label>
              <select class="pc-input" id="compare-player-b" style="width:100%">
                <option value="">Select a player...</option>
                ${activePlayers.map(p => `<option value="${p.id}" ${selectedPlayers[1] === p.id ? 'selected' : ''}>${p.name} (${p.teamAbbrev})</option>`).join('')}
              </select>
            </div>
          </div>
        </div>
      </div>

      <!-- Comparison area -->
      <div id="compare-area">
        ${renderComparisonArea(selectedPlayers, activePlayers, gameInfo)}
      </div>
    </div>
  `;

  bindCompareEvents(activePlayers, gameInfo);
}

function renderComparisonArea(selectedPlayers, players, gameInfo) {
  const playerA = selectedPlayers[0] ? players.find(p => p.id === selectedPlayers[0]) : null;
  const playerB = selectedPlayers[1] ? players.find(p => p.id === selectedPlayers[1]) : null;

  if (!playerA && !playerB) {
    return `
      <div class="pc-empty" style="padding:48px 24px">
        <div class="pc-empty-icon">&#8644;</div>
        <div class="pc-empty-title">Select two players to compare</div>
        <div class="pc-empty-hint">Use the dropdowns above to pick players from the current game</div>
      </div>
    `;
  }

  if (playerA && playerB) {
    return `
      <div class="compare-container">
        <div>${renderPlayerCard(playerA, gameInfo)}</div>
        <div>${renderPlayerCard(playerB, gameInfo)}</div>
      </div>
      <div style="margin-top:24px">
        ${renderComparisonChart(playerA, playerB)}
      </div>
    `;
  }

  const player = playerA || playerB;
  return renderPlayerCard(player, gameInfo);
}

function renderComparisonChart(playerA, playerB) {
  const stats = PRIMARY_STATS;
  const barHeight = 24;
  const gap = 6;
  const centerX = 200;
  const maxBarWidth = 150;
  const totalWidth = 400;
  const totalHeight = stats.length * (barHeight + gap) + gap + 30;

  let maxVal = 1;
  for (const col of stats) {
    maxVal = Math.max(
      maxVal,
      round(playerA.projected[col.key]),
      round(playerB.projected[col.key])
    );
  }

  const bars = stats.map((col, i) => {
    const y = 30 + i * (barHeight + gap);
    const projA = round(playerA.projected[col.key]);
    const projB = round(playerB.projected[col.key]);
    const widthA = (projA / maxVal) * maxBarWidth;
    const widthB = (projB / maxVal) * maxBarWidth;

    return `
      <!-- ${col.label} -->
      <text x="${centerX}" y="${y + barHeight / 2 + 4}" text-anchor="middle"
            fill="var(--pc-text-secondary)" font-size="11" font-weight="600"
            font-family="var(--pc-font)">${col.label}</text>

      <!-- Player A (left) -->
      <rect x="${centerX - 24 - widthA}" y="${y}" width="${widthA}" height="${barHeight}"
            rx="3" fill="var(--pc-accent)" opacity="0.8" />
      <text x="${centerX - 28 - widthA}" y="${y + barHeight / 2 + 4}" text-anchor="end"
            fill="var(--pc-text-primary)" font-size="11" font-weight="700"
            font-family="var(--pc-font)">${projA}</text>

      <!-- Player B (right) -->
      <rect x="${centerX + 24}" y="${y}" width="${widthB}" height="${barHeight}"
            rx="3" fill="var(--pc-info)" opacity="0.8" />
      <text x="${centerX + 28 + widthB}" y="${y + barHeight / 2 + 4}" text-anchor="start"
            fill="var(--pc-text-primary)" font-size="11" font-weight="700"
            font-family="var(--pc-font)">${projB}</text>
    `;
  }).join('');

  return `
    <div class="pc-card">
      <div class="pc-card-header">
        <h3>Projected Stats Comparison</h3>
      </div>
      <div class="pc-card-body" style="display:flex;justify-content:center">
        <svg viewBox="0 0 ${totalWidth} ${totalHeight}" width="100%" height="${totalHeight}"
             preserveAspectRatio="xMidYMin meet" style="max-width:500px">
          <!-- Legend -->
          <rect x="40" y="6" width="12" height="12" rx="2" fill="var(--pc-accent)" />
          <text x="56" y="16" fill="var(--pc-text-secondary)" font-size="11"
                font-family="var(--pc-font)">${playerA.shortName || playerA.name}</text>

          <rect x="${totalWidth - 120}" y="6" width="12" height="12" rx="2" fill="var(--pc-info)" />
          <text x="${totalWidth - 104}" y="16" fill="var(--pc-text-secondary)" font-size="11"
                font-family="var(--pc-font)">${playerB.shortName || playerB.name}</text>

          ${bars}
        </svg>
      </div>
    </div>
  `;
}

function bindCompareEvents(players, gameInfo) {
  const selectA = $('compare-player-a');
  const selectB = $('compare-player-b');
  const compareArea = $('compare-area');

  if (!selectA || !selectB) return;

  function updateComparison() {
    const idA = selectA.value || null;
    const idB = selectB.value || null;
    setState({ selectedPlayers: [idA, idB] });

    if (compareArea) {
      compareArea.innerHTML = renderComparisonArea([idA, idB], players, gameInfo);
    }
  }

  selectA.addEventListener('change', updateComparison);
  selectB.addEventListener('change', updateComparison);
}
