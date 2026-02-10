const { fetchJSON } = require('./client');

async function getScoreboard() {
  const raw = await fetchJSON('/scoreboard', 'scoreboard', 15000);
  const games = (raw.events || []).map(normalizeGame);
  return { games };
}

function normalizeGame(event) {
  const comp = event.competitions[0];
  const status = comp.status;
  const home = comp.competitors.find(c => c.homeAway === 'home');
  const away = comp.competitors.find(c => c.homeAway === 'away');

  return {
    gameId: event.id,
    name: event.name,
    shortName: event.shortName,
    status: mapStatus(status.type.name),
    statusDetail: status.type.shortDetail || status.type.detail || '',
    period: status.period || 0,
    clock: status.displayClock || '0:00',
    isHalftime: status.type.name === 'STATUS_HALFTIME',
    homeTeam: normalizeTeam(home),
    awayTeam: normalizeTeam(away),
    date: event.date,
  };
}

function normalizeTeam(competitor) {
  return {
    id: competitor.team.id,
    abbrev: competitor.team.abbreviation,
    name: competitor.team.displayName,
    shortName: competitor.team.shortDisplayName || competitor.team.displayName,
    logo: competitor.team.logo || '',
    score: parseInt(competitor.score, 10) || 0,
    record: competitor.records ? competitor.records[0]?.summary || '' : '',
  };
}

function mapStatus(espnStatus) {
  if (espnStatus === 'STATUS_FINAL') return 'final';
  if (espnStatus === 'STATUS_SCHEDULED') return 'scheduled';
  return 'in_progress';
}

module.exports = { getScoreboard };
