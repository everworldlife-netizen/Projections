// ============================================================================
// PicoClaw Client-Side Router
// Hash-based routing for single-page navigation
// ============================================================================

const routes = new Map();
let currentRoute = null;

export function registerRoute(pattern, handler) {
  routes.set(pattern, handler);
}

export function navigate(path) {
  window.location.hash = path;
}

export function getCurrentRoute() {
  return currentRoute;
}

function matchRoute(hash) {
  const path = hash.replace(/^#\/?/, '/') || '/';

  for (const [pattern, handler] of routes) {
    const params = matchPattern(pattern, path);
    if (params !== null) {
      return { handler, params, path };
    }
  }

  return null;
}

function matchPattern(pattern, path) {
  const patternParts = pattern.split('/').filter(Boolean);
  const pathParts = path.split('/').filter(Boolean);

  if (patternParts.length !== pathParts.length) return null;

  const params = {};

  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i].startsWith(':')) {
      params[patternParts[i].slice(1)] = decodeURIComponent(pathParts[i]);
    } else if (patternParts[i] !== pathParts[i]) {
      return null;
    }
  }

  return params;
}

function handleRouteChange() {
  const hash = window.location.hash;
  const match = matchRoute(hash);

  if (match) {
    currentRoute = match;
    match.handler(match.params);
  } else {
    // Default to dashboard
    const defaultRoute = routes.get('/');
    if (defaultRoute) {
      currentRoute = { handler: defaultRoute, params: {}, path: '/' };
      defaultRoute({});
    }
  }
}

export function initRouter() {
  window.addEventListener('hashchange', handleRouteChange);
  handleRouteChange();
}
