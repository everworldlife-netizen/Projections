// ============================================================================
// NBA Live Projections - Frontend Application
// ============================================================================

const POLL_INTERVAL = 20000; // 20 seconds
let selectedGameId = null;
let refreshTimer = null;
let games = [];
let dataSource = 'live';

// ---- API ----

async function fetchGames() {
  const res = await fetch('/api/games');
  if (!res.ok) throw new Error('Failed to fetch games');
  return res.json();
}

async function fetchProjections(gameId) {
  const res = await fetch(`/api/games/${gameId}/projections`);
  if (!res.ok) throw new Error('Failed to fetch projections');
  return res.json();
}

async function parseUrl(url) {
  const res = await fetch('/api/parse-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) throw new Error('Failed to parse URL');
  return res.json();
}

// ---- Game Strip Rendering ----

function renderGameStrip(gamesData) {
  games = gamesData;
  const container = document.getElementById('game-selector');
  container.innerHTML = '';

  if (gamesData.length === 0) {
    document.getElementById('no-games-state').classList.remove('hidden');
    document.getElementById('empty-state').classList.add('hidden');
    return;
  }

  document.getElementById('no-games-state').classList.add('hidden');

  // Show live indicator
  const sourceEl = document.querySelector('.subtitle');
  if (sourceEl) sourceEl.textContent = 'Real-time player stat projections - Live data';

  for (const game of gamesData) {
    const card = document.createElement('div');
    const isLive = game.status === 'in_progress';
    const isActive = game.gameId === selectedGameId;
    card.className = `game-card${isActive ? ' active' : ''}`;
    card.onclick = () => selectGame(game.gameId);

    const statusClass = isLive ? 'live-status' : '';
    const statusText = formatGameStatus(game);

    card.innerHTML = `
      ${isLive ? '<div class="live-badge"><span class="live-dot"></span>LIVE</div>' : ''}
      <div class="team-row">
        <img src="${game.awayTeam.logo}" alt="${game.awayTeam.abbrev}" onerror="this.style.display='none'">
        <span class="team-abbrev">${game.awayTeam.abbrev}</span>
        <span class="team-score">${game.status !== 'scheduled' ? game.awayTeam.score : ''}</span>
      </div>
      <div class="team-row">
        <img src="${game.homeTeam.logo}" alt="${game.homeTeam.abbrev}" onerror="this.style.display='none'">
        <span class="team-abbrev">${game.homeTeam.abbrev}</span>
        <span class="team-score">${game.status !== 'scheduled' ? game.homeTeam.score : ''}</span>
      </div>
      <div class="game-status ${statusClass}">${statusText}</div>
    `;
    container.appendChild(card);
  }
}

function formatGameStatus(game) {
  if (game.status === 'final') return 'Final';
  if (game.status === 'scheduled') {
    try {
      const d = new Date(game.date);
      return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    } catch {
      return 'Scheduled';
    }
  }
  if (game.isHalftime) return 'Halftime';
  return `Q${game.period} ${game.clock}`;
}

// ---- Game Header ----

function renderGameHeader(gameData) {
  const game = games.find(g => g.gameId === selectedGameId);
  if (!game) return;

  const header = document.getElementById('game-header');
  const isLive = game.status === 'in_progress';
  const statusText = formatGameStatus(game);

  header.innerHTML = `
    <div class="ghd-team">
      <img src="${game.awayTeam.logo}" alt="${game.awayTeam.abbrev}" onerror="this.style.display='none'">
      <div class="ghd-team-info">
        <div class="ghd-name">${game.awayTeam.name}</div>
        <div class="ghd-record">${game.awayTeam.record}</div>
      </div>
      <div class="ghd-score">${game.awayTeam.score}</div>
    </div>
    <div class="ghd-vs">
      <div class="ghd-status ${isLive ? 'live' : ''}">${statusText}</div>
    </div>
    <div class="ghd-team">
      <div class="ghd-score">${game.homeTeam.score}</div>
      <div class="ghd-team-info" style="text-align:right">
        <div class="ghd-name">${game.homeTeam.name}</div>
        <div class="ghd-record">${game.homeTeam.record}</div>
      </div>
      <img src="${game.homeTeam.logo}" alt="${game.homeTeam.abbrev}" onerror="this.style.display='none'">
    </div>
  `;
}

// ---- Projection Tables ----

const STAT_COLS = [
  { key: 'points',    label: 'PTS',  primary: true },
  { key: 'rebounds',  label: 'REB',  primary: true },
  { key: 'assists',   label: 'AST',  primary: true },
  { key: 'steals',    label: 'STL',  primary: true },
  { key: 'blocks',    label: 'BLK',  primary: true },
  { key: 'turnovers', label: 'TO',   primary: true },
  { key: 'fgMade',    label: 'FGM',  primary: false },
  { key: 'fgAttempted', label: 'FGA', primary: false },
  { key: 'threeMade', label: '3PM',  primary: false },
  { key: 'threeAttempted', label: '3PA', primary: false },
  { key: 'ftMade',    label: 'FTM',  primary: false },
  { key: 'ftAttempted', label: 'FTA', primary: false },
];

function renderProjectionTables(data) {
  const container = document.getElementById('team-tables');
  container.innerHTML = '';

  // Group players by team
  const teamMap = {};
  for (const p of data.players) {
    const key = p.teamAbbrev;
    if (!teamMap[key]) {
      teamMap[key] = { abbrev: key, name: p.teamName, logo: p.teamLogo, players: [] };
    }
    teamMap[key].players.push(p);
  }

  for (const team of Object.values(teamMap)) {
    const section = document.createElement('div');
    section.className = 'team-section';

    const starters = team.players.filter(p => p.starter && !p.didNotPlay);
    const bench = team.players.filter(p => !p.starter && !p.didNotPlay);
    const dnp = team.players.filter(p => p.didNotPlay);

    section.innerHTML = `
      <div class="team-section-header">
        <img src="${team.logo}" alt="${team.abbrev}" onerror="this.style.display='none'">
        <h3>${team.name}</h3>
      </div>
      <div class="table-wrapper">
        <table class="projection-table">
          <thead>
            <tr>
              <th>Player</th>
              <th>MIN</th>
              ${STAT_COLS.map(c => `<th>${c.label}</th>`).join('')}
              <th>Conf</th>
            </tr>
          </thead>
          <tbody>
            ${starters.map(p => renderPlayerRow(p, data.gameInfo)).join('')}
            ${bench.length ? '<tr class="bench-separator"><td colspan="' + (STAT_COLS.length + 3) + '">Bench</td></tr>' : ''}
            ${bench.map(p => renderPlayerRow(p, data.gameInfo)).join('')}
            ${dnp.map(p => renderDNPRow(p)).join('')}
          </tbody>
        </table>
      </div>
    `;
    container.appendChild(section);
  }
}

function renderPlayerRow(player, gameInfo) {
  const isFinal = gameInfo.statusName === 'STATUS_FINAL';

  // Per-stat confidence map for PTS/REB/AST
  const statConfidence = {
    points: player.ptsConfidence || player.confidence,
    rebounds: player.rebConfidence || player.confidence,
    assists: player.astConfidence || player.confidence,
  };

  const statCells = STAT_COLS.map(col => {
    const actual = player.stats[col.key] || 0;
    const proj = player.projected[col.key] || 0;
    const projRounded = Math.round(proj);
    const same = projRounded === actual || isFinal;

    // Show per-stat confidence dot for PTS/REB/AST
    const conf = statConfidence[col.key];
    const confDot = conf !== undefined && !isFinal
      ? `<span class="stat-conf-dot ${conf >= 70 ? 'dot-high' : conf >= 40 ? 'dot-mid' : 'dot-low'}" title="${col.label} confidence: ${conf}%"></span>`
      : '';

    return `
      <td>
        <div class="stat-cell">
          <span class="stat-actual">${actual}</span>
          ${!same ? `<span class="stat-projected">${confDot}${projRounded}</span>` : ''}
        </div>
      </td>
    `;
  }).join('');

  const confClass = player.confidence >= 70 ? 'confidence-high' :
                     player.confidence >= 40 ? 'confidence-mid' : 'confidence-low';

  const minActual = Math.round(player.minutes);
  const minProj = Math.round(player.projectedMinutes);
  const minSame = minActual === minProj || isFinal;

  // Context flags display
  const flags = player.contextFlags || [];
  const flagsHtml = flags.length > 0
    ? `<div class="player-flags">${flags.map(f => `<span class="flag-badge">${formatFlag(f)}</span>`).join('')}</div>`
    : '';

  return `
    <tr>
      <td>
        <div class="player-cell">
          ${player.headshot ? `<img class="player-headshot" src="${player.headshot}" alt="" onerror="this.style.display='none'">` : ''}
          <div class="player-info">
            <div class="player-name">${player.shortName || player.name}</div>
            <div class="player-meta">${player.position}${player.jersey ? ' #' + player.jersey : ''}${flagsHtml}</div>
          </div>
        </div>
      </td>
      <td>
        <div class="minutes-cell">
          <span class="minutes-actual">${minActual}</span>
          ${!minSame ? `<span class="minutes-projected">${minProj}</span>` : ''}
        </div>
      </td>
      ${statCells}
      <td>
        <span class="confidence-badge ${confClass}" title="${player.projectionNote || ''}">${player.confidence}%</span>
      </td>
    </tr>
  `;
}

function formatFlag(flag) {
  const map = {
    'blowout': 'BLOWOUT',
    'large_lead': 'LEAD',
    'foul_trouble': 'FOULS',
  };
  return map[flag] || flag;
}

function renderDNPRow(player) {
  const cols = STAT_COLS.length + 3;
  return `
    <tr class="dnp-row">
      <td>
        <div class="player-cell">
          <div class="player-info">
            <div class="player-name">${player.shortName || player.name}</div>
            <div class="player-meta">${player.position} - DNP${player.reason ? ': ' + player.reason : ''}</div>
          </div>
        </div>
      </td>
      <td colspan="${cols - 1}" style="text-align:center;color:var(--text-muted);font-size:12px">
        Did not play
      </td>
    </tr>
  `;
}

// ---- URL Parser ----

function setupUrlParser() {
  const input = document.getElementById('url-input');
  const btn = document.getElementById('url-submit');
  const zone = document.getElementById('url-drop-zone');
  const closeBtn = document.getElementById('url-results-close');

  btn.addEventListener('click', () => handleUrlSubmit());
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleUrlSubmit();
  });

  // Drag and drop support
  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.classList.add('drag-over');
  });

  zone.addEventListener('dragleave', () => {
    zone.classList.remove('drag-over');
  });

  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    const text = e.dataTransfer.getData('text/plain') || e.dataTransfer.getData('text/uri-list');
    if (text) {
      input.value = text;
      handleUrlSubmit();
    }
  });

  // Paste support
  input.addEventListener('paste', (e) => {
    setTimeout(() => {
      const val = input.value.trim();
      if (val && (val.startsWith('http') || val.includes('.com'))) {
        handleUrlSubmit();
      }
    }, 100);
  });

  closeBtn.addEventListener('click', () => {
    document.getElementById('url-results').classList.add('hidden');
  });
}

