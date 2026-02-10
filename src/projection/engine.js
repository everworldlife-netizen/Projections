// =============================================================================
// NBA Projection Engine v2 - Separate PTS / REB / AST Models
// =============================================================================
// Each stat category uses its own projection methodology:
//
// POINTS: Shot-composition model. Projects remaining FGA, 3PA, FTA separately
//         using usage rate, then applies shooting percentages (blending observed
//         game % with career % via Bayesian shrinkage) to derive points.
//
// REBOUNDS: Opportunity-based model. Estimates remaining missed shots
//           (rebound opportunities) from pace & team shooting context, then
//           applies the player's rebound capture rate (from observed game data
//           + positional prior + career rate).
//
// ASSISTS: Team-flow model. Projects remaining team FGM from pace and team
//          shooting context, then applies the player's assist share of team
//          made baskets (from observed game data + positional prior + career rate).
//
// All models share:
//   - Bayesian time-weighted blending (S-curve from historical to observed)
//   - Contextual adjustments (blowout, foul trouble, remaining-game pace)
//   - Minutes projection with extrapolation + blowout + foul trouble penalties
// =============================================================================

const { analyzeGameContext, gameCompletionPct } = require('./pace');
const D = require('./defaults');

const PROJECTED_STATS = [
  'points', 'rebounds', 'assists', 'steals', 'blocks', 'turnovers',
  'fgMade', 'fgAttempted', 'threeMade', 'threeAttempted',
  'ftMade', 'ftAttempted', 'oReb', 'dReb', 'fouls',
];

// ---------------------------------------------------------------------------
// Main entry points
// ---------------------------------------------------------------------------

function projectGame(allPlayers, gameInfo, playerHistoricals = {}) {
  const ctx = analyzeGameContext(gameInfo, allPlayers);
  return allPlayers.map(p => {
    const hist = playerHistoricals[p.id] || null;
    return projectPlayer(p, gameInfo, ctx, allPlayers, hist);
  });
}

function projectPlayer(player, gameInfo, ctx, allPlayers, historical) {
  // DNP
  if (player.didNotPlay) {
    return {
      ...player,
      projected: zeroStats(),
      projectedMinutes: 0,
      confidence: 100,
      ptsConfidence: 100,
      rebConfidence: 100,
      astConfidence: 100,
      paceMultiplier: 1,
      projectionNote: player.reason || 'Did not play',
      contextFlags: [],
    };
  }

  const isFinal = gameInfo.statusName === 'STATUS_FINAL';
  const fallback = player.starter ? D.FALLBACK_STARTER : D.FALLBACK_BENCH;
  const hist = historical || fallback;

  // Final game: actuals = projections
  if (isFinal) {
    const projected = {};
    for (const stat of PROJECTED_STATS) projected[stat] = player.stats[stat] || 0;
    return {
      ...player,
      projected,
      projectedMinutes: round1(player.minutes),
      confidence: 100,
      ptsConfidence: 100,
      rebConfidence: 100,
      astConfidence: 100,
      paceMultiplier: round2(ctx.paceMultiplier),
      projectionNote: 'Final',
      contextFlags: [],
    };
  }

  // ---- Minutes projection (shared by all stat models) ----
  const contextFlags = [];
  let projMins = estimateTotalMinutes(player, ctx, hist);

  // Blowout reduction
  if (ctx.isBlowout && player.starter) {
    projMins *= D.BLOWOUT_MINUTES_REDUCTION;
    contextFlags.push('blowout');
  } else if (ctx.isLargeLead && player.starter && ctx.completion > 0.6) {
    projMins *= 0.92;
    contextFlags.push('large_lead');
  }

  // Foul trouble
  const foulLimit = D.FOUL_TROUBLE_THRESHOLD[ctx.period] || 5;
  const inFoulTrouble = (player.stats.fouls || 0) >= foulLimit && ctx.completion < 0.85;
  if (inFoulTrouble) {
    projMins *= D.FOUL_TROUBLE_MINUTES_PENALTY;
    contextFlags.push('foul_trouble');
  }

  projMins = Math.max(projMins, player.minutes); // can't project fewer than played

  // Remaining player minutes
  const remainingMins = Math.max(projMins - player.minutes, 0);

  // ---- Base weight (how much to trust observed vs. historical) ----
  const baseWeight = computeBaseWeight(player.minutes, projMins);

  // ---- POINTS PROJECTION ----
  const ptsResult = projectPoints(player, hist, ctx, projMins, remainingMins, baseWeight);

  // ---- REBOUNDS PROJECTION ----
  const rebResult = projectRebounds(player, hist, ctx, allPlayers, projMins, remainingMins, baseWeight);

  // ---- ASSISTS PROJECTION ----
  const astResult = projectAssists(player, hist, ctx, allPlayers, projMins, remainingMins, baseWeight);

  // ---- Other stats (simple rate-based + historical blend) ----
  const otherStats = projectOtherStats(player, hist, ctx, projMins, remainingMins, baseWeight);

  // Assemble full projection
  const projected = {
    points: ptsResult.value,
    rebounds: rebResult.value,
    assists: astResult.value,
    ...otherStats,
    fgMade: ptsResult.fgMade,
    fgAttempted: ptsResult.fgAttempted,
    threeMade: ptsResult.threeMade,
    threeAttempted: ptsResult.threeAttempted,
    ftMade: ptsResult.ftMade,
    ftAttempted: ptsResult.ftAttempted,
    oReb: rebResult.oReb,
    dReb: rebResult.dReb,
  };

  // Floor all projected stats at actual current values
  for (const stat of PROJECTED_STATS) {
    projected[stat] = Math.max(projected[stat], player.stats[stat] || 0);
  }

  // Ensure shooting consistency
  projected.fgMade = Math.min(projected.fgMade, projected.fgAttempted);
  projected.threeMade = Math.min(projected.threeMade, projected.threeAttempted);
  projected.ftMade = Math.min(projected.ftMade, projected.ftAttempted);

  // Per-stat confidence
  const overallConf = Math.round((ptsResult.confidence + rebResult.confidence + astResult.confidence) / 3);

  return {
    ...player,
    projected,
    projectedMinutes: round1(projMins),
    confidence: overallConf,
    ptsConfidence: ptsResult.confidence,
    rebConfidence: rebResult.confidence,
    astConfidence: astResult.confidence,
    paceMultiplier: round2(ctx.paceMultiplier),
    projectionNote: buildProjectionNote(baseWeight, ctx, contextFlags),
    contextFlags,
  };
}

