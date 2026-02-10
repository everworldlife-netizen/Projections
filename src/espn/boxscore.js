const { fetchJSON } = require('./client');

async function getBoxscore(gameId) {
  const raw = await fetchJSON(
    `/summary?event=${gameId}`,
    `boxscore:${gameId}`,
    30000
  );

  const players = [];
  const teamPlayers = raw.boxscore?.players || [];

  for (const teamGroup of teamPlayers) {
    const teamId = teamGroup.team.id;
    const teamAbbrev = teamGroup.team.abbreviation;
    const teamName = teamGroup.team.displayName || teamGroup.team.shortDisplayName || teamAbbrev;
    const teamLogo = teamGroup.team.logo || '';

    for (const statGroup of teamGroup.statistics || []) {
      const labels = statGroup.labels || [];
      for (const athlete of statGroup.athletes || []) {
        players.push(
          normalizePlayer(athlete, labels, teamId, teamAbbrev, teamName, teamLogo)
        );
      }
    }
  }

  // Extract game-level info
  const header = raw.header?.competitions?.[0];
  const statusObj = header?.status || {};
  const gameInfo = {
    period: statusObj.period || 0,
    clock: statusObj.displayClock || '0:00',
    totalScore: 0,
    statusName: statusObj.type?.name || '',
  };

  for (const comp of (header?.competitors || [])) {
    gameInfo.totalScore += parseInt(comp.score, 10) || 0;
  }

  // Extract season averages from the game leaders if available
  const seasonAverages = extractSeasonAverages(raw);

  return { players, gameInfo, seasonAverages };
}

function extractSeasonAverages(raw) {
  const averages = {};

  // ESPN summary includes season stats for players in the "statistics" section
  const playerStats = raw.boxscore?.players || [];
  for (const teamGroup of playerStats) {
    for (const statGroup of teamGroup.statistics || []) {
      for (const athlete of statGroup.athletes || []) {
        const id = athlete.athlete?.id;
        if (!id) continue;
        // The athlete object sometimes includes season averages
        // We'll use the current game stats as a baseline and enhance with web data
        averages[id] = {
          name: athlete.athlete?.displayName || '',
        };
      }
    }
  }

  return averages;
}

function normalizePlayer(athlete, labels, teamId, teamAbbrev, teamName, teamLogo) {
  const rawStats = athlete.stats || [];
  const lookup = {};
  labels.forEach((label, i) => { lookup[label] = rawStats[i]; });

  const headshot = athlete.athlete?.headshot?.href || athlete.athlete?.headshot || '';
  const jersey = athlete.athlete?.jersey || '';

  return {
    id: athlete.athlete?.id || '',
    name: athlete.athlete?.displayName || 'Unknown',
    shortName: athlete.athlete?.shortName || '',
    position: athlete.athlete?.position?.abbreviation || '',
    jersey,
    headshot,
    starter: athlete.starter || false,
    didNotPlay: athlete.didNotPlay || false,
    reason: athlete.reason || '',
    teamId,
    teamAbbrev,
    teamName,
    teamLogo,
    minutes: parseMinutes(lookup['MIN']),
    stats: {
      points: parseInt(lookup['PTS'], 10) || 0,
      rebounds: parseInt(lookup['REB'], 10) || 0,
      assists: parseInt(lookup['AST'], 10) || 0,
      steals: parseInt(lookup['STL'], 10) || 0,
      blocks: parseInt(lookup['BLK'], 10) || 0,
      turnovers: parseInt(lookup['TO'], 10) || 0,
      oReb: parseInt(lookup['OREB'], 10) || 0,
      dReb: parseInt(lookup['DREB'], 10) || 0,
      fouls: parseInt(lookup['PF'], 10) || 0,
      ...parseSplitStat(lookup['FG'], 'fgMade', 'fgAttempted'),
      ...parseSplitStat(lookup['3PT'], 'threeMade', 'threeAttempted'),
      ...parseSplitStat(lookup['FT'], 'ftMade', 'ftAttempted'),
    },
  };
}

function parseMinutes(raw) {
  if (!raw || raw === '--') return 0;
  if (raw.includes(':')) {
    const [m, s] = raw.split(':').map(Number);
    return m + s / 60;
  }
  return parseInt(raw, 10) || 0;
}

function parseSplitStat(raw, madeKey, attemptedKey) {
  if (!raw || !raw.includes('-')) return { [madeKey]: 0, [attemptedKey]: 0 };
  const [made, attempted] = raw.split('-').map(Number);
  return { [madeKey]: made || 0, [attemptedKey]: attempted || 0 };
}

module.exports = { getBoxscore };
