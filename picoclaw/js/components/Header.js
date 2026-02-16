// ============================================================================
// PicoClaw Header Component
// ============================================================================

import { getState, subscribe } from '../state.js';
import { $ } from '../utils/dom.js';
import { formatTime } from '../utils/format.js';

export function renderHeader() {
  const header = $('header');
  if (!header) return;

  header.innerHTML = `
    <div class="header-left">
      <button class="header-menu-btn" id="menu-toggle">\u2630</button>
      <div class="header-breadcrumb" id="breadcrumb">
        <span>Dashboard</span>
      </div>
    </div>
    <div class="header-right">
      <div class="header-search">
        <span class="header-search-icon">\u2315</span>
        <input type="text" class="pc-input" id="url-search"
               placeholder="Paste ESPN / NBA URL..." />
      </div>
      <div class="header-status">
        <span id="last-update-time">--</span>
        <span class="status-dot" id="status-dot"></span>
      </div>
    </div>
  `;

  bindHeaderEvents();
}

function bindHeaderEvents() {
  const menuBtn = $('menu-toggle');
  if (menuBtn) {
    menuBtn.addEventListener('click', () => {
      const sidebar = $('sidebar');
      sidebar.classList.toggle('open');
    });
  }

  const searchInput = $('url-search');
  if (searchInput) {
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const url = searchInput.value.trim();
        if (url) {
          handleUrlParse(url);
          searchInput.value = '';
        }
      }
    });

    searchInput.addEventListener('paste', () => {
      setTimeout(() => {
        const val = searchInput.value.trim();
        if (val && (val.startsWith('http') || val.includes('.com'))) {
          handleUrlParse(val);
          searchInput.value = '';
        }
      }, 100);
    });
  }
}

async function handleUrlParse(url) {
  try {
    const { parseUrl } = await import('../api.js');
    const result = await parseUrl(url);

    if (result.success && result.action === 'load_game' && result.gameId) {
      const { navigate } = await import('../router.js');
      navigate(`/game/${result.gameId}`);
    }
  } catch (err) {
    console.error('[Header] URL parse error:', err);
  }
}

export function updateBreadcrumb(text) {
  const bc = $('breadcrumb');
  if (bc) {
    bc.innerHTML = `<span>${text}</span>`;
  }
}

// Update timestamp on refresh
subscribe('lastUpdated', (state) => {
  const el = $('last-update-time');
  if (el && state.lastUpdated) {
    el.textContent = formatTime(new Date(state.lastUpdated));
  }
});