async function handleUrlSubmit() {
  const input = document.getElementById('url-input');
  const url = input.value.trim();
  if (!url) return;

  const resultsSection = document.getElementById('url-results');
  const resultsContent = document.getElementById('url-results-content');
  const resultsTitle = document.getElementById('url-results-title');

  resultsSection.classList.remove('hidden');
  resultsTitle.textContent = 'Loading...';
  resultsContent.innerHTML = '<div class="spinner"></div>';

  try {
    const result = await parseUrl(url);

    if (!result.success) {
      resultsTitle.textContent = 'Error';
      resultsContent.innerHTML = `<p style="color:var(--red)">${result.error}</p>`;
      return;
    }

    // Handle different result types
    if (result.action === 'load_game') {
      resultsTitle.textContent = result.message;
      resultsContent.innerHTML = '<p>Loading game projections...</p>';
      selectGame(result.gameId);
      setTimeout(() => resultsSection.classList.add('hidden'), 1500);
      return;
    }

    if (result.action === 'refresh_scoreboard') {
      resultsTitle.textContent = 'Scoreboard refreshed';
      resultsContent.innerHTML = '<p>Refreshed game data.</p>';
      await refresh();
      setTimeout(() => resultsSection.classList.add('hidden'), 1500);
      return;
    }

    if (result.action === 'show_player') {
      renderPlayerResult(result.data, resultsTitle, resultsContent);
      return;
    }

    if (result.action === 'show_scraped') {
      renderScrapedResult(result.data, resultsTitle, resultsContent);
      return;
    }

    resultsTitle.textContent = 'Result';
    resultsContent.innerHTML = `<pre style="white-space:pre-wrap;font-size:12px">${JSON.stringify(result, null, 2)}</pre>`;

  } catch (err) {
    resultsTitle.textContent = 'Error';
    resultsContent.innerHTML = `<p style="color:var(--red)">${err.message}</p>`;
  }
}