// =============================================================================
// POINTS PROJECTION - Shot Composition Model
// =============================================================================
// Instead of simply extrapolating total points per minute, we model the
// individual scoring components:
//   1. Project remaining FGA using per-minute shot rate (usage proxy)
//   2. Project remaining 3PA as proportion of FGA
//   3. Project remaining FTA from foul-drawing rate
//   4. Apply Bayesian-blended shooting percentages to each category
//   5. Points = (FGM - 3PM) * 2 + 3PM * 3 + FTM * 1
//
// This is far more accurate than flat rate projection because it correctly
// handles situations where a player is shooting hot/cold from 3 but normal
// from 2, or getting to the line at unusual rates.
// =============================================================================

function projectPoints(player, hist, ctx, projMins, remainingMins, baseWeight) {
  const s = player.stats;
  const mins = player.minutes;

  // --- Current game rates (per minute) ---
  const hasSufficientShots = mins >= D.MIN_MINUTES_FOR_SHOOTING && s.fgAttempted >= 3;

  // Observed per-minute shot rates this game
  const gameFGARate = mins > 0 ? s.fgAttempted / mins : 0;
  const game3PARate = mins > 0 ? s.threeAttempted / mins : 0;
  const gameFTARate = mins > 0 ? s.ftAttempted / mins : 0;

  // Historical per-minute rates (from season averages)
  const histMins = hist.minutes || (player.starter ? 30 : 18);
  const histFGARate = histMins > 0 ? (hist.fgAttempted || 0) / histMins : 0.35;
  const hist3PARate = histMins > 0 ? (hist.threeAttempted || 0) / histMins : 0.12;
  const histFTARate = histMins > 0 ? (hist.ftAttempted || 0) / histMins : 0.08;

  // Blend shot volume rates (weight shifts to observed as game progresses)
  const volWeight = hasSufficientShots ? baseWeight : 0;
  const blendedFGARate = blend(gameFGARate, histFGARate, volWeight);
  const blended3PARate = blend(game3PARate, hist3PARate, volWeight);
  const blendedFTARate = blend(gameFTARate, histFTARate, volWeight);

  // Project remaining shot attempts using remaining-game pace factor
  const paceFactor = ctx.remainingPace;
  const remainFGA = blendedFGARate * remainingMins * paceFactor;
  const remain3PA = blended3PARate * remainingMins * paceFactor;
  const remainFTA = blendedFTARate * remainingMins * paceFactor;

  // Total projected attempts
  const totalFGA = s.fgAttempted + remainFGA;
  const total3PA = s.threeAttempted + remain3PA;
  const totalFTA = s.ftAttempted + remainFTA;

  // --- Shooting percentages (Bayesian blended) ---
  // For FG%: blend observed game FG% with career FG%, giving more weight
  // to career with small samples (Bayesian shrinkage).
  // The "pseudo-count" approach: treat career % as having N prior shots.
  const PRIOR_FGA = 12;  // equivalent to ~12 prior FGA worth of career data
  const PRIOR_3PA = 8;   // equivalent to ~8 prior 3PA
  const PRIOR_FTA = 6;   // equivalent to ~6 prior FTA

  const histFGPct = hist.fgPct || (hist.fgAttempted > 0 ? hist.fgMade / hist.fgAttempted : D.LEAGUE_AVG_TEAM_FG_PCT);
  const hist3Pct = hist.threePct || (hist.threeAttempted > 0 ? hist.threeMade / hist.threeAttempted : D.LEAGUE_AVG_TEAM_3P_PCT);
  const histFTPct = hist.ftPct || (hist.ftAttempted > 0 ? hist.ftMade / hist.ftAttempted : D.LEAGUE_AVG_TEAM_FT_PCT);

  // Bayesian posterior: (observed_makes + prior_count * prior_pct) / (observed_attempts + prior_count)
  const fgPct = bayesianPct(s.fgMade, s.fgAttempted, histFGPct, PRIOR_FGA);
  const threePct = bayesianPct(s.threeMade, s.threeAttempted, hist3Pct, PRIOR_3PA);
  const ftPct = bayesianPct(s.ftMade, s.ftAttempted, histFTPct, PRIOR_FTA);

  // Project remaining makes
  const remainFGM = remainFGA * fgPct;
  const remain3PM = remain3PA * threePct;
  const remainFTM = remainFTA * ftPct;

  // Total projected makes
  const totalFGM = s.fgMade + remainFGM;
  const total3PM = s.threeMade + remain3PM;
  const totalFTM = s.ftMade + remainFTM;

  // Points = 2-pointers * 2 + 3-pointers * 3 + FT * 1
  const twoPointers = totalFGM - total3PM;
  const projectedPoints = (twoPointers * 2) + (total3PM * 3) + (totalFTM * 1);

  // Confidence: based on shot sample size and game completion
  let conf = Math.round(baseWeight * 85);
  if (s.fgAttempted >= 10) conf = Math.min(conf + 10, 98);
  if (s.fgAttempted >= 15) conf = Math.min(conf + 5, 99);
  if (ctx.completion > 0.85) conf = Math.min(conf + 10, 99);

  return {
    value: round1(projectedPoints),
    fgMade: round1(totalFGM),
    fgAttempted: round1(totalFGA),
    threeMade: round1(total3PM),
    threeAttempted: round1(total3PA),
    ftMade: round1(totalFTM),
    ftAttempted: round1(totalFTA),
    confidence: Math.min(conf, 99),
  };
}

