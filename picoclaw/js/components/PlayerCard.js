// ============================================================================
// PicoClaw Player Card Component
// Detailed player stat card with projected vs actual
// ============================================================================

import { PRIMARY_STATS, round, confidenceClass, confidenceColor } from '../utils/format.js';
import { renderStatChart } from './StatChart.js';
import { renderConfidenceMeter } from './ConfidenceMeter.js';

/**
 * Render a detailed player card.
 */
export function renderPlayerCard(player, gameInfo) {
  const isFinal = gameInfo?.statusName === 'STATUS_FINAL';

  const statsHtml = PRIMARY_STATS.map(col => {
    const actual = player.stats[col.key] || 0;
    const proj = round(player.projected[col.key]);
    return `
      <div class="player-stat-block">
        <div class="player-stat-value">${actual}${!isFinal && proj !== actual ? `<span style="color:var(--pc-accent);font-size:14px"> / ${proj}</span>` : ''}</div>
        <div class="player-stat-label">${col.label}</div>
      </div>
    `;
  }).join('');

  const flags = (player.contextFlags || [])
    .map(f => `<span class="proj-flag">${f}</span>`)
    .join(' ');

  return `
    <div class="pc-card fade-in">
      <div class="player-detail-card">
        ${player.headshot
          ? `<img class="player-detail-headshot" src="${player.headshot}" alt="${player.name}" onerror="this.style.display='none'">`
          : ''}
        <div class="player-detail-info">
          <div class="player-detail-name">${player.name} ${flags}</div>
          <div class="player-detail-meta">
            ${player.teamName} | ${player.position}${player.jersey ? ' | #' + player.jersey : ''}
          </div>
          <div class="player-detail-stats">${statsHtml}</div>
        </div>
        <div style="text-align:center">
          ${renderConfidenceMeter(player.confidence)}
          <div style="margin-top:8px;font-size:11px;color:var(--pc-text-secondary)">
            ${round(player.minutes)} / ${round(player.projectedMinutes)} MIN
          </div>
        </div>
      </div>
      <div class="pc-card-body">
        ${renderStatChart(player, isFinal)}
      </div>
    </div>
  `;
}

/**
 * Render a compact player card for comparison view.
 */
export function renderPlayerCardCompact(player, gameInfo) {
  const isFinal = gameInfo?.statusName === 'STATUS_FINAL';

  const statsHtml = PRIMARY_STATS.map(col => {
    const actual = player.stats[col.key] || 0;
    const proj = round(player.projected[col.key]);
    return `
      <div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--pc-border-light)">
        <span style="color:var(--pc-text-secondary);font-size:12px">${col.label}</span>
        <span>
          <span style="font-weight:600">${actual}</span>
          ${!isFinal && proj !== actual ? `<span style="color:var(--pc-accent);font-size:12px"> &rarr; ${proj}</span>` : ''}
        </span>
      </div>
    `;
  }).join('');

  return `
    <div class="pc-card fade-in">
      <div class="pc-card-body">
        <div class="pc-flex pc-gap-md" style="margin-bottom:12px">
          ${player.headshot
            ? `<img class="pc-avatar-lg" src="${player.headshot}" alt="" onerror="this.style.display='none'">`
            : ''}
          <div>
            <div style="font-weight:700;font-size:15px">${player.shortName || player.name}</div>
            <div style="font-size:12px;color:var(--pc-text-secondary)">${player.teamName} | ${player.position}</div>
          </div>
        </div>
        ${statsHtml}
        <div style="margin-top:12px;text-align:center">
          ${renderConfidenceMeter(player.confidence)}
        </div>
      </div>
    </div>
  `;
}
