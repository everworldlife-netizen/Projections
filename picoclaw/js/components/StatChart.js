// ============================================================================
// PicoClaw Stat Chart Component
// SVG bar chart comparing actual vs projected stats
// ============================================================================

import { PRIMARY_STATS, round, confidenceColor } from '../utils/format.js';

/**
 * Render an SVG bar chart showing actual vs projected for primary stats.
 */
export function renderStatChart(player, isFinal = false) {
  const stats = PRIMARY_STATS;
  const barHeight = 20;
  const gap = 8;
  const labelWidth = 36;
  const valueWidth = 40;
  const chartLeft = labelWidth + 8;
  const chartRight = valueWidth + 8;
  const chartWidth = 300;
  const totalWidth = chartLeft + chartWidth + chartRight;
  const totalHeight = stats.length * (barHeight + gap) + gap;

  // Find max value for scaling
  let maxVal = 1;
  for (const col of stats) {
    const actual = player.stats[col.key] || 0;
    const proj = round(player.projected[col.key]);
    maxVal = Math.max(maxVal, actual, proj);
  }

  const bars = stats.map((col, i) => {
    const y = gap + i * (barHeight + gap);
    const actual = player.stats[col.key] || 0;
    const proj = round(player.projected[col.key]);
    const actualWidth = (actual / maxVal) * chartWidth;
    const projWidth = (proj / maxVal) * chartWidth;

    const showProj = !isFinal && proj !== actual;

    return `
      <!-- ${col.label} -->
      <text x="${labelWidth}" y="${y + barHeight / 2 + 4}" class="stat-chart-label" text-anchor="end">${col.label}</text>

      <!-- Projected bar (background) -->
      ${showProj ? `
        <rect x="${chartLeft}" y="${y}" width="${projWidth}" height="${barHeight}"
              rx="3" fill="var(--pc-accent-dim)" class="stat-chart-bar" />
      ` : ''}

      <!-- Actual bar -->
      <rect x="${chartLeft}" y="${y + (showProj ? 3 : 0)}" width="${actualWidth}" height="${showProj ? barHeight - 6 : barHeight}"
            rx="3" fill="${showProj ? 'var(--pc-accent)' : 'var(--pc-border-strong)'}" class="stat-chart-bar" />

      <!-- Values -->
      <text x="${chartLeft + chartWidth + 8}" y="${y + barHeight / 2 + 4}" class="stat-chart-value">
        ${actual}${showProj ? ` / ${proj}` : ''}
      </text>
    `;
  }).join('');

  return `
    <svg class="stat-chart" viewBox="0 0 ${totalWidth} ${totalHeight}"
         width="100%" height="${totalHeight}" preserveAspectRatio="xMinYMin meet">
      ${bars}
    </svg>
  `;
}

/**
 * Render a mini sparkline-style bar for a single stat.
 */
export function renderMiniBar(actual, projected, maxVal = 40) {
  const w = 60;
  const h = 12;
  const actualW = Math.min((actual / maxVal) * w, w);
  const projW = Math.min((projected / maxVal) * w, w);

  return `
    <svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
      <rect x="0" y="0" width="${projW}" height="${h}" rx="2" fill="var(--pc-accent-dim)" />
      <rect x="0" y="2" width="${actualW}" height="${h - 4}" rx="2" fill="var(--pc-accent)" />
    </svg>
  `;
}