function renderPlayerResult(player, titleEl, contentEl) {
  titleEl.textContent = player.name || 'Player Info';
  contentEl.innerHTML = `
    <div style="display:flex;align-items:center;gap:16px;margin-bottom:16px">
      ${player.headshot ? `<img src="${player.headshot}" alt="" style="width:64px;height:64px;border-radius:50%;object-fit:cover;background:var(--bg-secondary)">` : ''}
      <div>
        <div style="font-size:18px;font-weight:700">${player.name}</div>
        <div style="color:var(--text-secondary)">${player.team} | ${player.position} | #${player.jersey}</div>
        <div style="color:var(--text-muted);font-size:12px">${player.height} | ${player.weight} | Age: ${player.age} | ${player.experience}yr exp</div>
        ${player.college ? `<div style="color:var(--text-muted);font-size:12px">${player.college}</div>` : ''}
      </div>
    </div>
    <p style="color:var(--text-secondary);font-size:12px">Use the game selector above to see this player's live projections in today's game.</p>
  `;
}

function renderScrapedResult(data, titleEl, contentEl) {
  titleEl.textContent = data.title || 'Scraped Data';

  let html = '';

  if (data.scores && data.scores.length > 0) {
    html += '<h4 style="margin:8px 0 4px;font-size:13px">Scores Found</h4>';
    for (const s of data.scores) {
      html += `<div style="font-variant-numeric:tabular-nums;font-size:14px;padding:2px 0">${s.away} - ${s.home}</div>`;
    }
  }

  if (data.playerMentions && data.playerMentions.length > 0) {
    html += '<h4 style="margin:12px 0 4px;font-size:13px">Players Mentioned</h4>';
    html += '<div>' + data.playerMentions.map(p => `<span class="scraped-player">${p}</span>`).join('') + '</div>';
  }

  if (data.tables && data.tables.length > 0) {
    for (const tbl of data.tables) {
      html += '<table>';
      html += '<thead><tr>' + tbl.headers.map(h => `<th>${h}</th>`).join('') + '</tr></thead>';
      html += '<tbody>';
      for (const row of tbl.rows.slice(0, 15)) {
        html += '<tr>' + row.map(c => `<td>${c}</td>`).join('') + '</tr>';
      }
      html += '</tbody></table>';
    }
  }

  if (!html) {
    html = '<p style="color:var(--text-secondary)">No structured NBA data found on this page.</p>';
  }

  contentEl.innerHTML = html;
}

