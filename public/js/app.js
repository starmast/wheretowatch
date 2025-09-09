/**
 * Main Vue.js Application for NFL Schedule Tracker
 */

import {
  formatTimeOnly,
  getKickoffDate,
  isLiveGame,
  getFaviconUrl,
  getTeamLogoUrl,
  handleLogoError,
  processProviders,
  groupGamesByDate,
  getUserTimezone
} from './utils.js';

// Vue composition API
const { createApp, computed, onMounted, onUnmounted, ref } = Vue;

/**
 * Create and configure the Vue application
 */
export function createNFLApp() {
  return createApp({
    setup() {
      // Reactive state
      const loading = ref(true);
      const error = ref(false);
      const schedule = ref([]);
      const now = ref(new Date());
      const timezone = ref(getUserTimezone());
      const selectedWeek = ref(null);
      const providerOptions = ref([]);
      const selectedProviders = ref([]);
      let nowInterval;

      // Computed properties for season timeline
      const currentWeek = computed(() => {
        if (!schedule.value.length) return undefined;
        
        const sorted = schedule.value.slice().sort((a, b) => getKickoffDate(a) - getKickoffDate(b));
        const nowMs = now.value.getTime();
        const pastOrNow = sorted.filter(g => getKickoffDate(g).getTime() <= nowMs);
        
        if (pastOrNow.length > 0) {
          return pastOrNow[pastOrNow.length - 1].week;
        }
        
        const firstFuture = sorted.find(g => getKickoffDate(g).getTime() > nowMs);
        return firstFuture ? firstFuture.week : undefined;
      });

      const earliestKickoff = computed(() => {
        if (!schedule.value.length) return undefined;
        
        let min;
        for (const game of schedule.value) {
          const time = getKickoffDate(game).getTime();
          if (min == null || time < min) min = time;
        }
        return min;
      });

      const seasonHasStarted = computed(() => {
        const earliest = earliestKickoff.value;
        if (earliest == null) return false;
        return now.value.getTime() >= earliest;
      });

      const firstWeekNumber = computed(() => {
        const weeks = Array.from(new Set(
          schedule.value
            .filter(g => g.week !== 18)
            .map(g => g.week)
        )).sort((a, b) => a - b);
        return weeks[0];
      });

      const availableFutureWeeks = computed(() => {
        const nowMs = now.value.getTime();
        const weekSet = new Set(
          schedule.value
            .filter(g => g.week !== 18)
            .filter(g => getKickoffDate(g).getTime() > nowMs)
            .map(g => g.week)
        );
        return Array.from(weekSet).sort((a, b) => a - b);
      });

      const nextWeekNumber = computed(() => availableFutureWeeks.value[0]);

      const isShowingThisWeek = computed(() => {
        // If user has explicitly selected a week, not showing "this week"
        if (selectedWeek.value != null) return false;
        if (!schedule.value.length) return false;
        // Before season starts, don't show "This week"
        if (!seasonHasStarted.value) return false;
        
        const week = currentWeek.value;
        if (week === undefined) return false;
        
        const nowMs = now.value.getTime();
        const weekUpcoming = schedule.value.filter(g => 
          g.week === week && (getKickoffDate(g).getTime() >= nowMs || isLiveGame(g, now.value))
        );
        
        return weekUpcoming.length > 0;
      });

      // Game filtering logic
      const filteredGames = computed(() => {
        const games = schedule.value;
        if (!games.length) return [];
        
        const nowMs = now.value.getTime();
        const week = currentWeek.value;
        if (week === undefined) return [];

        // Show "This week" games
        if (isShowingThisWeek.value) {
          return games.filter(g => 
            g.week === week && (getKickoffDate(g).getTime() >= nowMs || isLiveGame(g, now.value))
          );
        }

        // Before season starts, default to Week 1
        if (!seasonHasStarted.value && selectedWeek.value == null) {
          const firstWeek = firstWeekNumber.value;
          if (firstWeek != null) {
            return games.filter(g => g.week === firstWeek);
          }
        }

        // Show selected or next future week
        let targetWeek = selectedWeek.value ?? nextWeekNumber.value;
        
        // Avoid Week 18 if possible
        if (targetWeek === 18) {
          const alternative = availableFutureWeeks.value.find(w => w !== 18);
          if (alternative != null) {
            targetWeek = alternative;
          } else {
            return [];
          }
        }
        
        if (targetWeek == null) return [];
        return games.filter(g => g.week === targetWeek);
      });

      // Display text computed properties
      const timezoneText = computed(() => `Your time: ${timezone.value}`);

      const sectionTitle = computed(() => {
        if (error.value) return 'Error loading schedule';
        if (loading.value) return 'Loading…';
        if (!schedule.value.length) return 'No upcoming NFL games';
        
        const week = currentWeek.value;
        if (week === undefined) return 'No upcoming NFL games';

        if (isShowingThisWeek.value) {
          return `This week — Week ${week}`;
        }

        // Before season starts
        if (!seasonHasStarted.value && selectedWeek.value == null) {
          const firstWeek = firstWeekNumber.value;
          if (firstWeek != null) return `Week ${firstWeek}`;
        }

        let target = selectedWeek.value ?? nextWeekNumber.value;
        if (target === 18) {
          const alternative = availableFutureWeeks.value.find(w => w !== 18);
          if (alternative != null) {
            target = alternative;
          } else {
            return 'No upcoming NFL games';
          }
        }
        
        if (target == null) return 'No upcoming NFL games';
        
        if (selectedWeek.value == null || target === nextWeekNumber.value) {
          return `Next week — Week ${target}`;
        }
        
        return `Week ${target}`;
      });

      const sectionSubtitle = computed(() => {
        if (loading.value || error.value) return '';
        if (!schedule.value.length) return '';
        
        // Before season starts
        if (!seasonHasStarted.value && selectedWeek.value == null) {
          return 'All times local to you';
        }
        
        const nowMs = now.value.getTime();
        const week = currentWeek.value;
        if (week === undefined) return '';
        
        const weekUpcoming = schedule.value.filter(g => 
          g.week === week && (getKickoffDate(g).getTime() >= nowMs || isLiveGame(g, now.value))
        );
        
        return weekUpcoming.length > 0 
          ? 'Remaining games this week (live and upcoming; all times local)' 
          : 'All times local to you';
      });

      const contextText = computed(() => {
        if (loading.value) return 'Loading schedule…';
        if (error.value) return 'Load error';
        
        const games = filteredGames.value;
        if (games.length === 0) return 'No games remain in the schedule.';

        if (isShowingThisWeek.value) return 'Showing remaining games this week';

        // Before season starts
        if (!seasonHasStarted.value && selectedWeek.value == null) {
          const firstWeek = firstWeekNumber.value;
          if (firstWeek != null) return `Showing Week ${firstWeek}`;
        }

        let target = selectedWeek.value ?? nextWeekNumber.value;
        if (target === 18) {
          const alternative = availableFutureWeeks.value.find(w => w !== 18);
          if (alternative != null) {
            target = alternative;
          } else {
            return 'No upcoming NFL games';
          }
        }
        
        if (target == null) return 'No upcoming NFL games';
        
        if (selectedWeek.value == null || target === nextWeekNumber.value) {
          return 'Showing the next week of games';
        }
        
        return `Showing Week ${target}`;
      });

      const displayGroups = computed(() => {
        return groupGamesByDate(filteredGames.value);
      });

      const pickProviders = (game) =>
        processProviders(game, {
          includeProviders: selectedProviders.value
        });

      const toggleProvider = (code) => {
        const arr = selectedProviders.value;
        const idx = arr.indexOf(code);
        if (idx === -1) {
          arr.push(code);
        } else {
          arr.splice(idx, 1);
        }
      };

      // Event handlers
      const handleWeekChange = (event) => {
        const raw = event && event.target ? event.target.value : '';
        const value = raw === '' ? null : Number(raw);
        
        if (value === null || Number.isNaN(value)) {
          selectedWeek.value = null;
          return;
        }
        
        // Handle Week 18 gracefully
        if (value === 18) {
          console.warn('Week 18 selected but should be filtered out of available weeks');
          const alternative = availableFutureWeeks.value.find(w => w !== 18);
          if (alternative != null) {
            selectedWeek.value = alternative;
          } else {
            selectedWeek.value = null;
          }
        } else {
          selectedWeek.value = value;
        }
      };

      // Data loading
      const loadSchedule = async () => {
        try {
          const response = await fetch('assets/schedule.json', { cache: 'no-store' });
          if (!response.ok) throw new Error('Failed to load schedule.json');
          
          const json = await response.json();
          if (!Array.isArray(json)) throw new Error('Unexpected schedule format');
          
          // Filter out games with null kickoffUtc (unscheduled games)
          const scheduledGames = json.filter(game => game.kickoffUtc != null);
          
          scheduledGames.sort((a, b) => new Date(a.kickoffUtc) - new Date(b.kickoffUtc));
          schedule.value = scheduledGames;

          // Build list of streaming providers for filter dropdown
          const providerMap = new Map();
          for (const game of scheduledGames) {
            for (const p of Array.isArray(game.providers) ? game.providers : []) {
              if (p.kind === 'STREAMING' && p.code && !providerMap.has(p.code)) {
                providerMap.set(p.code, { code: p.code, name: p.name });
              }
            }
          }
          const options = Array.from(providerMap.values()).sort((a, b) =>
            (a.name || a.code).localeCompare(b.name || b.code)
          );
          providerOptions.value = options;
          selectedProviders.value = options.map(o => o.code);
        } catch (err) {
          console.error('Error loading schedule:', err);
          error.value = true;
        } finally {
          loading.value = false;
        }
      };

      // Lifecycle
      onMounted(() => {
        loadSchedule();
        nowInterval = setInterval(() => {
          now.value = new Date();
        }, 60_000);
      });

      onUnmounted(() => {
        if (nowInterval) {
          clearInterval(nowInterval);
        }
      });

      // Public API for template
      return {
        // State
        loading,
        error,
        selectedWeek,
        providerOptions,
        selectedProviders,
        
        // Computed properties
        timezoneText,
        contextText,
        sectionTitle,
        sectionSubtitle,
        displayGroups,
        isShowingThisWeek,
        availableFutureWeeks,

        // Methods
        pickProviders,
        toggleProvider,
        faviconUrl: getFaviconUrl,
        teamLogoUrl: getTeamLogoUrl,
        fmtTimeOnly: formatTimeOnly,
        onLogoError: handleLogoError,
        onWeekChange: handleWeekChange,
        
        // Helpers
        kickoffDate: getKickoffDate,
      };
    }
  });
}