// ============================================================================
// PicoClaw Projection Table Component
// Renders player projection data in sortable tables
// ============================================================================

import { STAT_COLUMNS, round, confidenceClass, formatFlag } from '../utils/format.js';
import { navigate } from '../router.js';

/**
 * Render a projection table for a single team.
 * @param {object} team - { abbrev, name, logo, players }
 * @param {object} gameInfo - Game metadata
 * @returns {string} HTML string
 */
export function renderTeamTable(team, gameInfo) {
  const isFinal = gameInfo.statusName === 'STATUS_FINAL';
  const starters = team.players.filter(p => p.starter && !p.didNotPlay);
  const bench = team.players.filter(p => !p.starter && !p.didNotPlay);
  const dnp = team.players.filter(p => p.didNotPlay);

  const colCount = STAT_COLUMNS.length + 3; // player + MIN + stats + Conf

  return `
    <div class="pc-card fade-in">
      <div class="pc-card-header">
        <div class="pc-flex pc-gap-sm">
          <img src="${team.logo}" alt="${team.abbrev}"
               style="width:24px;height:24px;object-fit:contain"
               onerror="this.style.display='none'">
          <h3>${team.name}</h3>
          <span class="pc-badge pc-badge-accent" style="margin-left:8px">${team.players.length} players</span>
        </div>
      </div>
      <div class="pc-table-wrap">
        <table class="pc-table">
          <thead>
            <tr>
              <th>Player</th>
              <th style="text-align:right">MIN</th>
              ${STAT_COLUMNS.map(c => `<th>${c.label}</th>`).join('')}
              <th>Conf</th>
            </tr>
          </thead>
          <tbody>
            ${starters.map(p => playerRow(p, isFinal)).join('')}
            ${bench.length > 0 ? `<tr class="proj-bench-sep"><td colspan="${colCount}">Bench</td></tr>` : ''}
            ${bench.map(p => playerRow(p, isFinal)).join('')}
            ${dnp.map(p => dnpRow(p, colCount)).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function playerRow(player, isFinal) {
  const statConfidence = {
    points: player.ptsConfidence || player.confidence,
    rebounds: player.rebConfidence || player.confidence,
    assists: player.astConfidence || player.confidence,
  };

  const statCells = STAT_COLUMNS.map(col => {
    const actual = player.stats[col.key] || 0;
    const proj = round(player.projected[col.key]);
    const same = proj === actual || isFinal;

    const conf = statConfidence[col.key];
    const dotClass = conf !== undefined && !isFinal
      ? `stat-conf-dot dot-${confidenceClass(conf)}`
      : '';
    const dot = dotClass
      ? `<span class="${dotClass}" title="${col.label}: ${conf}%"></span>`
      : '';

    return `
      <td>
        <div class="pc-stat-cell">
          <span class="pc-stat-actual">${actual}</span>
          ${!same ? `<span class="pc-stat-projected">${dot}${proj}</span>` : ''}
        </div>
      </td>
    `;
  }).join('');

  const confLevel = confidenceClass(player.confidence);
  const minActual = round(player.minutes);
  const minProj = round(player.projectedMinutes);
  const minSame = minActual === minProj || isFinal;

  const flags = (player.contextFlags || [])
    .map(f => `<span class="proj-flag">${formatFlag(f)}</span>`)
    .join('');

  return `
    <tr data-player-id="${player.id || ''}">
      <td>
        <div class="proj-player-cell">
          ${player.headshot
            ? `<img class="proj-player-img" src="${player.headshot}" alt="" onerror="this.style.display='none'">`
            : ''}
          <div>
            <div class="proj-player-name">${player.shortName || player.name}</div>
            <div class="proj-player-pos">${player.position}${player.jersey ? ' #' + player.jersey : ''}${flags}</div>
          </div>
        </div>
      </td>
      <td>
        <div class="pc-stat-cell">
          <span class="pc-stat-actual">${minActual}</span>
          ${!minSame ? `<span class="pc-stat-projected">${minProj}</span>` : ''}
        </div>
      </td>
      ${statCells}
      <td>
        <span class="pc-badge pc-badge-${confLevel === 'high' ? 'success' : confLevel === 'mid' ? 'warning' : 'danger'}"
              title="${player.projectionNote || ''}">${player.confidence}%</span>
      </td>
    </tr>
  `;
}

function dnpRow(player, colCount) {
  return `
    <tr class="proj-dnp">
      <td>
        <div class="proj-player-cell">
          <div>
            <div class="proj-player-name">${player.shortName || player.name}</div>
            <div class="proj-player-pos">${player.position} - DNP${player.reason ? ': ' + player.reason : ''}</div>
          </div>
        </div>
      </td>
      <td colspan="${colCount - 1}" style="text-align:center;color:var(--pc-text-muted);font-size:12px">
        Did not play
      </td>
    </tr>
  `;
}

/**
 * Group players into teams and render all tables.
 */
export function renderAllTables(data) {
  const teamMap = {};

  for (const p of data.players) {
    const key = p.teamAbbrev;
    if (!teamMap[key]) {
      teamMap[key] = { abbrev: key, name: p.teamName, logo: p.teamLogo, players: [] };
    }
    teamMap[key].players.push(p);
  }

  return Object.values(teamMap)
    .map(team => renderTeamTable(team, data.gameInfo))
    .join('');
}