// =============================================================================
// REBOUNDS PROJECTION - Opportunity-Based Model
// =============================================================================
// Rebounds are NOT independent of game context. They depend on:
//   1. Missed shots (rebound opportunities) - a function of team shooting %
//   2. The player's rebound capture rate (% of available rebounds they grab)
//   3. Position (centers get far more rebounds than guards)
//   4. Team rebound rate (some teams crash boards harder)
//
// Model:
//   remainingRebOpportunities = (remaining team FGA * (1 - FG%)) +
//                                (remaining team FTA * (1 - FT%) * 0.14)
//                                [0.14 because ~14% of missed FTs become live rebounds]
//   projReb = currentReb + (remainingRebOpp * playerRebCaptureRate)
// =============================================================================

function projectRebounds(player, hist, ctx, allPlayers, projMins, remainingMins, baseWeight) {
  const s = player.stats;
  const mins = player.minutes;

  // --- Player's rebound capture rate ---
  // Observed in this game: player rebounds / total rebounds available
  const teamAbbrev = player.teamAbbrev;
  const oppAbbrev = Object.keys(ctx.teamStats).find(k => k !== teamAbbrev) || '';

  // Total rebounds grabbed by all players so far
  let totalGameRebounds = 0;
  for (const p of allPlayers) {
    if (!p.didNotPlay) totalGameRebounds += p.stats.rebounds || 0;
  }

  // Observed rebound rate for this player (% of all game rebounds)
  const observedRebRate = totalGameRebounds > 0 ? s.rebounds / totalGameRebounds : 0;

  // Observed per-minute rebound rate
  const observedRebPerMin = mins > 0 ? s.rebounds / mins : 0;

  // Historical per-minute rebound rate
  const histMins = hist.minutes || (player.starter ? 30 : 18);
  const histRebPerMin = histMins > 0 ? (hist.rebounds || 0) / histMins : 0.15;

  // Positional prior (expected share of team rebounds)
  const posRebShare = D.POSITION_REBOUND_SHARE[player.position] || 0.12;

  // Blend three signals:
  //   1. Observed per-minute rate (strongest signal when sample is large)
  //   2. Historical per-minute rate (career baseline)
  //   3. Positional share of estimated remaining team rebounds
  const hasSufficientData = mins >= D.MIN_MINUTES_FOR_RATE && s.rebounds >= 1;
  const rateWeight = hasSufficientData ? baseWeight : 0;

  // Method A: Rate extrapolation
  const rateBlendedPerMin = blend(observedRebPerMin, histRebPerMin, rateWeight);
  const rateProjectedRemaining = rateBlendedPerMin * remainingMins * ctx.remainingPace;
  const rateTotal = s.rebounds + rateProjectedRemaining;

  // Method B: Opportunity-based projection
  // Estimate remaining missed shots (rebound opportunities)
  const teamData = ctx.teamStats[teamAbbrev];
  const oppData = ctx.teamStats[oppAbbrev];

  let oppBasedTotal = 0;
  if (teamData && oppData && ctx.elapsed > 3) {
    // Per-minute miss rate for each team
    const teamMissRate = ctx.elapsed > 0 ? teamData.totalMissedFG / ctx.elapsed : 0.9;
    const oppMissRate = ctx.elapsed > 0 ? oppData.totalMissedFG / ctx.elapsed : 0.9;

    // Remaining misses (rebound opportunities)
    const remainTeamMisses = teamMissRate * ctx.remaining * ctx.remainingPace;
    const remainOppMisses = oppMissRate * ctx.remaining * ctx.remainingPace;
    const totalRemainingMisses = remainTeamMisses + remainOppMisses;

    // Player's capture rate: blend observed share with positional + historical
    const observedShare = totalGameRebounds > 3 ? s.rebounds / totalGameRebounds : posRebShare;
    const histShare = hist.rebounds ? hist.rebounds / (D.LEAGUE_AVG_TEAM_REB * 2) : posRebShare;
    const captureRate = blend(observedShare, blend(histShare, posRebShare, 0.5), rateWeight);

    // Opportunity-based remaining rebounds
    // ~ 70% of missed FGs become rebounds (rest go out of bounds)
    const remainingRebOps = totalRemainingMisses * 0.70;
    oppBasedTotal = s.rebounds + (remainingRebOps * captureRate);
  } else {
    oppBasedTotal = rateTotal; // Not enough data for opportunity model
  }

  // Blend rate-based and opportunity-based (50/50 when both available, rate-only when early)
  const oppWeight = (teamData && ctx.elapsed > 5) ? 0.45 : 0;
  const finalReb = blend(oppBasedTotal, rateTotal, oppWeight);

  // Split into OREB/DREB using observed or historical ratio
  const totalReb = round1(finalReb);
  const orebRatio = s.rebounds > 0 ? s.oReb / s.rebounds :
                    hist.oReb && hist.rebounds ? hist.oReb / hist.rebounds : 0.20;
  const projOreb = round1(totalReb * orebRatio);
  const projDreb = round1(totalReb - projOreb);

  // Confidence
  let conf = Math.round(rateWeight * 80);
  if (s.rebounds >= 5) conf = Math.min(conf + 10, 98);
  if (oppWeight > 0) conf = Math.min(conf + 5, 98); // opportunity model adds confidence
  if (ctx.completion > 0.85) conf = Math.min(conf + 10, 99);

  return {
    value: totalReb,
    oReb: projOreb,
    dReb: projDreb,
    confidence: Math.min(conf, 99),
  };
}

