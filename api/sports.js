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

  async function fetchScoreboard(path) {
    try {
      const r = await fetch(`${ESPN}/${path}/scoreboard`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!r.ok) return null;
      return await r.json();
    } catch(e) { return null; }
  }

  function isRecent(event) {
    if (!event) return false;
    const status = event.status?.type?.state; // 'pre', 'in', 'post'
    const date = new Date(event.date);
    const now = new Date();
    const hoursDiff = Math.abs(now - date) / 3600000;
    return status === 'in' || (status === 'post' && hoursDiff < 24) || (status === 'pre' && hoursDiff < 24);
  }

  function isPlayoffGame(event, key) {
    // ESPN marks playoff games via season.type === 3 (postseason) for most leagues
    const seasonType = event.season?.type;
    if (seasonType === 3) return true;
    // Fallback: check notes/name for "playoff", "finals", "championship", "world series", "super bowl", "stanley cup"
    const name = (event.name || '').toLowerCase();
    const notes = (event.competitions?.[0]?.notes || []).map(n => (n.headline || '').toLowerCase()).join(' ');
    const text = name + ' ' + notes;
    const keywords = ['playoff', 'final', 'championship', 'world series', 'super bowl', 'stanley cup', 'conference final'];
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
      return {
        league: leagueLabel,
        name: event.name || event.shortName || '',
        status: event.status?.type?.description || '',
        state: event.status?.type?.state || '',
        date: event.date,
        home: home ? { name: home.team?.displayName || home.team?.shortDisplayName, score: home.score, logo: home.team?.logo, winner: home.winner || false } : null,
        away: away ? { name: away.team?.displayName || away.team?.shortDisplayName, score: away.score, logo: away.team?.logo, winner: away.winner || false } : null,
        venue: comp.venue?.fullName || '',
      };
    } catch(e) { return null; }
  }

  const results = await Promise.all(SOURCES.map(async (src) => {
    const data = await fetchScoreboard(src.path);
    if (!data || !Array.isArray(data.events)) return null;

    let filtered = data.events.filter(isRecent);

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

  const active = results.filter(Boolean);

  res.status(200).json({
    active,
    updated: new Date().toISOString(),
  });
}
