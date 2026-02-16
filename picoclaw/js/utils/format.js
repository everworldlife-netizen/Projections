// ============================================================================
// PicoClaw Formatting Utilities
// ============================================================================

/**
 * Round a number for stat display.
 */
export function round(value, decimals = 0) {
  if (value == null || isNaN(value)) return 0;
  return decimals === 0 ? Math.round(value) : +value.toFixed(decimals);
}

/**
 * Format a game status string from game data.
 */
export function formatGameStatus(game) {
  if (game.status === 'final') return 'Final';
  if (game.status === 'scheduled') {
    try {
      const d = new Date(game.date);
      return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    } catch {
      return 'Scheduled';
    }
  }
  if (game.isHalftime) return 'Halftime';
  return `Q${game.period} ${game.clock}`;
}

/**
 * Format a context flag for display.
 */
export function formatFlag(flag) {
  const map = {
    blowout: 'BLOWOUT',
    large_lead: 'LEAD',
    foul_trouble: 'FOULS',
  };
  return map[flag] || flag.toUpperCase();
}

/**
 * Format a timestamp as a short time string.
 */
export function formatTime(date = new Date()) {
  return date.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  });
}

/**
 * Get the confidence level class name.
 */
export function confidenceClass(confidence) {
  if (confidence >= 70) return 'high';
  if (confidence >= 40) return 'mid';
  return 'low';
}

/**
 * Get the CSS color variable for a confidence level.
 */
export function confidenceColor(confidence) {
  if (confidence >= 70) return 'var(--pc-success)';
  if (confidence >= 40) return 'var(--pc-warning)';
  return 'var(--pc-danger)';
}

/**
 * Stat column definitions.
 */
export const STAT_COLUMNS = [
  { key: 'points',        label: 'PTS', primary: true },
  { key: 'rebounds',       label: 'REB', primary: true },
  { key: 'assists',        label: 'AST', primary: true },
  { key: 'steals',         label: 'STL', primary: true },
  { key: 'blocks',         label: 'BLK', primary: true },
  { key: 'turnovers',      label: 'TO',  primary: true },
  { key: 'fgMade',         label: 'FGM', primary: false },
  { key: 'fgAttempted',    label: 'FGA', primary: false },
  { key: 'threeMade',      label: '3PM', primary: false },
  { key: 'threeAttempted', label: '3PA', primary: false },
  { key: 'ftMade',         label: 'FTM', primary: false },
  { key: 'ftAttempted',    label: 'FTA', primary: false },
];

/**
 * Primary stat columns (for summary views).
 */
export const PRIMARY_STATS = STAT_COLUMNS.filter(c => c.primary);