// =============================================================================
// ASSISTS PROJECTION - Team-Flow Model
// =============================================================================
// Assists depend on:
//   1. Team made field goals remaining (can't assist without a made basket)
//   2. The player's assist share (% of team FGM they assist on)
//   3. Team pace and shooting efficiency
//   4. Position (PGs dominate assists; centers rarely lead)
//
// Model:
//   remainingTeamFGM = estimatedRemainingFGA * blendedTeamFG%
//   playerAssistShare = blend(observed, historical, positional)
//   projAssists = currentAst + (remainingTeamFGM * assistShare)
// =============================================================================

function projectAssists(player, hist, ctx, allPlayers, projMins, remainingMins, baseWeight) {
  const s = player.stats;
  const mins = player.minutes;

  const teamAbbrev = player.teamAbbrev;
  const teamData = ctx.teamStats[teamAbbrev];

  // --- Player's assist share of team made field goals ---
  const hasSufficientData = mins >= D.MIN_MINUTES_FOR_USAGE && s.assists >= 1;

  // Observed: player assists / team FGM
  let observedAstShare = 0;
  if (teamData && teamData.totalFGM > 0) {
    observedAstShare = s.assists / teamData.totalFGM;
  }

  // Historical assist share
  const histAstShare = hist.assists && hist.fgMade
    ? hist.assists / (hist.fgMade * 5) // approximate: team has ~5x a player's FGM
    : D.POSITION_ASSIST_SHARE[player.position] || 0.12;

  // Positional prior
  const posAstShare = D.POSITION_ASSIST_SHARE[player.position] || 0.12;

  // Observed per-minute rate
  const observedAstPerMin = mins > 0 ? s.assists / mins : 0;
  const histMins = hist.minutes || (player.starter ? 30 : 18);
  const histAstPerMin = histMins > 0 ? (hist.assists || 0) / histMins : 0.10;

  const rateWeight = hasSufficientData ? baseWeight : 0;

  // Method A: Rate-based projection
  const rateBlended = blend(observedAstPerMin, histAstPerMin, rateWeight);
  const rateTotal = s.assists + (rateBlended * remainingMins * ctx.remainingPace);

  // Method B: Team-flow projection
  let flowTotal = 0;
  if (teamData && ctx.elapsed > 5) {
    // Estimate remaining team FGA
    const teamFGAPerMin = ctx.elapsed > 0 ? teamData.totalFGA / ctx.elapsed : 1.85;
    const remainingTeamFGA = teamFGAPerMin * ctx.remaining * ctx.remainingPace;

    // Team shooting % for remaining game (Bayesian blend of observed + league avg)
    const teamFGPct = bayesianPct(
      teamData.totalFGM, teamData.totalFGA, D.LEAGUE_AVG_TEAM_FG_PCT, 40
    );

    // Remaining team made baskets
    const remainingTeamFGM = remainingTeamFGA * teamFGPct;

    // Player's assist share (blend observed with historical + positional)
    const astShareBlend = blend(
      observedAstShare,
      blend(histAstShare, posAstShare, 0.5),
      rateWeight
    );

    // But player only assists while they're on the floor
    // Adjust for their proportion of remaining time
    const playerOnFloorPct = projMins > 0
      ? Math.min(remainingMins / ctx.remaining, 1.0)
      : 0;

    flowTotal = s.assists + (remainingTeamFGM * astShareBlend * playerOnFloorPct);
  } else {
    flowTotal = rateTotal;
  }

  // Blend rate-based and flow-based
  const flowWeight = (teamData && ctx.elapsed > 5) ? 0.50 : 0;
  const finalAst = blend(flowTotal, rateTotal, flowWeight);

  // Confidence
  let conf = Math.round(rateWeight * 80);
  if (s.assists >= 4) conf = Math.min(conf + 10, 98);
  if (flowWeight > 0) conf = Math.min(conf + 5, 98);
  if (ctx.completion > 0.85) conf = Math.min(conf + 10, 99);

  return {
    value: round1(finalAst),
    confidence: Math.min(conf, 99),
  };
}

