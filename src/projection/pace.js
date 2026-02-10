// =============================================================================
// Game Clock, Pace, and Contextual Game-State Analysis
// =============================================================================

const {
  QUARTER_MINUTES, OT_MINUTES, REGULATION_MINUTES, LEAGUE_AVG_PACE,
  LEAGUE_AVG_COMBINED_POINTS, BLOWOUT_MARGIN, LARGE_LEAD_MARGIN,
  QUARTER_PACE_FACTOR,
} = require('./defaults');

// ---------------------------------------------------------------------------
// Core clock utilities
// ---------------------------------------------------------------------------

/**
 * Total elapsed game minutes from period + display clock.
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
 * Total expected game minutes (accounts for OT periods).
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
 * Minutes remaining in the game.
 */
function remainingGameMinutes(period, clock) {
  const total = totalGameMinutes(period);
  const elapsed = elapsedGameMinutes(period, clock);
  return Math.max(total - elapsed, 0);
}

// ---------------------------------------------------------------------------
// Pace estimation
// ---------------------------------------------------------------------------

/**
 * Estimate game pace from combined scoring and elapsed time.
 * Returns possessions per 48 minutes.
 *
 * Uses a Bayesian-like blend: early in the game, regress heavily toward
 * league average. As more data accumulates, trust observed pace more.
 */
function estimateGamePace(totalScore, period, clock) {
  const elapsed = elapsedGameMinutes(period, clock);
  if (elapsed < 2) return LEAGUE_AVG_PACE;

  // Observed combined points per 48 min
  const observedPtsPer48 = (totalScore / elapsed) * 48;
  // Convert to pace: ~2.28 combined pts per possession (NBA avg)
  const observedPace = observedPtsPer48 / 2.28;

  // Bayesian regression weight toward league avg
  // At 6 min elapsed: 50/50 blend. At 24 min: 80/20 observed. At 48 min: ~93/7.
  const observedWeight = elapsed / (elapsed + 6);
  const pace = (observedWeight * observedPace) + ((1 - observedWeight) * LEAGUE_AVG_PACE);

  return Math.max(82, Math.min(118, pace));
}

/**
 * Estimate the remaining-game pace factor.
 * Accounts for the fact that Q4 tends to be higher pace (crunch time,
 * intentional fouls in close games) or lower pace (clock milking in blowouts).
 */
function remainingPaceFactor(period, clock, scoreDifferential) {
  if (period > 4) return 1.05; // OT is high pace

  const remaining = remainingGameMinutes(period, clock);
  if (remaining <= 0) return 1.0;

  // Weight the pace factor of remaining quarters
  let totalWeight = 0;
  let weightedFactor = 0;

  for (let q = period; q <= 4; q++) {
    let qMinutes;
    if (q === period) {
      qMinutes = parseClockToMinutes(clock); // remaining in current quarter
    } else {
      qMinutes = QUARTER_MINUTES;
    }
    const factor = QUARTER_PACE_FACTOR[q] || 1.0;
    weightedFactor += factor * qMinutes;
    totalWeight += qMinutes;
  }

  let baseFactor = totalWeight > 0 ? weightedFactor / totalWeight : 1.0;

  // Blowout adjustment: if one team is way ahead, pace slows
  const absDiff = Math.abs(scoreDifferential);
  if (absDiff >= BLOWOUT_MARGIN) {
    baseFactor *= 0.92; // pace drops significantly in blowouts
  } else if (absDiff >= LARGE_LEAD_MARGIN) {
    baseFactor *= 0.96;
  } else if (absDiff <= 5) {
    baseFactor *= 1.02; // close games speed up slightly
  }

  return baseFactor;
}

// ---------------------------------------------------------------------------
// Game context analysis
// ---------------------------------------------------------------------------

/**
 * Analyze the current game state and return contextual factors that affect
 * projections beyond simple rate extrapolation.
 */
