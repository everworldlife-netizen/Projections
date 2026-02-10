// 2024-25 NBA league averages
module.exports = {
  LEAGUE_AVG_PACE: 99.5,
  LEAGUE_AVG_POINTS_PER_GAME: 113.5,
  REGULATION_MINUTES: 48,
  QUARTER_MINUTES: 12,
  OT_MINUTES: 5,

  // Default projected total minutes by role
  DEFAULT_MINUTES: {
    starterHigh: 35,
    starter: 31,
    bench: 18,
    deep: 8,
  },

  // Fallback per-game averages when we have no player history
  FALLBACK_AVERAGES: {
    points: 12, rebounds: 4.5, assists: 3, steals: 0.8,
    blocks: 0.4, turnovers: 1.8, fgMade: 4.5, fgAttempted: 10,
    threeMade: 1.5, threeAttempted: 4.2, ftMade: 2, ftAttempted: 2.8,
    oReb: 0.8, dReb: 3.2, fouls: 2.2, minutes: 24,
  },

  FALLBACK_BENCH_AVERAGES: {
    points: 7, rebounds: 3, assists: 1.5, steals: 0.5,
    blocks: 0.3, turnovers: 1, fgMade: 2.8, fgAttempted: 6.5,
    threeMade: 0.8, threeAttempted: 2.5, ftMade: 1, ftAttempted: 1.5,
    oReb: 0.5, dReb: 2, fouls: 1.8, minutes: 16,
  },

  // Below this minutes threshold, projection leans entirely on historical
  MIN_MINUTES_FOR_RATE: 3,
};