// =============================================================================
// Other stats - Simple rate-based + historical blend
// =============================================================================

function projectOtherStats(player, hist, ctx, projMins, remainingMins, baseWeight) {
  const s = player.stats;
  const mins = player.minutes;
  const histMins = hist.minutes || (player.starter ? 30 : 18);

  function projectStat(current, histAvg) {
    const observedRate = mins > 0 ? current / mins : 0;
    const histRate = histMins > 0 ? histAvg / histMins : 0;
    const w = mins >= D.MIN_MINUTES_FOR_RATE ? baseWeight : 0;
    const blendedRate = blend(observedRate, histRate, w);
    const projected = current + (blendedRate * remainingMins * ctx.remainingPace);
    return round1(Math.max(projected, current));
  }

  return {
    steals: projectStat(s.steals, hist.steals || 0),
    blocks: projectStat(s.blocks, hist.blocks || 0),
    turnovers: projectStat(s.turnovers, hist.turnovers || 0),
    fouls: projectStat(s.fouls, hist.fouls || 0),
  };
}

// =============================================================================
// Minutes Projection
// =============================================================================

function estimateTotalMinutes(player, ctx, hist) {
  const histMins = hist.minutes || (player.starter ? D.DEFAULT_MINUTES.starter : D.DEFAULT_MINUTES.bench);
  const defaultMins = Math.min(histMins, 42);

  if (ctx.completion < 0.05 || player.minutes < 0.5) {
    return defaultMins;
  }

  // Extrapolate from current usage
  const extrapolated = player.minutes / ctx.completion;
  const clamped = Math.min(Math.max(extrapolated, 0), 53);

  // Blend weight: trust extrapolation more as game progresses
  const blendW = Math.min(ctx.completion * 2.0, 1.0);
  return (blendW * clamped) + ((1 - blendW) * defaultMins);
}

