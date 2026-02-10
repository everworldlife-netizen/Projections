// =============================================================================
// NBA Projection Constants - 2024-25 Season
// =============================================================================

module.exports = {
  // --- League-wide pace & scoring ---
  LEAGUE_AVG_PACE: 99.5,             // possessions per 48 min
  LEAGUE_AVG_TEAM_POINTS: 113.5,     // points per team per game
  LEAGUE_AVG_COMBINED_POINTS: 227,   // combined per game
  LEAGUE_AVG_TEAM_FGA: 88.5,         // field goal attempts per team
  LEAGUE_AVG_TEAM_FG_PCT: 0.471,     // league-wide FG%
  LEAGUE_AVG_TEAM_3PA: 35.5,         // three-point attempts per team
  LEAGUE_AVG_TEAM_3P_PCT: 0.363,     // league-wide 3P%
  LEAGUE_AVG_TEAM_FTA: 22.5,         // free throw attempts per team
  LEAGUE_AVG_TEAM_FT_PCT: 0.785,     // league-wide FT%
  LEAGUE_AVG_TEAM_REB: 43.5,         // total rebounds per team
  LEAGUE_AVG_TEAM_OREB: 10.5,        // offensive rebounds per team
  LEAGUE_AVG_TEAM_AST: 25.5,         // assists per team
  LEAGUE_AVG_TEAM_TOV: 14.0,         // turnovers per team

  // --- Game clock ---
  REGULATION_MINUTES: 48,
  QUARTER_MINUTES: 12,
  OT_MINUTES: 5,

  // --- Minutes projection ---
  DEFAULT_MINUTES: {
    starterHigh: 36,    // franchise/All-Star players
    starter: 31,        // typical starter
    bench: 20,          // rotation player
    deep: 8,            // deep bench
  },

  MIN_MINUTES_FOR_RATE: 3,           // below this, pure historical
  MIN_MINUTES_FOR_SHOOTING: 5,       // below this, don't trust shooting %
  MIN_MINUTES_FOR_USAGE: 6,          // below this, don't trust usage rate

  // --- Blowout thresholds ---
  BLOWOUT_MARGIN: 25,                // point differential to consider blowout
  LARGE_LEAD_MARGIN: 18,             // large lead that may reduce starter mins
  BLOWOUT_MINUTES_REDUCTION: 0.82,   // multiply projected mins by this in blowout

  // --- Foul trouble ---
  FOUL_TROUBLE_THRESHOLD: {          // fouls that indicate trouble by quarter
    1: 2, 2: 3, 3: 4, 4: 5,
  },
  FOUL_TROUBLE_MINUTES_PENALTY: 0.88,

  // --- Contextual scoring multipliers ---
  // Points per possession distribution breakdown (NBA average)
  SCORING_DISTRIBUTION: {
    twoPointPct: 0.52,     // % of scoring from 2-pointers
    threePointPct: 0.35,   // % of scoring from 3-pointers
    freeThrowPct: 0.13,    // % of scoring from free throws
  },

  // --- Position-based rebound expectations (% of team total) ---
  POSITION_REBOUND_SHARE: {
    C:  0.225,    // centers ~22.5% of team rebounds
    PF: 0.175,    // power forwards ~17.5%
    SF: 0.135,    // small forwards ~13.5%
    SG: 0.100,    // shooting guards ~10%
    PG: 0.085,    // point guards ~8.5%
    G:  0.090,    // generic guard
    F:  0.155,    // generic forward
  },

  // --- Position-based assist expectations (% of team total) ---
  POSITION_ASSIST_SHARE: {
    PG: 0.275,    // point guards ~27.5% of team assists
    SG: 0.165,    // shooting guards ~16.5%
    SF: 0.130,    // small forwards ~13%
    PF: 0.110,    // power forwards ~11%
    C:  0.100,    // centers ~10%
    G:  0.220,    // generic guard
    F:  0.120,    // generic forward
  },

  // --- Quarter-by-quarter scoring pace (relative to average) ---
  // NBA games tend to have higher scoring in Q1 and Q4
  QUARTER_PACE_FACTOR: {
    1: 1.02,    // Q1 slightly above average (opening energy)
    2: 0.97,    // Q2 slightly below (bench rotations)
    3: 0.98,    // Q3 slightly below (halftime adjustments)
    4: 1.03,    // Q4 above average (crunch time, intentional fouls)
  },

  // --- Fallback averages when no historical data ---
  FALLBACK_STARTER: {
    points: 14, rebounds: 5, assists: 3.2, steals: 0.9,
    blocks: 0.5, turnovers: 2.0, fgMade: 5.2, fgAttempted: 11.5,
    threeMade: 1.6, threeAttempted: 4.5, ftMade: 2.1, ftAttempted: 2.8,
    oReb: 0.9, dReb: 3.6, fouls: 2.3, minutes: 30,
    fgPct: 0.452, threePct: 0.356, ftPct: 0.790,
    usageRate: 0.20, assistRate: 0.15, reboundRate: 0.10,
  },

  FALLBACK_BENCH: {
    points: 8, rebounds: 3.2, assists: 1.8, steals: 0.5,
    blocks: 0.3, turnovers: 1.1, fgMade: 3.0, fgAttempted: 7.0,
    threeMade: 0.9, threeAttempted: 2.8, ftMade: 1.1, ftAttempted: 1.5,
    oReb: 0.5, dReb: 2.2, fouls: 1.8, minutes: 18,
    fgPct: 0.429, threePct: 0.321, ftPct: 0.773,
    usageRate: 0.16, assistRate: 0.10, reboundRate: 0.08,
  },
};
