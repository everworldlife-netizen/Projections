const { gameCompletionPct, estimateGamePace, totalGameMinutes } = require('./pace');
const {
  LEAGUE_AVG_PACE, DEFAULT_MINUTES, FALLBACK_AVERAGES,
  FALLBACK_BENCH_AVERAGES, MIN_MINUTES_FOR_RATE
} = require('./defaults');

const PROJECTED_STATS = [
  'points', 'rebounds', 'assists', 'steals', 'blocks', 'turnovers',
  'fgMade', 'fgAttempted', 'threeMade', 'threeAttempted',
  'ftMade', 'ftAttempted', 'oReb', 'dReb', 'fouls',
];

/**
 * Project final stat line for a single player.
 *
 * Uses a time-weighted blend between:
 * 1. Rate-based projection: extrapolate current per-minute production
 * 2. Historical projection: season averages adjusted for game pace
 *
 * As the game progresses, trust shifts from historical to rate-based.
 * An S-curve (Hermite interpolation) prevents over-trusting small samples.
 */
function projectPlayer(player, gameInfo, historical = null) {
  // Skip DNP players
  if (player.didNotPlay) {
    return {
      ...player,
      projected: zeroStats(),
      projectedMinutes: 0,
      confidence: 100,
      paceMultiplier: 1,
      projectionNote: player.reason || 'Did not play',
    };
  }

  const fallback = player.starter ? FALLBACK_AVERAGES : FALLBACK_BENCH_AVERAGES;
  const hist = historical || fallback;
  const { period, clock, totalScore, statusName } = gameInfo;

  const isFinal = statusName === 'STATUS_FINAL';
  const completionPct = isFinal ? 1.0 : gameCompletionPct(period, clock);
  const gamePace = estimateGamePace(totalScore, period, clock);
  const paceMultiplier = gamePace / LEAGUE_AVG_PACE;

  // If game is final, just return actual stats as projections
  if (isFinal) {
    const projected = {};
    for (const stat of PROJECTED_STATS) {
      projected[stat] = player.stats[stat] || 0;
    }
    return {
      ...player,
      projected,
      projectedMinutes: round1(player.minutes),
      confidence: 100,
      paceMultiplier: round2(paceMultiplier),
      projectionNote: 'Final',
    };
  }

  const projectedMinutes = estimateTotalMinutes(player, completionPct, hist);
  const minutesPlayed = player.minutes;

  // Weight: how much to trust current-game rate vs. historical prior
  let weight = 0;
  if (minutesPlayed >= MIN_MINUTES_FOR_RATE && projectedMinutes > 0) {
    const rawWeight = minutesPlayed / projectedMinutes;
    weight = smoothWeight(rawWeight);
  }

  const projected = {};
  for (const stat of PROJECTED_STATS) {
    const current = player.stats[stat] || 0;
    const histAvg = hist[stat] || 0;

    // Rate-based: extrapolate current production across projected minutes
    let rateProjection = 0;
    if (minutesPlayed >= MIN_MINUTES_FOR_RATE) {
      rateProjection = (current / minutesPlayed) * projectedMinutes;
    }

    // Historical: season average adjusted for game pace
    const historicalProjection = histAvg * paceMultiplier;

    // Blend rate-based and historical
    const raw = (weight * rateProjection) + ((1 - weight) * historicalProjection);

    // Floor: projection can never go below actual current stats
    projected[stat] = Math.max(round1(raw), current);
  }

  // Ensure shooting consistency: made can't exceed attempted
  projected.fgMade = Math.min(projected.fgMade, projected.fgAttempted);
  projected.threeMade = Math.min(projected.threeMade, projected.threeAttempted);
  projected.ftMade = Math.min(projected.ftMade, projected.ftAttempted);

  // Validate points vs. shooting: PTS should be ~ 2*FGM + 3PM + FTM
  // (just a sanity check, not enforced strictly since actual could deviate)

  const confidence = Math.round(
    Math.min(weight * 100 + (minutesPlayed >= 20 ? 15 : 0), 100)
  );

  return {
    ...player,
    projected,
    projectedMinutes: round1(projectedMinutes),
    confidence,
    paceMultiplier: round2(paceMultiplier),
    projectionNote: getProjectionNote(weight, minutesPlayed, completionPct),
  };
}

/**
 * Estimate total minutes the player will play this game.
 */
function estimateTotalMinutes(player, completionPct, hist) {
  const histMinutes = hist.minutes || (player.starter ? DEFAULT_MINUTES.starter : DEFAULT_MINUTES.bench);
  const defaultMins = Math.min(histMinutes, 42); // cap at 42

  if (completionPct < 0.05 || player.minutes < 0.5) {
    return defaultMins;
  }

  // Extrapolate from current usage
  const extrapolated = player.minutes / completionPct;

  // Clamp to reasonable range
  const clamped = Math.min(Math.max(extrapolated, 0), 53);

  // Blend extrapolated with historical, trusting extrapolation more as game progresses
  const blendWeight = Math.min(completionPct * 1.8, 1.0);
  return (blendWeight * clamped) + ((1 - blendWeight) * defaultMins);
}

/**
 * S-curve smoothing: 3w^2 - 2w^3 (Hermite interpolation)
 * Suppresses noisy rate-based signal early, reaches full trust late.
 */
function smoothWeight(w) {
  const c = Math.min(Math.max(w, 0), 1);
  return 3 * c * c - 2 * c * c * c;
}

function getProjectionNote(weight, minutesPlayed, completionPct) {
  if (completionPct > 0.9) return 'Near final';
  if (weight > 0.7) return 'High confidence - rate-based';
  if (weight > 0.3) return 'Blended projection';
  if (minutesPlayed >= MIN_MINUTES_FOR_RATE) return 'Early game - mostly historical';
  return 'Pre-game / too early';
}

/**
 * Project all players for a game.
 */
function projectGame(players, gameInfo, playerHistoricals = {}) {
  return players.map(p => {
    const hist = playerHistoricals[p.id] || null;
    return projectPlayer(p, gameInfo, hist);
  });
}

function zeroStats() {
  const z = {};
  for (const stat of PROJECTED_STATS) z[stat] = 0;
  return z;
}

function round1(n) { return Math.round(n * 10) / 10; }
function round2(n) { return Math.round(n * 100) / 100; }

module.exports = { projectPlayer, projectGame };
