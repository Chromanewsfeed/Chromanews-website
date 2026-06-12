export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate');

  const ESPN = 'https://site.api.espn.com/apis/site/v2/sports';

  // Only major championship / playoff competitions
  const SOURCES = [
    { key: 'nba',    label: 'NBA Finals / Playoffs', path: 'basketball/nba' },
    { key: 'nfl',    label: 'Super Bowl / NFL Playoffs', path: 'football/nfl' },
    { key: 'mlb',    label: 'World Series / MLB Playoffs', path: 'baseball/mlb' },
    { key: 'nhl',    label: 'Stanley Cup / NHL Playoffs', path: 'hockey/nhl' },
    { key: 'wc',     label: 'FIFA World Cup', path: 'soccer/fifa.world' },
    { key: 'tennis_atp', label: 'Tennis Grand Slam', path: 'tennis/atp' },
    { key: 'tennis_wta', label: 'Tennis Grand Slam (WTA)', path: 'tennis/wta' },
    { key: 'golf_pga', label: 'Golf Major (PGA)', path: 'golf/pga' },
    { key: 'golf_lpga', label: 'Golf Major (LPGA)', path: 'golf/lpga' },
    { key: 'f1',     label: 'Formula 1', path: 'racing/f1' },
  ];

  // Tennis Grand Slams + Golf Majors — keyword match on event name
  const TENNIS_MAJORS = ['australian open', 'french open', 'roland garros', 'wimbledon', 'us open'];
  const GOLF_MAJORS_MEN = ['masters', 'pga championship', 'u.s. open', 'us open', 'the open championship', 'british open'];
  const GOLF_MAJORS_WOMEN = ['chevron championship', 'u.s. women\'s open', 'us women\'s open', 'women\'s pga championship', 'amundi evian championship', 'evian championship', 'aig women\'s open', "women's open"];

  const SEVEN_DAYS_MS = 7 * 24 * 3600 * 1000;

  async function fetchJSON(url) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!r.ok) return null;
      return await r.json();
    } catch(e) { return null; }
  }

  async function fetchScoreboard(path) {
    return fetchJSON(`${ESPN}/${path}/scoreboard`);
  }

  // Hard 7-day window: nothing more than 7 days in the future, nothing older than 7 days
  function isWithinSevenDays(event) {
    if (!event) return false;
    const date = new Date(event.date);
    const now = new Date();
    const diff = date - now; // positive = future, negative = past
    if (diff > SEVEN_DAYS_MS) return false;  // more than 7 days away — hide
    if (diff < -SEVEN_DAYS_MS) return false; // more than 7 days in the past — hide
    return true;
  }

  function getEventText(event) {
    const name = (event.name || '').toLowerCase();
    const shortName = (event.shortName || '').toLowerCase();
    const notes = (event.competitions?.[0]?.notes || []).map(n => (n.headline || '').toLowerCase()).join(' ');
    return `${name} ${shortName} ${notes}`;
  }

  // Word-boundary based checks — avoids "finale" matching "final", etc.
  function isNFLMajor(event) {
    const text = getEventText(event);
    return /\bsuper bowl\b/.test(text) || /\bafc championship\b/.test(text) || /\bnfc championship\b/.test(text);
  }

  function isMLBMajor(event) {
    // Only true postseason games count (ALDS/ALCS/NLDS/NLCS/World Series)
    return event.season?.type === 3;
  }

  function isNBAMajor(event) {
    const text = getEventText(event);
    if (event.season?.type !== 3) return false;
    return /\bfinals?\b/.test(text);
  }

  function isNHLMajor(event) {
    const text = getEventText(event);
    return /\bstanley cup final\b/.test(text);
  }

  function isMajorTournament(event, list) {
    const name = (event.name || event.shortName || '').toLowerCase();
    return list.some(m => name.includes(m));
  }

  function isF1Race(event) {
    const text = getEventText(event);
    // Exclude practice / qualifying / sprint-only sessions; keep the actual race (and sprint races)
    if (/\bpractice\b/.test(text)) return false;
    if (/\bqualifying\b/.test(text)) return false;
    return true;
  }

  function isClincher(event) {
    const seriesData = event.competitions?.[0]?.series || event.series;
    if (seriesData && seriesData.completedGames != null && seriesData.totalCompetitions) {
      const summary = (seriesData.summary || '').toLowerCase();
      if (summary.includes('wins series') || summary.includes('won series')) return true;
    }
    const text = getEventText(event);
    return /\bchampionship\b/.test(text) || /\bsuper bowl\b/.test(text) || /\bworld series\b/.test(text) || /\bstanley cup final\b/.test(text) || /\bnba finals?\b/.test(text);
  }

  function parseEvent(event, leagueLabel) {
    try {
      const comp = event.competitions?.[0];
      if (!comp) return null;
      const competitors = comp.competitors || [];
      const home = competitors.find(c => c.homeAway === 'home');
      const away = competitors.find(c => c.homeAway === 'away');

      let series = null;
      const seriesData = comp.series || event.series;
      if (seriesData && (seriesData.summary || (seriesData.completedGames != null))) {
        series = {
          summary: seriesData.summary || '',
          completedGames: seriesData.completedGames,
          totalCompetitions: seriesData.totalCompetitions,
        };
      }

      return {
        league: leagueLabel,
        name: event.name || event.shortName || '',
        status: event.status?.type?.description || '',
        state: event.status?.type?.state || '',
        date: event.date,
        home: home ? { name: home.team?.displayName || home.team?.shortDisplayName, score: home.score, logo: home.team?.logo, winner: home.winner || false } : null,
        away: away ? { name: away.team?.displayName || away.team?.shortDisplayName, score: away.score, logo: away.team?.logo, winner: away.winner || false } : null,
        venue: comp.venue?.fullName || '',
        series: series,
      };
    } catch(e) { return null; }
  }

  // World Cup group standings — fetch from ESPN standings endpoint (v2 API, requires season param)
  async function fetchWorldCupStandings() {
    const year = new Date().getFullYear();
    const data = await fetchJSON(`https://site.api.espn.com/apis/v2/sports/soccer/fifa.world/standings?season=${year}`);
    if (!data || !Array.isArray(data.children)) return null;
    const groups = [];
    data.children.forEach(group => {
      const groupName = group.name || group.abbreviation || '';
      const entries = (group.standings?.entries || []).map(entry => {
        const stats = {};
        (entry.stats || []).forEach(s => { stats[s.name] = s.displayValue; });
        return {
          team: entry.team?.displayName || entry.team?.shortDisplayName || entry.team?.name || entry.team?.location || '',
          logo: entry.team?.logos?.[0]?.href || '',
          played: stats.gamesPlayed || '0',
          wins: stats.wins || '0',
          draws: stats.ties || stats.draws || '0',
          losses: stats.losses || '0',
          goalDiff: stats.pointDifferential || stats.goalDifferential || '0',
          goalsFor: stats.pointsFor || stats.goalsFor || '-',
          goalsAgainst: stats.pointsAgainst || stats.goalsAgainst || '-',
          points: stats.points || '0',
        };
      });
      if (entries.length) groups.push({ group: groupName, teams: entries });
    });
    return groups.length ? groups : null;
  }

  // World Cup upcoming fixtures (next 7 days, to match site-wide window)
  async function fetchWorldCupFixtures() {
    const data = await fetchScoreboard('soccer/fifa.world');
    if (!data || !Array.isArray(data.events)) return null;
    const upcoming = data.events.filter(e => {
      const state = e.status?.type?.state;
      return state === 'pre' && isWithinSevenDays(e);
    }).map(e => parseEvent(e, 'FIFA World Cup')).filter(Boolean);
    return upcoming.length ? upcoming : null;
  }

  function findNextGame(allEvents, excludeIds, checkFn) {
    const now = new Date();
    const upcoming = allEvents
      .filter(e => {
        const state = e.status?.type?.state;
        const date = new Date(e.date);
        if (state !== 'pre' || date <= now || excludeIds.has(e.id)) return false;
        if (checkFn && !checkFn(e)) return false;
        return true;
      })
      .sort((a, b) => new Date(a.date) - new Date(b.date));
    return upcoming.length ? parseEvent(upcoming[0], '') : null;
  }

  // World Cup games happening today or tomorrow — surfaced directly in Scores tab
  async function fetchWorldCupUpcomingSoon() {
    const data = await fetchScoreboard('soccer/fifa.world');
    if (!data || !Array.isArray(data.events)) return null;
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfTomorrow = new Date(startOfToday.getTime() + 2 * 86400000);
    const soon = data.events.filter(e => {
      const state = e.status?.type?.state;
      const date = new Date(e.date);
      return state === 'pre' && date >= now && date < endOfTomorrow;
    }).map(e => parseEvent(e, 'FIFA World Cup')).filter(Boolean);
    return soon.length ? soon : null;
  }

  const results = await Promise.all(SOURCES.map(async (src) => {
    const data = await fetchScoreboard(src.path);
    if (!data || !Array.isArray(data.events)) return null;

    let majorCheck = null;
    switch (src.key) {
      case 'nfl': majorCheck = isNFLMajor; break;
      case 'mlb': majorCheck = isMLBMajor; break;
      case 'nba': majorCheck = isNBAMajor; break;
      case 'nhl': majorCheck = isNHLMajor; break;
      case 'tennis_atp':
      case 'tennis_wta':
        majorCheck = (e) => isMajorTournament(e, TENNIS_MAJORS); break;
      case 'golf_pga':
        majorCheck = (e) => isMajorTournament(e, GOLF_MAJORS_MEN); break;
      case 'golf_lpga':
        majorCheck = (e) => isMajorTournament(e, GOLF_MAJORS_WOMEN); break;
      case 'f1':
        majorCheck = isF1Race; break;
      // wc — no extra filter, every event is championship-level
    }

    let filtered = data.events.filter(e => isWithinSevenDays(e));
    if (majorCheck) filtered = filtered.filter(majorCheck);

    const relevant = filtered.map(e => parseEvent(e, src.label)).filter(Boolean);

    // Find next upcoming major game for this league (not already in the filtered list)
    const includedIds = new Set(filtered.map(e => e.id));
    const nextGame = findNextGame(data.events, includedIds, majorCheck);

    if (!relevant.length && !nextGame) return null;
    return { key: src.key, label: src.label, events: relevant, nextGame };
  }));

  let active = results.filter(Boolean);

  // World Cup: attach group standings + upcoming fixtures
  const wcIndex = active.findIndex(r => r.key === 'wc');
  const [wcStandings, wcFixtures, wcUpcomingSoon] = await Promise.all([fetchWorldCupStandings(), fetchWorldCupFixtures(), fetchWorldCupUpcomingSoon()]);

  if (wcStandings || wcFixtures || wcUpcomingSoon) {
    if (wcIndex > -1) {
      active[wcIndex].standings = wcStandings;
      active[wcIndex].fixtures = wcFixtures;
      if (wcUpcomingSoon) {
        const existingKeys = new Set(active[wcIndex].events.map(e => e.name + e.date));
        wcUpcomingSoon.forEach(e => {
          if (!existingKeys.has(e.name + e.date)) active[wcIndex].events.push(e);
        });
      }
    } else if (wcFixtures || wcUpcomingSoon) {
      active.push({ key: 'wc', label: 'FIFA World Cup', events: wcUpcomingSoon || [], standings: wcStandings, fixtures: wcFixtures });
    }
  }

  res.status(200).json({
    active,
    updated: new Date().toISOString(),
  });
}
