export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate');

  const ESPN = 'https://site.api.espn.com/apis/site/v2/sports';

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
    { key: 'nascar', label: 'NASCAR', path: 'racing/nascar-premier' },
    { key: 'indycar', label: 'IndyCar', path: 'racing/indycar' },
  ];

  const NASCAR_MAJORS = ['daytona 500', 'coca-cola 600', 'coca cola 600', 'southern 500', 'brickyard 400', 'championship'];
  const INDYCAR_MAJORS = ['indianapolis 500', 'indy 500'];
  const TENNIS_MAJORS = ['australian open', 'french open', 'roland garros', 'wimbledon', 'us open'];
  const GOLF_MAJORS_MEN = ['masters', 'pga championship', 'u.s. open', 'us open', 'the open championship', 'british open'];
  const GOLF_MAJORS_WOMEN = ['chevron championship', 'u.s. women\'s open', 'us women\'s open', 'women\'s pga championship', 'amundi evian championship', 'evian championship', 'aig women\'s open', "women's open"];

  async function fetchJSON(url) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!r.ok) return null;
      return await r.json();
    } catch(e) { return null; }
  }

  async function fetchScoreboard(path, datesParam) {
    const url = datesParam ? `${ESPN}/${path}/scoreboard?dates=${datesParam}` : `${ESPN}/${path}/scoreboard`;
    return fetchJSON(url);
  }

  function ymd(d) {
    return d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
  }

  function dateRangeParam(daysForward, daysBack = 0) {
    const start = new Date(Date.now() - daysBack * 86400000);
    const end = new Date(Date.now() + daysForward * 86400000);
    return `${ymd(start)}-${ymd(end)}`;
  }

  const ONE_DAY_MS = 24 * 3600 * 1000;
  const THREE_DAYS_MS = 3 * 24 * 3600 * 1000;

  function isWithinWindow(event) {
    if (!event) return false;
    const date = new Date(event.date);
    const now = new Date();
    const diff = date - now;
    const state = event.status?.type?.state;
    if (state === 'in') return true;
    if (state === 'pre') return diff >= 0 && diff <= THREE_DAYS_MS;
    if (state === 'post') return diff < 0 && diff >= -ONE_DAY_MS;
    return false;
  }

  function getEventText(event) {
    const name = (event.name || '').toLowerCase();
    const shortName = (event.shortName || '').toLowerCase();
    const notes = (event.competitions?.[0]?.notes || []).map(n => (n.headline || '').toLowerCase()).join(' ');
    return `${name} ${shortName} ${notes}`;
  }

  function isNFLMajor(event) {
    const text = getEventText(event);
    return /\bsuper bowl\b/.test(text) || /\bafc championship\b/.test(text) || /\bnfc championship\b/.test(text);
  }

  function isMLBMajor(event) {
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

  const TENNIS_LATE_ROUNDS = ['round of 16', 'quarterfinal', 'quarter-final', 'semifinal', 'semi-final', 'final'];
  function isTennisMajorLateRound(event, majorsList) {
    if (!isMajorTournament(event, majorsList)) return false;
    const text = getEventText(event);
    if (/\bdoubles\b/.test(text)) return false;
    return TENNIS_LATE_ROUNDS.some(r => text.includes(r));
  }

  function isF1Race(event) {
    const text = getEventText(event);
    if (/\bpractice\b/.test(text)) return false;
    if (/\bqualifying\b/.test(text)) return false;
    return true;
  }

  function isMotorsportMajor(event, majorsList) {
    const text = getEventText(event);
    if (/\bpractice\b/.test(text)) return false;
    if (/\bqualifying\b/.test(text)) return false;
    return majorsList.some(m => text.includes(m));
  }

  // Golf leaderboard — captures country flag data per player.
  // Real tournament leaderboards rank by score, with tied scores sharing
  // the same rank (prefixed "T"), e.g. four players at -3 are all "T2".
  // ESPN's status.position.displayName is unreliable during play, so we
  // compute the rank ourselves from each player's numeric score.
  function parseGolfLeaderboard(event, leagueLabel) {
    try {
      const comp = event.competitions?.[0];
      if (!comp) return null;
      const competitors = comp.competitors || [];

      // Convert a golf score like "-7", "E", "+2" into a sortable number
      function scoreToNum(s) {
        if (s == null) return 999;
        const str = String(s).trim();
        if (str === 'E' || str === 'e') return 0;
        const n = parseInt(str, 10);
        return isNaN(n) ? 999 : n;
      }

      let players = competitors.map(c => {
        const rounds = (c.linescores || []).map(ls => ls.displayValue || ls.value || '');
        // ESPN provides flag.alt as country name and countryAbbr as ISO 2-letter code
        const countryAbbr = (c.athlete?.flag?.alt || c.athlete?.countryAbbr || '').toLowerCase().trim();
        const countryName = c.athlete?.flag?.alt || c.athlete?.country || '';
        const scoreDisplay = c.score?.displayValue || c.score || 'E';
        return {
          name: c.athlete?.displayName || c.athlete?.shortName || 'Unknown',
          scoreNum: scoreToNum(scoreDisplay),
          score: scoreDisplay,
          rounds: rounds,
          total: c.statistics?.find(s => s.name === 'total')?.displayValue || '',
          status: c.status?.type?.description || '',
          countryAbbr: countryAbbr,
          countryName: countryName,
        };
      });

      // Sort best score first (lowest = best in golf)
      players.sort((a, b) => a.scoreNum - b.scoreNum);

      // Assign rank with ties: players with the same score share the same
      // rank number, prefixed "T" when 2+ players share it (e.g. "T2").
      let rank = 1;
      for (let i = 0; i < players.length; i++) {
        if (i > 0 && players[i].scoreNum === players[i - 1].scoreNum) {
          players[i].position = players[i - 1].position; // same rank as player above
        } else {
          rank = i + 1;
          players[i].position = String(rank);
        }
      }
      // Now add "T" prefix to any rank shared by 2+ players
      const rankCounts = {};
      players.forEach(p => { rankCounts[p.position] = (rankCounts[p.position] || 0) + 1; });
      players = players.map(p => ({
        ...p,
        position: rankCounts[p.position] > 1 ? 'T' + p.position : p.position,
      }));
      return {
        league: leagueLabel,
        name: event.name || event.shortName || '',
        status: event.status?.type?.description || '',
        state: event.status?.type?.state || '',
        date: event.date,
        venue: comp.venue?.fullName || '',
        players: players,
      };
    } catch(e) { return null; }
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

      // Live match clock — only meaningful while a game is in progress.
      // ESPN provides displayClock (e.g. "67'" for soccer) and a period
      // number (1st half, 2nd half, OT, etc.) for sports where time
      // remaining matters.
      const statusType = event.status?.type;
      const isLive = statusType?.state === 'in';
      const displayClock = isLive ? (event.status?.displayClock || '') : '';
      const period = isLive ? (event.status?.period || null) : null;

      // Goal scorers — ESPN's "details" array on the competition lists
      // scoring events (goals, cards, etc.) with athlete name, clock time,
      // and which team scored. We extract only actual goals here.
      let scorers = [];
      const detailsArr = comp.details || [];
      detailsArr.forEach(d => {
        const isGoal = d.scoringPlay === true ||
          (d.type?.text && /goal/i.test(d.type.text)) ||
          (d.type?.id === '70' || d.type?.id === '97'); // common ESPN soccer goal type ids
        if (!isGoal) return;
        const scorerName = d.athletesInvolved?.[0]?.shortName || d.athletesInvolved?.[0]?.displayName || '';
        if (!scorerName) return;
        const teamId = d.team?.id;
        const side = teamId && home?.team?.id === teamId ? 'home' : (teamId && away?.team?.id === teamId ? 'away' : null);
        scorers.push({
          name: scorerName,
          clock: d.clock?.displayValue || '',
          side: side,
        });
      });

      return {
        league: leagueLabel,
        name: event.name || event.shortName || '',
        status: event.status?.type?.description || '',
        state: event.status?.type?.state || '',
        date: event.date,
        displayClock: displayClock,
        period: period,
        home: home ? { name: home.team?.displayName || home.team?.shortDisplayName, score: home.score, logo: home.team?.logo, winner: home.winner || false } : null,
        away: away ? { name: away.team?.displayName || away.team?.shortDisplayName, score: away.score, logo: away.team?.logo, winner: away.winner || false } : null,
        venue: comp.venue?.fullName || '',
        series: series,
        scorers: scorers.length ? scorers : null,
      };
    } catch(e) { return null; }
  }

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

  async function fetchWorldCupSchedule() {
    const data = await fetchScoreboard('soccer/fifa.world', dateRangeParam(3, 1));
    if (!data || !Array.isArray(data.events)) return { fixtures: null, soon: null };
    const upcoming = data.events.filter(e => {
      const state = e.status?.type?.state;
      return state === 'pre' && isWithinWindow(e);
    }).map(e => parseEvent(e, 'FIFA World Cup')).filter(Boolean);
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfTomorrow = new Date(startOfToday.getTime() + 2 * 86400000);
    const soon = data.events.filter(e => {
      const state = e.status?.type?.state;
      const date = new Date(e.date);
      return state === 'pre' && date >= now && date < endOfTomorrow;
    }).map(e => parseEvent(e, 'FIFA World Cup')).filter(Boolean);
    return { fixtures: upcoming.length ? upcoming : null, soon: soon.length ? soon : null, rawEvents: data.events };
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

  const results = await Promise.all(SOURCES.map(async (src) => {
    const data = src.key === 'wc'
      ? await fetchScoreboard(src.path, dateRangeParam(3, 1))
      : await fetchScoreboard(src.path);
    if (!data || !Array.isArray(data.events)) return null;

    let majorCheck = null;
    switch (src.key) {
      case 'nfl': majorCheck = isNFLMajor; break;
      case 'mlb': majorCheck = isMLBMajor; break;
      case 'nba': majorCheck = isNBAMajor; break;
      case 'nhl': majorCheck = isNHLMajor; break;
      case 'tennis_atp':
      case 'tennis_wta':
        majorCheck = (e) => isTennisMajorLateRound(e, TENNIS_MAJORS); break;
      case 'golf_pga':
        majorCheck = (e) => isMajorTournament(e, GOLF_MAJORS_MEN); break;
      case 'golf_lpga':
        majorCheck = (e) => isMajorTournament(e, GOLF_MAJORS_WOMEN); break;
      case 'f1':
        majorCheck = isF1Race; break;
      case 'nascar':
        majorCheck = (e) => isMotorsportMajor(e, NASCAR_MAJORS); break;
      case 'indycar':
        majorCheck = (e) => isMotorsportMajor(e, INDYCAR_MAJORS); break;
    }

    const isGolf = src.key === 'golf_pga' || src.key === 'golf_lpga';

    let filtered;
    if (isGolf) {
      filtered = data.events.filter(majorCheck).filter(e => {
        const date = new Date(e.date);
        const diff = date - new Date();
        return diff <= THREE_DAYS_MS && diff >= -7 * 24 * 3600 * 1000 - 4 * 24 * 3600 * 1000;
      });
    } else {
      filtered = data.events.filter(e => isWithinWindow(e));
      if (majorCheck) filtered = filtered.filter(majorCheck);
    }

    const relevant = isGolf
      ? filtered.map(e => parseGolfLeaderboard(e, src.label)).filter(Boolean)
      : filtered.map(e => parseEvent(e, src.label)).filter(Boolean);

    const includedIds = new Set(filtered.map(e => e.id));
    const nextGame = findNextGame(data.events, includedIds, majorCheck);

    if (!relevant.length && !nextGame) return null;
    return { key: src.key, label: src.label, events: relevant, nextGame };
  }));

  let active = results.filter(Boolean);

  const wcIndex = active.findIndex(r => r.key === 'wc');
  const [wcStandings, wcSchedule] = await Promise.all([fetchWorldCupStandings(), fetchWorldCupSchedule()]);
  const wcFixtures = wcSchedule.fixtures;
  const wcUpcomingSoon = wcSchedule.soon;

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