// ---- Main Loop ----

async function selectGame(gameId) {
  selectedGameId = gameId;
  document.getElementById('projection-view').classList.remove('hidden');
  document.getElementById('empty-state').classList.add('hidden');

  // Update active card
  document.querySelectorAll('.game-card').forEach(card => card.classList.remove('active'));
  const cards = document.querySelectorAll('.game-card');
  const idx = games.findIndex(g => g.gameId === gameId);
  if (idx >= 0 && cards[idx]) cards[idx].classList.add('active');

  try {
    const data = await fetchProjections(gameId);
    renderGameHeader(data);
    renderProjectionTables(data);
  } catch (err) {
    console.error('Projection fetch error:', err);
  }
}

async function refresh() {
  try {
    const data = await fetchGames();
    dataSource = data.source || 'live';
    renderGameStrip(data.games);

    if (selectedGameId) {
      const projData = await fetchProjections(selectedGameId);
      renderGameHeader(projData);
      renderProjectionTables(projData);
    }

    document.getElementById('last-updated').textContent =
      `Updated ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })}`;
  } catch (err) {
    console.error('Refresh error:', err);
  }
}

async function init() {
  setupUrlParser();

  try {
    const data = await fetchGames();
    dataSource = data.source || 'live';
    renderGameStrip(data.games);

    // Auto-select first live game, or first game if none live
    const liveGame = data.games.find(g => g.status === 'in_progress');
    const anyGame = data.games[0];
    const autoSelect = liveGame || anyGame;

    if (autoSelect) {
      await selectGame(autoSelect.gameId);
    }
  } catch (err) {
    console.error('Init error:', err);
    document.getElementById('game-selector').innerHTML =
      '<div class="loading-msg" style="color:var(--red)">Failed to load games. Check your connection.</div>';
  }

  document.getElementById('last-updated').textContent =
    `Updated ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })}`;

  // Start polling
  refreshTimer = setInterval(refresh, POLL_INTERVAL);
}

init();
