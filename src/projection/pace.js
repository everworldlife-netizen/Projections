const {
  QUARTER_MINUTES, OT_MINUTES, REGULATION_MINUTES, LEAGUE_AVG_PACE
} = require('./defaults');

/**
 * Calculate total elapsed game minutes from period + display clock.
 * ESPN clock counts DOWN within a period.
 */
function elapsedGameMinutes(period, clock) {
  if (!period || period === 0) return 0;

  const completedRegulationPeriods = Math.min(period - 1, 4);
  const completedOTPeriods = Math.max(period - 1 - 4, 0);
  const completedMinutes =
    (completedRegulationPeriods * QUARTER_MINUTES) +
    (completedOTPeriods * OT_MINUTES);

  const currentPeriodLength = period <= 4 ? QUARTER_MINUTES : OT_MINUTES;
  const remainingInPeriod = parseClockToMinutes(clock);
  const elapsedInPeriod = currentPeriodLength - remainingInPeriod;

  return completedMinutes + Math.max(elapsedInPeriod, 0);
}

/**
 * Total expected game minutes (accounts for OT).
 */
function totalGameMinutes(period) {
  if (period <= 4) return REGULATION_MINUTES;
  return REGULATION_MINUTES + (period - 4) * OT_MINUTES;
}

/**
 * Game completion percentage (0.0 to 1.0).
 */
function gameCompletionPct(period, clock) {
  const elapsed = elapsedGameMinutes(period, clock);
  const total = totalGameMinutes(period);
  if (total === 0) return 0;
  return Math.min(elapsed / total, 1.0);
}

/**
 * Estimate game pace from combined team scoring and elapsed time.
 * Returns estimated possessions per 48 minutes.
 */
function estimateGamePace(totalScore, period, clock) {
  const elapsed = elapsedGameMinutes(period, clock);
  if (elapsed < 3) return LEAGUE_AVG_PACE;

  // Combined points per 48 minutes for both teams
  const pointsPer48 = (totalScore / elapsed) * 48;
  // Average NBA game: ~228 combined points from ~200 combined possessions
  // Ratio: ~1.14 points per possession
  const estimatedPace = pointsPer48 / 2.28;

  // Clamp to reasonable range (85-115 possessions)
  return Math.max(85, Math.min(115, estimatedPace));
}

function parseClockToMinutes(clock) {
  if (!clock) return 0;
  if (clock.includes(':')) {
    const [m, s] = clock.split(':').map(Number);
    return m + (s / 60);
  }
  return parseFloat(clock) / 60;
}

module.exports = {
  elapsedGameMinutes,
  totalGameMinutes,
  gameCompletionPct,
  estimateGamePace,
};
