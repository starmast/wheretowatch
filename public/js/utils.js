/**
 * Utility functions for the NFL Schedule App
 */

// Constants
export const LIVE_WINDOW_HOURS = 4;

/**
 * Configuration for filtering streaming providers.
 *
 * - includeProviders: Array of provider codes to allow. If empty, all
 *   streaming providers are shown.
 * - includeRegions: Array of region codes to allow (e.g., ['US']). If empty,
 *   region does not restrict providers.
 */
export const STREAMING_FILTERS = {
  includeProviders: [],
  includeRegions: []
};

/**
 * Format a date to show only time with timezone
 * @param {Date} dt - The date to format
 * @returns {string} Formatted time string
 */
export function formatTimeOnly(dt) {
  const opts = { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' };
  return new Intl.DateTimeFormat(undefined, opts).format(dt);
}

/**
 * Convert UTC kickoff time to Date object
 * @param {Object} game - Game object with kickoffUtc property
 * @returns {Date} Date object for kickoff time
 */
export function getKickoffDate(game) {
  return new Date(game.kickoffUtc);
}

/**
 * Check if a game is currently live
 * @param {Object} game - Game object
 * @param {Date} now - Current time
 * @returns {boolean} True if game is live
 */
export function isLiveGame(game, now) {
  if (game.status === 'LIVE') return true;
  if (game.status === 'FINAL') return false;
  
  const start = getKickoffDate(game);
  const durationMin = Number(game.estimatedDurationMinutes) > 0
    ? Number(game.estimatedDurationMinutes)
    : LIVE_WINDOW_HOURS * 60;
  const end = new Date(start.getTime() + durationMin * 60 * 1000);
  const nowMs = now.getTime();
  
  return nowMs >= start.getTime() && nowMs <= end.getTime();
}

/**
 * Get favicon URL for a domain
 * @param {string} domain - Domain name
 * @returns {string} Google favicon service URL
 */
export function getFaviconUrl(domain) {
  return `https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(domain)}`;
}

/**
 * Get NFL team logo URL
 * @param {string} abbreviation - Team abbreviation
 * @returns {string} NFL logo URL
 */
export function getTeamLogoUrl(abbreviation) {
  if (!abbreviation) return '';
  return `https://static.www.nfl.com/t_q-best/league/api/clubs/logos/${encodeURIComponent(String(abbreviation).toUpperCase())}`;
}

/**
 * Handle team logo loading errors by showing abbreviation fallback
 * @param {Event} event - Error event
 */
export function handleLogoError(event) {
  const img = event.target;
  const abbr = img.nextElementSibling;
  img.style.display = 'none';
  if (abbr) abbr.classList.remove('hidden');
}

/**
 * Process and sort providers for a game
 * @param {Object} game - Game object with providers array
 * @param {Object} [filters=STREAMING_FILTERS] - Filter options
 * @param {string[]} [filters.includeProviders] - Allowed streaming provider codes
 * @param {string[]} [filters.includeRegions] - Allowed streaming regions
 * @returns {Array} Sorted and processed providers
 */
export function processProviders(game, filters = STREAMING_FILTERS) {
  const arr = Array.isArray(game.providers) ? game.providers.slice() : [];
  const order = { TV: 0, STREAMING: 1, RADIO: 2 };

  // Sort by type and then by name
  arr.sort((a, b) =>
    (order[a.kind] ?? 99) - (order[b.kind] ?? 99) ||
    (a.name || '').localeCompare(b.name || '')
  );

  // Extract domain from URL if not provided
  for (const provider of arr) {
    if (!provider.domain && provider.url) {
      try {
        provider.domain = new URL(provider.url).hostname.replace(/^www\./, '');
      } catch (error) {
        // Ignore URL parsing errors
      }
    }
  }

  // Apply streaming filters
  const filtered = arr.filter(p => {
    const valid = (p.url && p.url.startsWith('http')) || p.domain;
    if (!valid) return false;

    if (p.kind === 'STREAMING') {
      const { includeProviders, includeRegions } = filters || {};

      if (Array.isArray(includeProviders) && includeProviders.length) {
        if (!includeProviders.includes(p.code)) return false;
      }
      if (Array.isArray(includeRegions) && includeRegions.length) {
        const regions = Array.isArray(p.regions) ? p.regions : [];
        if (!regions.some(r => includeRegions.includes(r))) return false;
      }
    }
    return true;
  });

  return filtered;
}

/**
 * Group games by date for display
 * @param {Array} games - Array of game objects
 * @returns {Array} Array of date groups with games
 */
export function groupGamesByDate(games) {
  if (games.length === 0) return [];
  
  const sortedGames = games.slice().sort((a, b) => getKickoffDate(a) - getKickoffDate(b));
  const map = new Map();
  
  for (const game of sortedGames) {
    const utcDate = getKickoffDate(game);
    
    // Create a date key using local date components to properly group games by local date
    const localYear = utcDate.getFullYear();
    const localMonth = utcDate.getMonth() + 1;
    const localDay = utcDate.getDate();
    const key = `${localYear}-${localMonth}-${localDay}`;
    
    if (!map.has(key)) {
      // Create a new date object at midnight local time for consistent grouping
      const groupDate = new Date(localYear, utcDate.getMonth(), localDay);
      map.set(key, { key, date: groupDate, games: [] });
    }
    map.get(key).games.push(game);
  }
  
  const ordered = Array.from(map.values()).sort((a, b) => a.date - b.date);
  
  // Sort games within each group and format labels
  for (const group of ordered) {
    group.games.sort((a, b) => getKickoffDate(a) - getKickoffDate(b));
    group.label = new Intl.DateTimeFormat(undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric'
    }).format(group.date);
  }
  
  return ordered;
}

/**
 * Get user's timezone string
 * @returns {string} Timezone identifier or fallback
 */
export function getUserTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local Time';
}