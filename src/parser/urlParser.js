const cheerio = require('cheerio');

/**
 * URL Parser - Handles various NBA/sports URLs that users can drop in.
 * Supports:
 *   - ESPN game URLs -> extracts game ID, loads projections
 *   - ESPN player URLs -> extracts player info
 *   - ESPN team URLs -> extracts team info
 *   - NBA.com game URLs -> extracts game info
 *   - NBA.com player URLs -> extracts player info
 *   - Generic URLs -> scrapes page for NBA-related data
 */

const URL_PATTERNS = [
  {
    name: 'espn_game',
    pattern: /espn\.com\/nba\/game(?:\/_\/gameId)?\/(\d+)/i,
    type: 'game',
    extract: (match) => ({ gameId: match[1], source: 'espn' }),
  },
  {
    name: 'espn_boxscore',
    pattern: /espn\.com\/nba\/boxscore(?:\/_\/gameId)?\/(\d+)/i,
    type: 'game',
    extract: (match) => ({ gameId: match[1], source: 'espn' }),
  },
  {
    name: 'espn_player',
    pattern: /espn\.com\/nba\/player(?:\/_\/id)?\/(\d+)(?:\/([a-z-]+))?/i,
    type: 'player',
    extract: (match) => ({ playerId: match[1], playerSlug: match[2] || '', source: 'espn' }),
  },
  {
    name: 'espn_team',
    pattern: /espn\.com\/nba\/team(?:\/_\/name)?\/([a-z]+)(?:\/([a-z-]+))?/i,
    type: 'team',
    extract: (match) => ({ teamSlug: match[1], teamName: match[2] || '', source: 'espn' }),
  },
  {
    name: 'espn_scoreboard',
    pattern: /espn\.com\/nba\/scoreboard/i,
    type: 'scoreboard',
    extract: () => ({ source: 'espn' }),
  },
  {
    name: 'nba_game',
    pattern: /nba\.com\/game\/([a-z]+-vs-[a-z]+-(\d+))/i,
    type: 'game',
    extract: (match) => ({ gameSlug: match[1], gameId: match[2], source: 'nba' }),
  },
  {
    name: 'nba_player',
    pattern: /nba\.com\/player\/(\d+)(?:\/([a-z-]+))?/i,
    type: 'player',
    extract: (match) => ({ playerId: match[1], playerSlug: match[2] || '', source: 'nba' }),
  },
  {
    name: 'nba_stats',
    pattern: /nba\.com\/stats\/player\/(\d+)/i,
    type: 'player',
    extract: (match) => ({ playerId: match[1], source: 'nba' }),
  },
  {
    name: 'basketball_reference_player',
    pattern: /basketball-reference\.com\/players\/[a-z]\/([a-z]+\d+)\.html/i,
    type: 'player',
    extract: (match) => ({ playerRef: match[1], source: 'bbref' }),
  },
  {
    name: 'basketball_reference_boxscore',
    pattern: /basketball-reference\.com\/boxscores\/(\d{9}[A-Z]{3})\.html/i,
    type: 'game',
    extract: (match) => ({ boxscoreId: match[1], source: 'bbref' }),
  },
];

/**
 * Parse a URL and determine what type of NBA content it links to.
 */
function parseUrl(url) {
  if (!url || typeof url !== 'string') {
    return { type: 'unknown', error: 'Invalid URL' };
  }

  // Normalize URL
  let normalized = url.trim();
  if (!normalized.startsWith('http')) {
    normalized = 'https://' + normalized;
  }

  try {
    new URL(normalized);
  } catch {
    return { type: 'unknown', error: 'Invalid URL format' };
  }

  for (const pattern of URL_PATTERNS) {
    const match = normalized.match(pattern.pattern);
    if (match) {
      return {
        type: pattern.type,
        name: pattern.name,
        url: normalized,
        ...pattern.extract(match),
      };
    }
  }

  return {
    type: 'generic',
    url: normalized,
    source: 'unknown',
  };
}

/**
 * Fetch and scrape data from a URL.
 * For recognized patterns, uses the appropriate ESPN API.
 * For generic URLs, scrapes the page HTML for NBA-related data.
 */
