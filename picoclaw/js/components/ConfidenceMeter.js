// ============================================================================
// PicoClaw Confidence Meter Component
// Circular or linear confidence visualization
// ============================================================================

import { confidenceClass, confidenceColor } from '../utils/format.js';

/**
 * Render a circular confidence meter (SVG donut).
 */
export function renderConfidenceMeter(confidence, size = 64) {
  const level = confidenceClass(confidence);
  const color = confidenceColor(confidence);
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (confidence / 100) * circumference;
  const center = size / 2;

  return `
    <div class="pc-confidence" style="flex-direction:column;gap:4px">
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        <!-- Background ring -->
        <circle cx="${center}" cy="${center}" r="${radius}"
                fill="none" stroke="var(--pc-border)" stroke-width="4" />
        <!-- Confidence arc -->
        <circle cx="${center}" cy="${center}" r="${radius}"
                fill="none" stroke="${color}" stroke-width="4"
                stroke-linecap="round"
                stroke-dasharray="${circumference}"
                stroke-dashoffset="${offset}"
                transform="rotate(-90 ${center} ${center})"
                style="transition: stroke-dashoffset 0.6s ease" />
        <!-- Center text -->
        <text x="${center}" y="${center + 1}" text-anchor="middle" dominant-baseline="middle"
              fill="var(--pc-text-primary)" font-size="${size * 0.22}" font-weight="700"
              font-family="var(--pc-font)">${confidence}%</text>
      </svg>
      <span class="pc-badge pc-badge-${level === 'high' ? 'success' : level === 'mid' ? 'warning' : 'danger'}"
            style="font-size:9px">${level === 'high' ? 'HIGH' : level === 'mid' ? 'MED' : 'LOW'}</span>
    </div>
  `;
}

/**
 * Render an inline linear confidence bar.
 */
export function renderConfidenceBar(confidence, width = 60) {
  const color = confidenceColor(confidence);
  const fillWidth = (confidence / 100) * width;

  return `
    <div class="pc-confidence">
      <div class="pc-confidence-bar" style="width:${width}px">
        <div class="pc-confidence-fill" style="width:${fillWidth}px;background:${color}"></div>
      </div>
      <span class="pc-confidence-label" style="color:${color}">${confidence}%</span>
    </div>
  `;
}
