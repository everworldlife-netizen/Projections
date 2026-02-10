const { fetchExternalJSON } = require('./client');

/**
 * Fetches a player's season averages from ESPN's athlete API.
 * This gives us the historical baseline for projections.
 */
async function getPlayerSeasonStats(playerId) {
  try {
    const data = await fetchExternalJSON(
      `https://site.api.espn.com/apis/common/v3/sports/basketball/nba/athletes/${playerId}/stats`,
      `player-stats:${playerId}`,
      300000 // 5 min cache - season averages don't change quickly
    );

    const categories = data.categories || data.splitCategories || [];
    let perGame = null;

    // Look for per-game averages in various possible structures
    for (const cat of categories) {
      if (cat.name === 'perGame' || cat.displayName === 'Per Game') {
        perGame = cat;
        break;
      }
      // Sometimes nested under splits
      for (const split of cat.splits || []) {
        if (split.name === 'Total' || split.type === 'total') {
          perGame = { stats: split.stats };
          break;
        }
      }
    }

    if (!perGame) return null;

    const stats = {};
    for (const stat of perGame.stats || []) {
      stats[stat.name] = stat.value || parseFloat(stat.displayValue) || 0;
    }

    return {
      points: stats.avgPoints || stats.points || 0,
      rebounds: stats.avgRebounds || stats.rebounds || 0,
      assists: stats.avgAssists || stats.assists || 0,
      steals: stats.avgSteals || stats.steals || 0,
      blocks: stats.avgBlocks || stats.blocks || 0,
      turnovers: stats.avgTurnovers || stats.turnovers || 0,
      minutes: stats.avgMinutes || stats.minutes || 0,
      fgMade: stats.avgFieldGoalsMade || 0,
      fgAttempted: stats.avgFieldGoalsAttempted || 0,
      threeMade: stats.avgThreePointFieldGoalsMade || 0,
      threeAttempted: stats.avgThreePointFieldGoalsAttempted || 0,
      ftMade: stats.avgFreeThrowsMade || 0,
      ftAttempted: stats.avgFreeThrowsAttempted || 0,
      oReb: stats.avgOffensiveRebounds || 0,
      dReb: stats.avgDefensiveRebounds || 0,
      fouls: stats.avgFouls || 0,
    };
  } catch (err) {
    console.log(`[PlayerStats] Could not fetch stats for player ${playerId}: ${err.message}`);
    return null;
  }
}

/**
 * Batch fetch season averages for a list of player IDs.
 * Returns a map of playerId -> season averages.
 */
async function batchGetPlayerStats(playerIds) {
  const results = {};
  // Fetch in parallel, limit concurrency to 10
  const chunks = [];
  for (let i = 0; i < playerIds.length; i += 10) {
    chunks.push(playerIds.slice(i, i + 10));
  }

  for (const chunk of chunks) {
    const promises = chunk.map(async (id) => {
      const stats = await getPlayerSeasonStats(id);
      if (stats) results[id] = stats;
    });
    await Promise.all(promises);
  }

  return results;
}

module.exports = { getPlayerSeasonStats, batchGetPlayerStats };