async function fetchUrlData(url) {
  const parsed = parseUrl(url);

  if (parsed.type === 'unknown') {
    return { success: false, error: parsed.error };
  }

  if (parsed.type === 'game' && parsed.source === 'espn' && parsed.gameId) {
    return {
      success: true,
      type: 'game',
      gameId: parsed.gameId,
      action: 'load_game',
      message: `Loading ESPN game #${parsed.gameId}`,
    };
  }

  if (parsed.type === 'player' && parsed.source === 'espn' && parsed.playerId) {
    try {
      const playerData = await fetchPlayerFromESPN(parsed.playerId);
      return {
        success: true,
        type: 'player',
        data: playerData,
        action: 'show_player',
        message: `Loaded player data for ${playerData.name || parsed.playerId}`,
      };
    } catch (err) {
      return { success: false, error: `Failed to fetch player: ${err.message}` };
    }
  }

  if (parsed.type === 'scoreboard') {
    return {
      success: true,
      type: 'scoreboard',
      action: 'refresh_scoreboard',
      message: 'Refreshing scoreboard',
    };
  }

  // For generic/unrecognized URLs, scrape the page
  try {
    const scraped = await scrapeGenericUrl(parsed.url);
    return {
      success: true,
      type: 'scraped',
      data: scraped,
      action: 'show_scraped',
      message: `Scraped data from ${new URL(parsed.url).hostname}`,
    };
  } catch (err) {
    return { success: false, error: `Failed to scrape URL: ${err.message}` };
  }
}

async function fetchPlayerFromESPN(playerId) {
  const res = await fetch(
    `https://site.api.espn.com/apis/common/v3/sports/basketball/nba/athletes/${playerId}`
  );
  if (!res.ok) throw new Error(`ESPN player API returned ${res.status}`);
  const data = await res.json();

  const athlete = data.athlete || data;
  return {
    id: athlete.id,
    name: athlete.displayName,
    firstName: athlete.firstName,
    lastName: athlete.lastName,
    team: athlete.team?.displayName || '',
    teamAbbrev: athlete.team?.abbreviation || '',
    position: athlete.position?.abbreviation || '',
    jersey: athlete.jersey || '',
    headshot: athlete.headshot?.href || '',
    height: athlete.displayHeight || '',
    weight: athlete.displayWeight || '',
    age: athlete.age || '',
    experience: athlete.experience?.years || 0,
    college: athlete.college?.name || '',
  };
}

async function scrapeGenericUrl(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; NBAProjections/1.0)',
    },
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const $ = cheerio.load(html);

  // Extract title
  const title = $('title').text().trim() || $('h1').first().text().trim();

  // Look for NBA-related data in the page
  const stats = [];
  const tables = [];

  // Find tables that might contain stats
  $('table').each((i, table) => {
    const headers = [];
    $(table).find('th').each((j, th) => {
      headers.push($(th).text().trim());
    });

    const rows = [];
    $(table).find('tbody tr').each((j, tr) => {
      const cells = [];
      $(tr).find('td').each((k, td) => {
        cells.push($(td).text().trim());
      });
      if (cells.length > 0) rows.push(cells);
    });

    if (headers.length > 0 && rows.length > 0) {
      tables.push({ headers, rows: rows.slice(0, 30) }); // Limit rows
    }
  });

  // Find player names and stats patterns
  const text = $('body').text();
  const playerNamePattern = /([A-Z][a-z]+ [A-Z][a-z]+)\s+(?:PTS|REB|AST|pts|reb|ast)/g;
  let match;
  while ((match = playerNamePattern.exec(text)) !== null) {
    stats.push(match[0]);
  }

  // Find score patterns
  const scorePattern = /(\d{2,3})\s*[-–]\s*(\d{2,3})/g;
  const scores = [];
  while ((match = scorePattern.exec(text)) !== null) {
    scores.push({ away: parseInt(match[1]), home: parseInt(match[2]) });
  }

  return {
    title,
    tables: tables.slice(0, 5), // Max 5 tables
    playerMentions: [...new Set(stats)].slice(0, 20),
    scores: scores.slice(0, 10),
    url,
  };
}

module.exports = { parseUrl, fetchUrlData };
