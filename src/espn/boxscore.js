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

  // Extract game-level info with score breakdown per team
  const header = raw.header?.competitions?.[0];
  const statusObj = header?.status || {};

  let homeScore = 0;
  let awayScore = 0;
  let homeAbbrev = '';
  let awayAbbrev = '';

  for (const comp of (header?.competitors || [])) {
    const score = parseInt(comp.score, 10) || 0;
    if (comp.homeAway === 'home') {
      homeScore = score;
      homeAbbrev = comp.team?.abbreviation || '';
    } else {
      awayScore = score;
      awayAbbrev = comp.team?.abbreviation || '';
    }
  }

  const gameInfo = {
    period: statusObj.period || 0,
    clock: statusObj.displayClock || '0:00',
    totalScore: homeScore + awayScore,
    homeScore,
    awayScore,
    homeAbbrev,
    awayAbbrev,
    scoreDiff: homeScore - awayScore,
    statusName: statusObj.type?.name || '',
  };

  // Extract team-level stats from boxscore teams section
  const teamStats = extractTeamStats(raw);

  return { players, gameInfo, teamStats };
}

/**
 * Extract team-level aggregate stats from ESPN's boxscore.teams array.
 * This gives us official team totals for FGA, REB, AST etc.
 */
function extractTeamStats(raw) {
  const teams = {};
  const boxTeams = raw.boxscore?.teams || [];

  for (const teamGroup of boxTeams) {
    const abbrev = teamGroup.team?.abbreviation || '';
    if (!abbrev) continue;

    const stats = {};
    for (const statItem of teamGroup.statistics || []) {
      stats[statItem.name] = statItem.displayValue || statItem.value;
    }

    teams[abbrev] = {
      abbrev,
      name: teamGroup.team?.displayName || abbrev,
      fieldGoalsMade: parseFloat(stats.fieldGoalsMade) || 0,
      fieldGoalsAttempted: parseFloat(stats.fieldGoalsAttempted) || 0,
      fieldGoalPct: parseFloat(stats.fieldGoalPct) || 0,
      threePointMade: parseFloat(stats.threePointFieldGoalsMade) || 0,
      threePointAttempted: parseFloat(stats.threePointFieldGoalsAttempted) || 0,
      threePointPct: parseFloat(stats.threePointFieldGoalPct) || 0,
      freeThrowsMade: parseFloat(stats.freeThrowsMade) || 0,
      freeThrowsAttempted: parseFloat(stats.freeThrowsAttempted) || 0,
      freeThrowPct: parseFloat(stats.freeThrowPct) || 0,
      totalRebounds: parseFloat(stats.totalRebounds) || 0,
      offensiveRebounds: parseFloat(stats.offensiveRebounds) || 0,
      defensiveRebounds: parseFloat(stats.defensiveRebounds) || 0,
      assists: parseFloat(stats.assists) || 0,
      steals: parseFloat(stats.steals) || 0,
      blocks: parseFloat(stats.blocks) || 0,
      turnovers: parseFloat(stats.turnovers || stats.totalTurnovers) || 0,
      fouls: parseFloat(stats.fouls || stats.totalFouls) || 0,
      points: parseFloat(stats.points) || 0,
    };
  }

  return teams;
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