function analyzeGameContext(gameInfo, allPlayers) {
  const { period, clock, totalScore } = gameInfo;
  const elapsed = elapsedGameMinutes(period, clock);
  const completion = gameCompletionPct(period, clock);
  const remaining = remainingGameMinutes(period, clock);

  // Score differential (positive = home leading)
  const homeScore = gameInfo.homeScore || 0;
  const awayScore = gameInfo.awayScore || 0;
  const scoreDiff = homeScore - awayScore;
  const absDiff = Math.abs(scoreDiff);

  // Blowout detection
  const isBlowout = absDiff >= BLOWOUT_MARGIN && completion > 0.5;
  const isLargeLead = absDiff >= LARGE_LEAD_MARGIN && completion > 0.4;

  // Pace
  const currentPace = estimateGamePace(totalScore, period, clock);
  const paceMultiplier = currentPace / LEAGUE_AVG_PACE;
  const remainingPace = remainingPaceFactor(period, clock, scoreDiff);

  // Team-level shooting context from all players
  const teamStats = computeTeamStats(allPlayers);

  // Rebound opportunity: total missed shots = rebound opportunities
  const totalMissedShots = teamStats.totalFGA - teamStats.totalFGM;
  const totalMissedFTs = teamStats.totalFTA - teamStats.totalFTM;

  return {
    elapsed,
    completion,
    remaining,
    period,
    clock,
    scoreDiff,
    absDiff,
    isBlowout,
    isLargeLead,
    currentPace,
    paceMultiplier,
    remainingPace,
    teamStats,
    totalMissedShots,
    totalMissedFTs,
  };
}

/**
 * Compute aggregated team-level stats from all players.
 * Gives us context like team FG%, total rebounds, etc.
 */
function computeTeamStats(allPlayers) {
  const teams = {};

  for (const p of allPlayers) {
    if (p.didNotPlay) continue;
    const t = p.teamAbbrev;
    if (!teams[t]) {
      teams[t] = {
        totalPoints: 0, totalRebounds: 0, totalAssists: 0,
        totalFGM: 0, totalFGA: 0, total3PM: 0, total3PA: 0,
        totalFTM: 0, totalFTA: 0, totalOreb: 0, totalDreb: 0,
        totalTOV: 0, totalMinutes: 0, playerCount: 0,
      };
    }
    const s = p.stats;
    teams[t].totalPoints += s.points || 0;
    teams[t].totalRebounds += s.rebounds || 0;
    teams[t].totalAssists += s.assists || 0;
    teams[t].totalFGM += s.fgMade || 0;
    teams[t].totalFGA += s.fgAttempted || 0;
    teams[t].total3PM += s.threeMade || 0;
    teams[t].total3PA += s.threeAttempted || 0;
    teams[t].totalFTM += s.ftMade || 0;
    teams[t].totalFTA += s.ftAttempted || 0;
    teams[t].totalOreb += s.oReb || 0;
    teams[t].totalDreb += s.dReb || 0;
    teams[t].totalTOV += s.turnovers || 0;
    teams[t].totalMinutes += p.minutes || 0;
    teams[t].playerCount++;
  }

  // Compute derived rates per team
  for (const t of Object.keys(teams)) {
    const tm = teams[t];
    tm.fgPct = tm.totalFGA > 0 ? tm.totalFGM / tm.totalFGA : 0.45;
    tm.threePct = tm.total3PA > 0 ? tm.total3PM / tm.total3PA : 0.35;
    tm.ftPct = tm.totalFTA > 0 ? tm.totalFTM / tm.totalFTA : 0.78;
    tm.totalMissedFG = tm.totalFGA - tm.totalFGM;
    tm.totalMissedFT = tm.totalFTA - tm.totalFTM;
  }

  return teams;
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

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
  remainingGameMinutes,
  estimateGamePace,
  remainingPaceFactor,
  analyzeGameContext,
};
