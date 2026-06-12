export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate');

  const ESPN = 'https://site.api.espn.com/apis/site/v2/sports';

  // Only major championship / playoff competitions
  const SOURCES = [
    { key: 'nba',    label: 'NBA Finals / Playoffs', path: 'basketball/nba', playoffOnly: true },
    { key: 'nfl',    label: 'Super Bowl / NFL Playoffs', path: 'football/nfl', playoffOnly: true },
    { key: 'mlb',    label: 'World Series / MLB Playoffs', path: 'baseball/mlb', playoffOnly: true },
    { key: 'nhl',    label: 'Stanley Cup / NHL Playoffs', path: 'hockey/nhl', playoffOnly: true },
    { key: 'wc',     label: 'FIFA World Cup', path: 'soccer/fifa.world', playoffOnly: false },
    { key: 'tennis_atp', label: 'Tennis Grand Slam', path: 'tennis/atp', playoffOnly: true },
    { key: 'tennis_wta', label: 'Tennis Grand Slam (WTA)', path: 'tennis/wta', playoffOnly: true },
    { key: 'golf',   label: 'Golf Major', path: 'golf/pga', playoffOnly: true },
    { key: 'f1',     label: 'Formula 1', path: 'racing/f1', playoffOnly: false },
  ];

  // Tennis Grand Slams + Golf Majors — keyword match on event name
  const TENNIS_MAJORS = ['australian open', 'french open', 'roland garros', 'wimbledon', 'us open'];
  const GOLF_MAJORS = ['masters', 'pga championship', 'u.s. open', 'us open', 'the open championship', 'british open'];

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

  function isRecent(event, isSeriesClincher) {
    if (!event) return false;
    const status = event.status?.type?.state; // 'pre', 'in', 'post'
    const date = new Date(event.date);
    const now = new Date();
    const hoursDiff = (now - date) / 3600000;
    if (status === 'in') return true;
    if (status === 'pre') return hoursDiff > -168 && hoursDiff < 1;
    if (status === 'post') {
      // Series-clinching / championship game — keep visible for 7 days
      if (isSeriesClincher) return hoursDiff < 168;
      // Regular game — keep visible for 24h
      return hoursDiff < 24;
    }
    return false;
  }

  function isClincher(event) {
    // Series complete (4-0 through 4-3) — the deciding game of a best-of-7
    const seriesData = event.competitions?.[0]?.series || event.series;
    if (seriesData && seriesData.completedGames != null && seriesData.totalCompetitions) {
      const summary = (seriesData.summary || '').toLowerCase();
      if (summary.includes('wins series') || summary.includes('won series')) return true;
    }
    // World Series / Super Bowl / Stanley Cup Final / NBA Finals — single championship game text
    const name = (event.name || '').toLowerCase();
    const notes = (event.competitions?.[0]?.notes || []).map(n => (n.headline || '').toLowerCase()).join(' ');
    const text = name + ' ' + notes;
    return text.includes('championship') || text.includes('super bowl') || text.includes('world series game') === false && text.includes('world series');
  }

  function isPlayoffGame(event, key) {
    // ESPN marks playoff games via season.type === 3 (postseason) for most leagues
    const seasonType = event.season?.type;
    if (seasonType === 3) return true;
    // Fallback: check notes/name for playoff keywords
    const name = (event.name || '').toLowerCase();
    const notes = (event.competitions?.[0]?.notes || []).map(n => (n.headline || '').toLowerCase()).join(' ');
    const text = name + ' ' + notes;
    const keywords = ['playoff', 'final', 'championship', 'world series', 'super bowl', 'stanley cup', 'conference final', 'semifinal', 'quarterfinal', 'round of'];
    return keywords.some(k => text.includes(k));
  }

  function isMajorTournament(event, key) {
    const name = (event.name || event.shortName || '').toLowerCase();
    const list = key === 'golf' ? GOLF_MAJORS : TENNIS_MAJORS;
    return list.some(m => name.includes(m));
  }

  function parseEvent(event, leagueLabel) {
    try {
      const comp = event.competitions?.[0];
      if (!comp) return null;
      const competitors = comp.competitors || [];
      const home = competitors.find(c => c.homeAway === 'home');
      const away = competitors.find(c => c.homeAway === 'away');

      // Series info (playoffs) — e.g. "Oilers lead series 3-2"
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

  // World Cup group standings — fetch from ESPN standings endpoint
  async function fetchWorldCupStandings() {
    const data = await fetchJSON(`${ESPN}/soccer/fifa.world/standings`);
    if (!data || !Array.isArray(data.children)) return null;
    const groups = [];
    data.children.forEach(group => {
      const groupName = group.name || group.abbreviation || '';
      const entries = (group.standings?.entries || []).map(entry => {
        const stats = {};
        (entry.stats || []).forEach(s => { stats[s.name] = s.displayValue; });
        return {
          team: entry.team?.displayName || entry.team?.shortDisplayName || '',
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

  // World Cup upcoming fixtures (next 14 days)
  async function fetchWorldCupFixtures() {
    const data = await fetchScoreboard('soccer/fifa.world');
    if (!data || !Array.isArray(data.events)) return null;
    const now = new Date();
    const upcoming = data.events.filter(e => {
      const state = e.status?.type?.state;
      const date = new Date(e.date);
      const daysDiff = (date - now) / 86400000;
      return state === 'pre' && daysDiff >= 0 && daysDiff < 14;
    }).map(e => parseEvent(e, 'FIFA World Cup')).filter(Boolean);
    return upcoming.length ? upcoming : null;
  }
  const results = await Promise.all(SOURCES.map(async (src) => {
    const data = await fetchScoreboard(src.path);
    if (!data || !Array.isArray(data.events)) return null;

    let filtered = data.events.filter(e => isRecent(e, isClincher(e)));

    if (src.key === 'nba' || src.key === 'nfl' || src.key === 'mlb' || src.key === 'nhl') {
      filtered = filtered.filter(e => isPlayoffGame(e, src.key));
    } else if (src.key === 'tennis_atp' || src.key === 'tennis_wta' || src.key === 'golf') {
      filtered = filtered.filter(e => isMajorTournament(e, src.key));
    }
    // wc (World Cup) and f1 — no extra filter, every event in that endpoint is championship-level

    const relevant = filtered.map(e => parseEvent(e, src.label)).filter(Boolean);
    if (!relevant.length) return null;
    return { key: src.key, label: src.label, events: relevant };
  }));

  let active = results.filter(Boolean);

  // If World Cup is active (or fixtures exist within 14 days), attach group standings + upcoming fixtures
  const wcIndex = active.findIndex(r => r.key === 'wc');
  const [wcStandings, wcFixtures] = await Promise.all([fetchWorldCupStandings(), fetchWorldCupFixtures()]);

  if (wcStandings || wcFixtures) {
    if (wcIndex > -1) {
      active[wcIndex].standings = wcStandings;
      active[wcIndex].fixtures = wcFixtures;
    } else if (wcFixtures) {
      // World Cup not currently live, but fixtures coming up — still surface it
      active.push({ key: 'wc', label: 'FIFA World Cup', events: [], standings: wcStandings, fixtures: wcFixtures });
    }
  }

  res.status(200).json({
    active,
    updated: new Date().toISOString(),
  });
}
