const express = require('express');
const router = express.Router();
const { getScoreboard } = require('./espn/scoreboard');
const { getBoxscore } = require('./espn/boxscore');
const { batchGetPlayerStats } = require('./espn/playerStats');
const { projectGame } = require('./projection/engine');
const { fetchUrlData } = require('./parser/urlParser');

// GET /api/games - Today's live scoreboard from the internet
router.get('/games', async (req, res) => {
  try {
    const data = await getScoreboard();
    res.json({ ...data, source: 'live' });
  } catch (err) {
    console.error('Scoreboard error:', err.message);
    res.status(502).json({
      error: 'Unable to fetch live NBA data. Ensure internet connectivity.',
      details: err.message,
    });
  }
});

// GET /api/games/:gameId/projections - Live player projections for a game
router.get('/games/:gameId/projections', async (req, res) => {
  const gameId = req.params.gameId;

  try {
    const { players, gameInfo } = await getBoxscore(gameId);

    // Fetch season averages from the internet for projection accuracy
    const playerIds = players.filter(p => !p.didNotPlay && p.id).map(p => p.id);
    let historicals = {};
    try {
      historicals = await batchGetPlayerStats(playerIds);
      console.log(`[Routes] Loaded season averages for ${Object.keys(historicals).length}/${playerIds.length} players`);
    } catch (err) {
      console.log('[Routes] Could not fetch season averages, using statistical fallbacks:', err.message);
    }

    const projected = projectGame(players, gameInfo, historicals);
    sortPlayers(projected);
    res.json({ gameInfo, players: projected, source: 'live' });
  } catch (err) {
    console.error(`Boxscore error for ${gameId}:`, err.message);
    res.status(502).json({
      error: 'Unable to fetch live game data. Ensure internet connectivity.',
      details: err.message,
    });
  }
});

// POST /api/parse-url - Parse a dropped URL, scrape it, and extract NBA data
router.post('/parse-url', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }
    const result = await fetchUrlData(url);
    res.json(result);
  } catch (err) {
    console.error('URL parse error:', err.message);
    res.status(500).json({ error: 'Failed to parse URL', details: err.message });
  }
});

// GET /api/parse-url?url=... - GET version for convenience
router.get('/parse-url', async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) {
      return res.status(400).json({ error: 'URL query parameter is required' });
    }
    const result = await fetchUrlData(url);
    res.json(result);
  } catch (err) {
    console.error('URL parse error:', err.message);
    res.status(500).json({ error: 'Failed to parse URL', details: err.message });
  }
});

function sortPlayers(projected) {
  projected.sort((a, b) => {
    if (a.teamAbbrev !== b.teamAbbrev) return a.teamAbbrev.localeCompare(b.teamAbbrev);
    if (a.didNotPlay !== b.didNotPlay) return a.didNotPlay ? 1 : -1;
    if (a.starter !== b.starter) return a.starter ? -1 : 1;
    return (b.projected.points || 0) - (a.projected.points || 0);
  });
}

module.exports = router;