// =============================================================================
// Shared utilities
// =============================================================================

/**
 * S-curve weight: 3w^2 - 2w^3 (Hermite interpolation)
 * Suppresses noisy early-game signal, reaches full trust near end.
 */
function smoothWeight(w) {
  const c = clamp(w, 0, 1);
  return 3 * c * c - 2 * c * c * c;
}

/**
 * Compute base blend weight from minutes played vs projected total.
 */
function computeBaseWeight(minutesPlayed, projectedMinutes) {
  if (minutesPlayed < D.MIN_MINUTES_FOR_RATE || projectedMinutes <= 0) return 0;
  return smoothWeight(minutesPlayed / projectedMinutes);
}

/**
 * Bayesian posterior shooting percentage.
 * Treats career % as a prior with `priorCount` pseudo-observations.
 * As observed attempts grow, the posterior converges to observed %.
 *
 * posterior = (observed_makes + priorCount * priorPct) / (observed_attempts + priorCount)
 */
function bayesianPct(observedMakes, observedAttempts, priorPct, priorCount) {
  return (observedMakes + priorCount * priorPct) / (observedAttempts + priorCount);
}

/**
 * Linear blend: a * weight + b * (1 - weight)
 */
function blend(observed, historical, weight) {
  const w = clamp(weight, 0, 1);
  return (w * observed) + ((1 - w) * historical);
}

function buildProjectionNote(baseWeight, ctx, flags) {
  const parts = [];
  if (ctx.completion > 0.9) parts.push('Near final');
  else if (baseWeight > 0.7) parts.push('High confidence');
  else if (baseWeight > 0.3) parts.push('Blended');
  else parts.push('Early game');

  if (flags.includes('blowout')) parts.push('blowout adj.');
  if (flags.includes('large_lead')) parts.push('lead adj.');
  if (flags.includes('foul_trouble')) parts.push('foul trouble');

  return parts.join(' | ');
}

function zeroStats() {
  const z = {};
  for (const stat of PROJECTED_STATS) z[stat] = 0;
  return z;
}

function clamp(v, min, max) { return Math.min(Math.max(v, min), max); }
function round1(n) { return Math.round(n * 10) / 10; }
function round2(n) { return Math.round(n * 100) / 100; }

module.exports = { projectPlayer, projectGame };
