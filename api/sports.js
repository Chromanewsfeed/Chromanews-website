export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate');

  const ESPN = 'https://site.api.espn.com/apis/site/v2/sports';

  const SOURCES = [
    { key: 'nba',          label: 'NBA Finals',                         path: 'basketball/nba' },
    { key: 'nfl',          label: 'Super Bowl / NFL Playoffs',          path: 'football/nfl' },
    { key: 'mlb',          label: 'World Series / MLB Playoffs',        path: 'baseball/mlb' },
    { key: 'nhl',          label: 'Stanley Cup / NHL Playoffs',         path: 'hockey/nhl' },
    { key: 'ncaafb',       label: 'College Football Playoff',           path: 'football/college-football' },
    { key: 'ncaamb',       label: "NCAA Basketball \u00b7 Men's",      path: 'basketball/mens-college-basketball' },
    { key: 'ncaawb',       label: "NCAA Basketball \u00b7 Women's",   path: 'basketball/womens-college-basketball' },
    { key: 'llws',         label: 'Little League World Series',         path: 'baseball/little-league-world-series' },
    { key: 'wc',           label: 'FIFA World Cup',                     path: 'soccer/fifa.world' },
    { key: 'copa',         label: 'Copa Am\u00e9rica',                  path: 'soccer/conmebol.america' },
    { key: 'euros',        label: 'UEFA Euro Championship',             path: 'soccer/uefa.euro' },
    { key: 'afcon',        label: 'Africa Cup of Nations',              path: 'soccer/caf.nations_cup' },
    { key: 'asian_cup',    label: 'AFC Asian Cup',                      path: 'soccer/afc.asian.cup' },
    { key: 'tennis_atp',   label: "Tennis Grand Slams \u00b7 Men's",  path: 'tennis/atp' },
    { key: 'tennis_wta',   label: "Tennis Grand Slams \u00b7 Women's",path: 'tennis/wta' },
    { key: 'golf_pga',     label: "Golf Majors \u00b7 Men's",         path: 'golf/pga' },
    { key: 'golf_lpga',    label: "Golf Majors \u00b7 Women's",       path: 'golf/lpga' },
    { key: 'f1',           label: 'Formula 1',                         path: 'racing/f1' },
    { key: 'nascar',       label: 'NASCAR \u00b7 Crown Jewels',        path: 'racing/nascar-premier' },
    { key: 'indycar',      label: 'IndyCar',                           path: 'racing/indycar' },
    { key: 'rugby_wc',     label: 'Rugby World Cup',                   path: 'rugby/164205' },
    { key: 'rugby_6n',     label: 'Rugby Six Nations',                 path: 'rugby/180659' },
    { key: 'rugby_sevens', label: 'Rugby Sevens Series',               path: 'rugby/321' },
    { key: 'rugby_champ',  label: 'The Rugby Championship',            path: 'rugby/244' },
    { key: 'rugby_euro',   label: 'European Rugby Champions Cup',      path: 'rugby/271' },
    { key: 'rugby_urc',    label: 'United Rugby Championship',         path: 'rugby/270' },
    { key: 'cricket_wc',   label: 'ICC Cricket World Cup',             path: 'cricket/icc.cricket.world.cup' },
    { key: 'cricket_t20',  label: 'ICC T20 World Cup',                 path: 'cricket/icc.t20' },
  ];

  const NASCAR_MAJORS = ['daytona 500', 'coca-cola 600', 'coca cola 600', 'southern 500', 'brickyard 400', 'nascar cup series championship', 'auto club 400', 'coke zero sugar 400'];
  const INDYCAR_MAJORS = ['indianapolis 500', 'indy 500'];
  const TENNIS_MAJORS = ['australian open', 'french open', 'roland garros', 'wimbledon', 'us open'];
  // Added 'open championship' (without 'the') since ESPN sometimes omits the article
  const GOLF_MAJORS_MEN = ['masters', 'pga championship', 'u.s. open', 'us open', 'the open championship', 'open championship', 'british open', 'open at', 'the open'];
  const GOLF_MAJORS_WOMEN = ['chevron championship', 'u.s. women\'s open', 'us women\'s open', 'women\'s pga championship', 'amundi evian championship', 'evian championship', 'aig women\'s open', "women's open"];

  const WORLD_CUP_GROUPS = {
    A: ['Mexico', 'South Africa', 'Korea Republic', 'Czechia'],
    B: ['Canada', 'Bosnia and Herzegovina', 'Qatar', 'Switzerland'],
    C: ['Brazil', 'Morocco', 'Haiti', 'Scotland'],
    D: ['United States', 'Paraguay', 'Australia', 'Turkiye'],
    E: ['Germany', 'Curacao', 'Ivory Coast', 'Ecuador'],
    F: ['Netherlands', 'Japan', 'Sweden', 'Tunisia'],
    G: ['Belgium', 'Egypt', 'Iran', 'New Zealand'],
    H: ['Spain', 'Cape Verde', 'Saudi Arabia', 'Uruguay'],
    I: ['France', 'Senegal', 'Iraq', 'Norway'],
    J: ['Argentina', 'Algeria', 'Austria', 'Jordan'],
    K: ['Portugal', 'DR Congo', 'Uzbekistan', 'Colombia'],
    L: ['England', 'Croatia', 'Ghana', 'Panama'],
  };

  function normalizeTeamName(name) {
    if (!name) return '';
    return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
  }

  const TEAM_NAME_ALIASES = {
    'south korea': 'korea republic', 'czech republic': 'czechia', 'turkey': 'turkiye',
    'cote divoire': 'ivory coast', 'ivory coast republic': 'ivory coast',
    'congo dr': 'dr congo', 'republic of congo dr': 'dr congo', 'usa': 'united states',
    'bosnia herzegovina': 'bosnia and herzegovina', 'bosniaherzegovina': 'bosnia and herzegovina',
    'cabo verde': 'cape verde',
  };

  const TEAM_INFO_MAP = {};
  Object.entries(WORLD_CUP_GROUPS).forEach(([letter, teams]) => {
    teams.forEach(canonical => { TEAM_INFO_MAP[normalizeTeamName(canonical)] = { letter, canonical }; });
  });
  Object.entries(TEAM_NAME_ALIASES).forEach(([alias, canonicalName]) => {
    const info = TEAM_INFO_MAP[normalizeTeamName(canonicalName)];
    if (info) TEAM_INFO_MAP[normalizeTeamName(alias)] = info;
  });

  function getTeamInfo(name) { return TEAM_INFO_MAP[normalizeTeamName(name)] || null; }

  const GOLF_COUNTRY_ABBR = {
    'united states': 'USA', 'usa': 'USA', 'england': 'ENG', 'scotland': 'SCO',
    'wales': 'WAL', 'northern ireland': 'NIR', 'republic of ireland': 'IRL', 'ireland': 'IRL',
    'south africa': 'RSA', 'germany': 'GER', 'france': 'FRA', 'spain': 'ESP',
    'sweden': 'SWE', 'norway': 'NOR', 'denmark': 'DEN', 'australia': 'AUS',
    'new zealand': 'NZL', 'japan': 'JPN', 'south korea': 'KOR', 'korea': 'KOR',
    'canada': 'CAN', 'argentina': 'ARG', 'mexico': 'MEX', 'chile': 'CHI',
    'colombia': 'COL', 'italy': 'ITA', 'belgium': 'BEL', 'austria': 'AUT',
    'finland': 'FIN', 'india': 'IND', 'china': 'CHN', 'thailand': 'THA',
    'philippines': 'PHI', 'venezuela': 'VEN', 'puerto rico': 'PUR', 'netherlands': 'NED',
    'switzerland': 'SUI', 'taiwan': 'TPE', 'chinese taipei': 'TPE', 'singapore': 'SIN',
    'malaysia': 'MAS', 'fiji': 'FIJ', 'paraguay': 'PAR', 'brazil': 'BRA',
    'zimbabwe': 'ZIM', 'czech republic': 'CZE', 'czechia': 'CZE', 'poland': 'POL',
    'portugal': 'POR', 'iceland': 'ISL',
  };

  function abbreviateCountry(name) {
    if (!name) return '';
    const norm = name.toLowerCase().trim();
    if (GOLF_COUNTRY_ABBR[norm]) return GOLF_COUNTRY_ABBR[norm];
    if (name.length <= 4) return name.toUpperCase();
    return name.split(' ')[0].slice(0, 3).toUpperCase();
  }

  async function fetchJSON(url) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4000);
      const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: controller.signal });
      clearTimeout(timer);
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
  function isMLBMajor(event) { return event.season?.type === 3; }
  function isNBAMajor(event) {
    const text = getEventText(event);
    if (event.season?.type !== 3) return false;
    return /\bfinals?\b/.test(text);
  }
  function isNHLMajor(event) { return /\bstanley cup final\b/.test(getEventText(event)); }

  function isMajorTournament(event, list) {
    const name = (event.name || event.shortName || '').toLowerCase();
    return list.some(m => name.includes(m));
  }

  const TENNIS_MAJOR_WINDOWS_2026 = [
    { start: '2026-01-12', end: '2026-02-02' },
    { start: '2026-05-18', end: '2026-06-08' },
    { start: '2026-06-22', end: '2026-07-13' },
    { start: '2026-08-24', end: '2026-09-14' },
  ];
  function isWithinTennisMajorWindow(event) {
    if (!event.date) return false;
    const d = event.date.slice(0, 10);
    return TENNIS_MAJOR_WINDOWS_2026.some(w => d >= w.start && d <= w.end);
  }
  function isTennisMajorEvent(event, majorsList) {
    return isMajorTournament(event, majorsList) || isWithinTennisMajorWindow(event);
  }

  const TENNIS_LATE_ROUNDS = ['round of 16', 'quarterfinal', 'quarter-final', 'semifinal', 'semi-final', 'final'];
  function isTennisMajorLateRound(event, majorsList) {
    if (!isTennisMajorEvent(event, majorsList)) return false;
    const text = getEventText(event);
    if (/\bdoubles\b/.test(text)) return false;
    return TENNIS_LATE_ROUNDS.some(r => text.includes(r));
  }

  function isF1Race(event) {
    const text = getEventText(event);
    return !/\bpractice\b/.test(text) && !/\bqualifying\b/.test(text);
  }

  function isMotorsportMajor(event, majorsList) {
    const text = getEventText(event);
    if (/\bpractice\b/.test(text) || /\bqualifying\b/.test(text)) return false;
    return majorsList.some(m => text.includes(m));
  }

  function parseGolfLeaderboard(event, leagueLabel) {
    try {
      const comp = event.competitions?.[0];
      if (!comp) return null;
      const competitors = comp.competitors || [];

      function scoreToNum(s) {
        if (s == null) return 999;
        const str = String(s).trim();
        if (str === 'E' || str === 'e') return 0;
        const n = parseInt(str, 10);
        return isNaN(n) ? 999 : n;
      }

      let players = competitors.map(c => {
        const roundEntries = c.linescores || [];
        const rounds = roundEntries.map(ls => ls.displayValue || ls.value || '');
        const countryFullName = c.athlete?.flag?.alt || c.athlete?.country || '';
        const scoreDisplay = c.score?.displayValue || c.score || 'E';
        let thru = '-';
        if (roundEntries.length) {
          const currentRound = roundEntries.reduce((a, b) => (b.period > a.period ? b : a), roundEntries[0]);
          const holesPlayed = (currentRound.linescores || []).length;
          if (holesPlayed >= 18) thru = 'F';
          else if (holesPlayed > 0) thru = String(holesPlayed);
        }
        return {
          name: c.athlete?.displayName || c.athlete?.shortName || 'Unknown',
          order: typeof c.order === 'number' ? c.order : 9999,
          scoreNum: scoreToNum(scoreDisplay),
          score: scoreDisplay,
          rounds,
          total: c.statistics?.find(s => s.name === 'total')?.displayValue || '',
          status: '',
          thru,
          countryAbbr: abbreviateCountry(countryFullName),
          countryName: countryFullName,
        };
      });

      const maxRoundsPlayed = players.reduce((max, p) => Math.max(max, p.rounds.length), 0);
      const tournamentInFinalStretch = maxRoundsPlayed >= 4;
      players.forEach(p => { p.madeCut = !tournamentInFinalStretch || p.rounds.length >= 3; });

      const activePlayers = players.filter(p => p.madeCut);
      const cutPlayers = players.filter(p => !p.madeCut);
      activePlayers.sort((a, b) => a.order - b.order);

      let rank = 1;
      for (let i = 0; i < activePlayers.length; i++) {
        if (i > 0 && activePlayers[i].scoreNum === activePlayers[i - 1].scoreNum) {
          activePlayers[i].position = activePlayers[i - 1].position;
        } else { rank = i + 1; activePlayers[i].position = String(rank); }
      }
      const rankCounts = {};
      activePlayers.forEach(p => { rankCounts[p.position] = (rankCounts[p.position] || 0) + 1; });
      const finalActive = activePlayers.map(p => ({
        ...p, position: rankCounts[p.position] > 1 ? 'T' + p.position : p.position,
      }));
      cutPlayers.sort((a, b) => a.scoreNum - b.scoreNum);
      players = finalActive.concat(cutPlayers.map(p => ({ ...p, position: 'CUT' })));

      return {
        league: leagueLabel, name: event.name || event.shortName || '',
        status: event.status?.type?.description || '', state: event.status?.type?.state || '',
        date: event.date, venue: comp.venue?.fullName || '', players,
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
      if (seriesData && (seriesData.summary || seriesData.completedGames != null)) {
        series = { summary: seriesData.summary || '', completedGames: seriesData.completedGames, totalCompetitions: seriesData.totalCompetitions };
      }

      const statusType = event.status?.type;
      const isLive = statusType?.state === 'in';
      const displayClock = isLive ? (event.status?.displayClock || '') : '';
      const period = isLive ? (event.status?.period || null) : null;

      let scorers = [], cards = [], ownGoals = [];
      (comp.details || []).forEach(d => {
        const athlete = d.athletesInvolved?.[0];
        const name = athlete?.shortName || athlete?.displayName || '';
        if (!name) return;
        const teamId = d.team?.id;
        const side = teamId && home?.team?.id === teamId ? 'home' : (teamId && away?.team?.id === teamId ? 'away' : null);
        const clock = d.clock?.displayValue || '';
        const isGoal = d.scoringPlay === true || (d.type?.text && /goal/i.test(d.type.text)) || (d.type?.id === '70' || d.type?.id === '97');
        if (d.ownGoal === true) ownGoals.push({ name, clock, side });
        else if (isGoal) scorers.push({ name, clock, side });
        if (d.yellowCard === true) cards.push({ name, clock, side, type: 'yellow' });
        if (d.redCard === true) cards.push({ name, clock, side, type: 'red' });
      });

      return {
        league: leagueLabel, name: event.name || event.shortName || '',
        status: event.status?.type?.description || '', state: event.status?.type?.state || '',
        date: event.date, displayClock, period,
        home: home ? { name: home.team?.displayName || home.team?.shortDisplayName, score: home.score, logo: home.team?.logo, winner: home.winner || false } : null,
        away: away ? { name: away.team?.displayName || away.team?.shortDisplayName, score: away.score, logo: away.team?.logo, winner: away.winner || false } : null,
        venue: comp.venue?.fullName || '', series,
        scorers: scorers.length ? scorers : null,
        cards: cards.length ? cards : null,
        ownGoals: ownGoals.length ? ownGoals : null,
      };
    } catch(e) { return null; }
  }

  function toNum(v) {
    if (v == null) return 0;
    const n = parseInt(String(v).replace(/[^\d.-]/g, ''), 10);
    return isNaN(n) ? 0 : n;
  }

  function rankThirdPlaceTeams(groupsArr) {
    const allThirdPlace = [];
    groupsArr.forEach(g => {
      const third = g.teams.find(t => t.groupRank === 3);
      if (third) allThirdPlace.push({ ...third, group: g.group });
    });
    allThirdPlace.sort((a, b) => {
      const pts = toNum(b.points) - toNum(a.points); if (pts !== 0) return pts;
      const gd = toNum(b.goalDiff) - toNum(a.goalDiff); if (gd !== 0) return gd;
      return toNum(b.goalsFor) - toNum(a.goalsFor);
    });
    return allThirdPlace.map((t, i) => ({ ...t, rank: i + 1, advancing: i < 8 }));
  }

  async function fetchWorldCupStandingsFromESPN() {
    const year = new Date().getFullYear();
    const data = await fetchJSON(`https://site.api.espn.com/apis/v2/sports/soccer/fifa.world/standings?season=${year}`);
    if (!data || !Array.isArray(data.children)) return null;
    const groups = [];
    data.children.forEach(group => {
      const groupName = group.name || group.abbreviation || '';
      let entries = (group.standings?.entries || []).map(entry => {
        const stats = {};
        (entry.stats || []).forEach(s => { stats[s.name] = s.displayValue; });
        return {
          team: entry.team?.displayName || entry.team?.shortDisplayName || entry.team?.name || entry.team?.location || '',
          logo: entry.team?.logos?.[0]?.href || '',
          played: stats.gamesPlayed || '0', wins: stats.wins || '0',
          draws: stats.ties || stats.draws || '0', losses: stats.losses || '0',
          goalDiff: stats.pointDifferential || stats.goalDifferential || '0',
          goalsFor: stats.pointsFor || stats.goalsFor || '-',
          goalsAgainst: stats.pointsAgainst || stats.goalsAgainst || '-',
          points: stats.points || '0',
        };
      });
      entries.sort((a, b) => {
        const pts = toNum(b.points) - toNum(a.points); if (pts !== 0) return pts;
        const gd = toNum(b.goalDiff) - toNum(a.goalDiff); if (gd !== 0) return gd;
        return toNum(b.goalsFor) - toNum(a.goalsFor);
      });
      entries = entries.map((e, i) => ({ ...e, groupRank: i + 1 }));
      if (entries.length) groups.push({ group: groupName, teams: entries });
    });
    if (!groups.length) return null;
    return { groups, thirdPlaceTable: rankThirdPlaceTeams(groups) };
  }

  async function fetchAllWorldCupEvents() {
    const chunks = [
      ['20260611', '20260620'], ['20260621', '20260627'], ['20260628', '20260703'],
      ['20260704', '20260711'], ['20260712', '20260720'],
    ];
    const results = await Promise.all(
      chunks.map(c => fetchJSON(`${ESPN}/soccer/fifa.world/scoreboard?dates=${c[0]}-${c[1]}&limit=200`))
    );
    const seen = {}, merged = [];
    for (let i = 0; i < results.length; i++) {
      const evts = (results[i] && Array.isArray(results[i].events)) ? results[i].events : [];
      for (let j = 0; j < evts.length; j++) {
        const id = evts[j].id;
        if (id && seen[id]) continue;
        if (id) seen[id] = true;
        merged.push(evts[j]);
      }
    }
    return merged.length ? merged : null;
  }

  function buildWorldCupStandingsFromEvents(events) {
    if (!events || !events.length) return null;
    const groupsByLetter = {};
    Object.entries(WORLD_CUP_GROUPS).forEach(([letter, teams]) => {
      groupsByLetter[letter] = teams.map(name => ({ team: name, logo: '', played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, points: 0 }));
    });
    events.forEach(event => {
      const comp = event.competitions?.[0]; if (!comp) return;
      const competitors = comp.competitors || [];
      const home = competitors.find(c => c.homeAway === 'home');
      const away = competitors.find(c => c.homeAway === 'away');
      if (!home || !away) return;
      const homeInfo = getTeamInfo(home.team?.displayName || home.team?.name);
      const awayInfo = getTeamInfo(away.team?.displayName || away.team?.name);
      if (!homeInfo || !awayInfo || homeInfo.letter !== awayInfo.letter) return;
      const homeEntry = groupsByLetter[homeInfo.letter].find(t => t.team === homeInfo.canonical);
      const awayEntry = groupsByLetter[awayInfo.letter].find(t => t.team === awayInfo.canonical);
      if (!homeEntry || !awayEntry) return;
      if (!homeEntry.logo && home.team?.logo) homeEntry.logo = home.team.logo;
      if (!awayEntry.logo && away.team?.logo) awayEntry.logo = away.team.logo;
      if (!event.status?.type?.completed) return;
      const homeScore = parseInt(home.score, 10), awayScore = parseInt(away.score, 10);
      if (isNaN(homeScore) || isNaN(awayScore)) return;
      homeEntry.played++; awayEntry.played++;
      homeEntry.goalsFor += homeScore; homeEntry.goalsAgainst += awayScore;
      awayEntry.goalsFor += awayScore; awayEntry.goalsAgainst += homeScore;
      if (homeScore > awayScore) { homeEntry.wins++; homeEntry.points += 3; awayEntry.losses++; }
      else if (homeScore < awayScore) { awayEntry.wins++; awayEntry.points += 3; homeEntry.losses++; }
      else { homeEntry.draws++; awayEntry.draws++; homeEntry.points++; awayEntry.points++; }
    });
    function fmtGD(n) { return n > 0 ? '+' + n : String(n); }
    const groups = Object.entries(groupsByLetter).map(([letter, teams]) => {
      const t2 = teams.map(t => ({ ...t, goalDiffNum: t.goalsFor - t.goalsAgainst }));
      t2.sort((a, b) => b.points - a.points || b.goalDiffNum - a.goalDiffNum || b.goalsFor - a.goalsFor);
      return { group: `Group ${letter}`, teams: t2.map((t, i) => ({ team: t.team, logo: t.logo, played: String(t.played), wins: String(t.wins), draws: String(t.draws), losses: String(t.losses), goalDiff: fmtGD(t.goalDiffNum), goalsFor: String(t.goalsFor), goalsAgainst: String(t.goalsAgainst), points: String(t.points), groupRank: i + 1 })) };
    });
    return { groups, thirdPlaceTable: rankThirdPlaceTeams(groups) };
  }

  function buildWorldCupPlayerStats(events) {
    if (!events || !events.length) return null;
    const playerMap = {};
    function getEntry(athlete, teamName) {
      const key = athlete.id || athlete.displayName;
      if (!playerMap[key]) playerMap[key] = { name: athlete.displayName || athlete.shortName || 'Unknown', team: teamName || '', goals: 0, assists: 0, yellow: 0, red: 0 };
      return playerMap[key];
    }
    events.forEach(event => {
      const comp = event.competitions?.[0]; if (!comp) return;
      if (!event.status?.type?.completed && event.status?.type?.state !== 'in') return;
      const competitors = comp.competitors || [];
      const home = competitors.find(c => c.homeAway === 'home');
      const away = competitors.find(c => c.homeAway === 'away');
      const homeName = home?.team?.displayName || '', awayName = away?.team?.displayName || '';
      (comp.details || []).forEach(d => {
        const athlete = d.athletesInvolved?.[0]; if (!athlete) return;
        const teamId = d.team?.id;
        const teamName = teamId && home?.team?.id === teamId ? homeName : (teamId && away?.team?.id === teamId ? awayName : '');
        const isGoal = d.scoringPlay === true || (d.type?.text && /goal/i.test(d.type.text)) || (d.type?.id === '70' || d.type?.id === '97');
        if (isGoal && !d.ownGoal) {
          getEntry(athlete, teamName).goals++;
          const assister = d.athletesInvolved?.[1];
          if (assister) getEntry(assister, teamName).assists++;
        }
        if (d.yellowCard) getEntry(athlete, teamName).yellow++;
        if (d.redCard) getEntry(athlete, teamName).red++;
      });
    });
    const all = Object.values(playerMap);
    return {
      topScorers: all.filter(p => p.goals > 0).sort((a, b) => b.goals - a.goals || b.assists - a.assists).slice(0, 15).map((p, i) => ({ rank: i + 1, ...p })),
      cardLeaders: all.filter(p => p.yellow > 0 || p.red > 0).sort((a, b) => (b.red * 2 + b.yellow) - (a.red * 2 + a.yellow)).slice(0, 15).map((p, i) => ({ rank: i + 1, ...p })),
      assistsAvailable: all.some(p => p.assists > 0),
    };
  }

  const WC_TEAM_ABBR = {
    'Mexico':'MEX','South Africa':'RSA','Korea Republic':'KOR','Czechia':'CZE',
    'Canada':'CAN','Bosnia and Herzegovina':'BIH','Qatar':'QAT','Switzerland':'SUI',
    'Brazil':'BRA','Morocco':'MAR','Haiti':'HAI','Scotland':'SCO',
    'United States':'USA','Paraguay':'PAR','Australia':'AUS','Turkiye':'TUR',
    'Germany':'GER','Curacao':'CUW','Ivory Coast':'CIV','Ecuador':'ECU',
    'Netherlands':'NED','Japan':'JPN','Sweden':'SWE','Tunisia':'TUN',
    'Belgium':'BEL','Egypt':'EGY','Iran':'IRN','New Zealand':'NZL',
    'Spain':'ESP','Cape Verde':'CPV','Saudi Arabia':'KSA','Uruguay':'URU',
    'France':'FRA','Senegal':'SEN','Iraq':'IRQ','Norway':'NOR',
    'Argentina':'ARG','Algeria':'ALG','Austria':'AUT','Jordan':'JOR',
    'Portugal':'POR','DR Congo':'COD','Uzbekistan':'UZB','Colombia':'COL',
    'England':'ENG','Croatia':'CRO','Ghana':'GHA','Panama':'PAN',
  };

  function wcTeamAbbr(name) {
    if (!name) return 'TBD';
    if (WC_TEAM_ABBR[name]) return WC_TEAM_ABBR[name];
    const info = getTeamInfo(name);
    if (info && WC_TEAM_ABBR[info.canonical]) return WC_TEAM_ABBR[info.canonical];
    return 'TBD';
  }

  function buildWorldCupSchedule(events) {
    if (!events || !events.length) return null;
    const out = [];
    for (let i = 0; i < events.length; i++) {
      try {
        const event = events[i];
        const comp = event.competitions && event.competitions[0]; if (!comp) continue;
        const competitors = comp.competitors || [];
        let home = null, away = null;
        for (let j = 0; j < competitors.length; j++) {
          if (competitors[j].homeAway === 'home') home = competitors[j];
          if (competitors[j].homeAway === 'away') away = competitors[j];
        }
        if (!home) home = { team: { displayName: '' }, score: null, winner: false };
        if (!away) away = { team: { displayName: '' }, score: null, winner: false };
        const state = (event.status && event.status.type && event.status.type.state) || '';
        const completed = !!(event.status && event.status.type && event.status.type.completed);
        const isLive = state === 'in';
        let round = '';
        if (event.date) {
          const matchDateET = new Date(event.date).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
          if (matchDateET >= '2026-06-28' && matchDateET <= '2026-07-03') round = 'Round of 32';
          else if (matchDateET >= '2026-07-04' && matchDateET <= '2026-07-07') round = 'Round of 16';
          else if (matchDateET >= '2026-07-09' && matchDateET <= '2026-07-11') round = 'Quarterfinal';
          else if (matchDateET >= '2026-07-14' && matchDateET <= '2026-07-15') round = 'Semifinal';
          else if (matchDateET === '2026-07-18') round = '3rd Place';
          else if (matchDateET === '2026-07-19') round = 'Final';
        }
        const hScore = (completed || isLive) && home.score != null ? home.score : null;
        const aScore = (completed || isLive) && away.score != null ? away.score : null;
        out.push({
          date: event.date, state, completed, isLive, round,
          home: { name: (home.team && home.team.displayName) || '', abbr: wcTeamAbbr((home.team && home.team.displayName) || ''), score: hScore, winner: home.winner || false },
          away: { name: (away.team && away.team.displayName) || '', abbr: wcTeamAbbr((away.team && away.team.displayName) || ''), score: aScore, winner: away.winner || false },
          venue: (comp.venue && comp.venue.fullName) || '',
          venueCity: (comp.venue && comp.venue.address && comp.venue.address.city) || '',
        });
      } catch(e) { continue; }
    }
    const live = out.filter(m => m.isLive).sort((a,b) => new Date(a.date)-new Date(b.date));
    const upcoming = out.filter(m => !m.isLive && !m.completed && m.state==='pre').sort((a,b) => new Date(a.date)-new Date(b.date));
    const past = out.filter(m => m.completed).sort((a,b) => new Date(b.date)-new Date(a.date));
    let allMatches = live.concat(upcoming).concat(past);

    const ROUND_REQUIRED_COUNT = { 'Round of 32':16,'Round of 16':8,'Quarterfinal':4,'Semifinal':2,'3rd Place':1,'Final':1 };
    const ROUND_PLACEHOLDER_DATE = { 'Round of 32':'2026-06-28T18:00:00Z','Round of 16':'2026-07-04T18:00:00Z','Quarterfinal':'2026-07-09T18:00:00Z','Semifinal':'2026-07-14T18:00:00Z','3rd Place':'2026-07-18T22:00:00Z','Final':'2026-07-19T19:00:00Z' };
    const ROUND_VENUE = { '3rd Place':{ venue:'Hard Rock Stadium',venueCity:'Miami Gardens' },'Final':{ venue:'MetLife Stadium',venueCity:'East Rutherford' } };
    Object.keys(ROUND_REQUIRED_COUNT).forEach(roundName => {
      const missing = ROUND_REQUIRED_COUNT[roundName] - allMatches.filter(m => m.round === roundName).length;
      if (missing <= 0) return;
      const vi = ROUND_VENUE[roundName] || { venue:'',venueCity:'' };
      for (let k = 0; k < missing; k++) {
        allMatches.push({ date:ROUND_PLACEHOLDER_DATE[roundName],state:'pre',completed:false,isLive:false,round:roundName,home:{name:'',abbr:'TBD',score:null,winner:false},away:{name:'',abbr:'TBD',score:null,winner:false},venue:vi.venue,venueCity:vi.venueCity });
      }
    });
    const fL = allMatches.filter(m => m.isLive).sort((a,b) => new Date(a.date)-new Date(b.date));
    const fU = allMatches.filter(m => !m.isLive && !m.completed).sort((a,b) => new Date(a.date)-new Date(b.date));
    const fP = allMatches.filter(m => m.completed).sort((a,b) => new Date(b.date)-new Date(a.date));
    return fL.concat(fU).concat(fP);
  }

  // Merged: fetchWorldCupStandings now also builds fixtures/soon so we
  // don't need a separate fetchWorldCupSchedule call (saves 1 request).
  async function fetchWorldCupStandings() {
    const [fromESPN, events] = await Promise.all([
      fetchWorldCupStandingsFromESPN(),
      fetchAllWorldCupEvents(),
    ]);
    const stats = events ? buildWorldCupPlayerStats(events) : null;
    const schedule = events ? buildWorldCupSchedule(events) : null;

    // Build fixtures/soon from already-fetched events — no extra request
    let fixtures = null, soon = null;
    if (events) {
      const now = new Date();
      const fixtureList = events.filter(e => e.status?.type?.state === 'pre' && isWithinWindow(e)).map(e => parseEvent(e, 'FIFA World Cup')).filter(Boolean);
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const endOfTomorrow = new Date(startOfToday.getTime() + 2 * 86400000);
      const soonList = events.filter(e => {
        const state = e.status?.type?.state, date = new Date(e.date);
        return state === 'pre' && date >= now && date < endOfTomorrow;
      }).map(e => parseEvent(e, 'FIFA World Cup')).filter(Boolean);
      fixtures = fixtureList.length ? fixtureList : null;
      soon = soonList.length ? soonList : null;
    }

    const base = fromESPN || (events ? buildWorldCupStandingsFromEvents(events) : null) || {};
    return { ...base, stats, schedule, fixtures, soon };
  }

  const NOTABLE_TENNIS_MEN = ['djokovic','alcaraz','sinner','nadal','federer','murray','medvedev','zverev','tsitsipas','rublev','ruud','hurkacz','shelton','fritz','tiafoe','wawrinka','thiem','cilic','del potro','auger-aliassime','korda','dimitrov','berrettini','norrie','khachanov','rune'];
  const NOTABLE_TENNIS_WOMEN = ['swiatek','sabalenka','gauff','rybakina','pegula','jabeur','vondrousova','krejcikova','osaka','williams','halep','kerber','wozniacki','azarenka','muguruza','kvitova','pliskova','barty','badosa','collins','keys','andreescu','raducanu'];

  function getTennisSeed(c) {
    if (!c) return null;
    if (typeof c.seed === 'number') return c.seed;
    if (typeof c.seed === 'string' && c.seed.trim()) { const n = parseInt(c.seed, 10); if (!isNaN(n)) return n; }
    if (c.curatedRank && typeof c.curatedRank.current === 'number') return c.curatedRank.current;
    return null;
  }

  function isNotableTennisPlayer(name, seed, list) {
    if (seed != null && seed > 0 && seed <= 25) return true;
    if (!name) return false;
    return list.some(n => name.toLowerCase().includes(n));
  }

  function parseTennisRound(textCombined) {
    const t = textCombined.toLowerCase();
    if (/\bfinal\b/.test(t) && !/semi|quarter/.test(t)) return { label: 'Final', order: 7 };
    if (/semifinal|semi-final/.test(t)) return { label: 'Semifinal', order: 6 };
    if (/quarterfinal|quarter-final/.test(t)) return { label: 'Quarterfinal', order: 5 };
    if (/\bround\s*4\b/.test(t) || /round of 16|4th round|fourth round/.test(t)) return { label: 'Round of 16', order: 4 };
    if (/\bround\s*3\b/.test(t) || /round of 32|3rd round|third round/.test(t)) return { label: 'Round of 32', order: 3 };
    if (/\bround\s*2\b/.test(t) || /round of 64|2nd round|second round/.test(t)) return { label: 'Round of 64', order: 2 };
    if (/\bround\s*1\b/.test(t) || /round of 128|1st round|first round/.test(t)) return { label: 'Round of 128', order: 1 };
    return null;
  }

  // Reduced from 7 chunks to 3 — saves 8 parallel requests, preventing timeout
  async function fetchTennisMajorDraw(path, majorsList, notableList) {
    const now = new Date();
    const chunks = [
      [ymd(new Date(now - 7*86400000)), ymd(now)],
      [ymd(now), ymd(new Date(now.getTime() + 7*86400000))],
      [ymd(new Date(now.getTime() + 7*86400000)), ymd(new Date(now.getTime() + 14*86400000))],
    ];
    const results = await Promise.all(chunks.map(c => fetchScoreboard(path, `${c[0]}-${c[1]}`)));
    const seen = {}, allEvents = [];
    for (let i = 0; i < results.length; i++) {
      const evts = (results[i] && Array.isArray(results[i].events)) ? results[i].events : [];
      for (let j = 0; j < evts.length; j++) {
        const id = evts[j].id;
        if (id && seen[id]) continue;
        if (id) seen[id] = true;
        allEvents.push(evts[j]);
      }
    }
    if (!allEvents.length) return null;
    const majorEvents = allEvents.filter(e => isTennisMajorEvent(e, majorsList));
    if (!majorEvents.length) return null;

    const rosterMap = {}, matches = [];
    majorEvents.forEach(event => {
      try {
        const text = getEventText(event);
        if (/\bdoubles\b/.test(text) || /\bmixed\b/.test(text)) return;
        const comp = event.competitions && event.competitions[0]; if (!comp) return;
        const competitors = comp.competitors || [];
        const home = competitors.find(c => c.homeAway === 'home');
        const away = competitors.find(c => c.homeAway === 'away');
        if (!home && !away) return;
        const noteText = (comp.notes || []).map(n => n.headline || n.text || '').join(' ');
        const altGameNote = comp.altGameNote || '';
        const seasonText = (event.season && event.season.slug) || '';
        const combinedRoundText = [noteText, altGameNote, String(seasonText), event.name, event.shortName].filter(Boolean).join(' ');
        const roundInfo = parseTennisRound(combinedRoundText);
        if (!roundInfo) return;

        function playerInfo(c) {
          if (!c) return { name: 'TBD', country: '', countryAbbr: 'TBD', seed: null, score: null, winner: false };
          const athlete = c.athlete || {};
          const country = (athlete.flag && athlete.flag.alt) || athlete.citizenship || '';
          const seed = getTennisSeed(c);
          return { name: athlete.displayName || athlete.shortName || 'TBD', country, countryAbbr: abbreviateCountry(country), seed, score: (c.score && c.score.displayValue) || null, winner: c.winner || false };
        }
        const homeInfo = playerInfo(home), awayInfo = playerInfo(away);
        [homeInfo, awayInfo].forEach(p => {
          if (!p.name || p.name === 'TBD') return;
          if (!rosterMap[p.name]) rosterMap[p.name] = { name: p.name, country: p.country, countryAbbr: p.countryAbbr, seed: p.seed };
          else if (p.seed != null && rosterMap[p.name].seed == null) rosterMap[p.name].seed = p.seed;
        });
        const state = (event.status && event.status.type && event.status.type.state) || '';
        matches.push({ date: event.date, state, completed: !!(event.status && event.status.type && event.status.type.completed), isLive: state === 'in', round: roundInfo.label, roundOrder: roundInfo.order, home: homeInfo, away: awayInfo });
      } catch(e) { /* skip */ }
    });

    if (!matches.length) return null;
    const filteredMatches = matches.filter(m => {
      if (m.round === 'Round of 128' || m.round === 'Round of 64') {
        return isNotableTennisPlayer(m.home.name, m.home.seed, notableList) || isNotableTennisPlayer(m.away.name, m.away.seed, notableList);
      }
      return true;
    });
    filteredMatches.sort((a, b) => a.roundOrder - b.roundOrder || new Date(a.date) - new Date(b.date));
    const roster = Object.values(rosterMap).sort((a, b) => {
      const as = a.seed != null ? a.seed : 9999, bs = b.seed != null ? b.seed : 9999;
      return as !== bs ? as - bs : a.name.localeCompare(b.name);
    });
    return { players: roster, bracketData: filteredMatches };
  }

  function findNextGame(allEvents, excludeIds, checkFn) {
    const now = new Date();
    const upcoming = allEvents.filter(e => {
      const state = e.status?.type?.state, date = new Date(e.date);
      if (state !== 'pre' || date <= now || excludeIds.has(e.id)) return false;
      if (checkFn && !checkFn(e)) return false;
      return true;
    }).sort((a, b) => new Date(a.date) - new Date(b.date));
    return upcoming.length ? parseEvent(upcoming[0], '') : null;
  }

  const results = await Promise.all(SOURCES.map(async (src) => {
    let datesParam = null;
    if (['f1','nascar','indycar'].includes(src.key)) datesParam = dateRangeParam(21, 3);
    else if (['wc','tennis_atp','tennis_wta','rugby_wc','rugby_6n','rugby_sevens','rugby_champ','rugby_euro','rugby_urc','copa','euros','afcon','asian_cup','cricket_wc','cricket_t20'].includes(src.key)) datesParam = dateRangeParam(4, 2);
    else if (['golf_pga','golf_lpga'].includes(src.key)) datesParam = dateRangeParam(7, 14);
    else if (['ncaafb','ncaamb','ncaawb','llws'].includes(src.key)) datesParam = dateRangeParam(3, 1);

    const data = datesParam
      ? await fetchScoreboard(src.path, datesParam)
      : await fetchScoreboard(src.path);
    if (!data || !Array.isArray(data.events)) return null;

    // For men's golf, also pull the DP World Tour (European Tour) feed —
    // The Open Championship is an R&A event co-sanctioned by the DP World
    // Tour and may not appear under the PGA Tour path at all.
    if (src.key === 'golf_pga') {
      const euroData = await fetchScoreboard('golf/euro', datesParam);
      if (euroData && Array.isArray(euroData.events)) {
        const existingIds = new Set(data.events.map(e => e.id));
        euroData.events.forEach(e => { if (!existingIds.has(e.id)) data.events.push(e); });
      }
    }

    let majorCheck = null;
    switch (src.key) {
      case 'nfl': majorCheck = isNFLMajor; break;
      case 'mlb': majorCheck = isMLBMajor; break;
      case 'nba': majorCheck = isNBAMajor; break;
      case 'nhl': majorCheck = isNHLMajor; break;
      // NCAA — only championship/bowl games, not regular season
      case 'ncaafb': majorCheck = (e) => { const t=getEventText(e); return /\bcollege football playoff\b|\bcfp\b|\bnational championship\b|\bsemifinal\b|\bbowl\b/i.test(t) && e.season?.type===3; }; break;
      case 'ncaamb': majorCheck = (e) => { const t=getEventText(e); return (/\bfinal four\b|\belite eight\b|\bsweet sixteen\b|\bnational championship\b/i.test(t)||e.season?.type===3) && e.season?.type===3; }; break;
      case 'ncaawb': majorCheck = (e) => e.season?.type===3; break;
      // Soccer tournaments — paths are already tournament-specific, no extra filter needed
      // Tennis, golf, rugby, cricket, motorsport
      case 'tennis_atp':
      case 'tennis_wta':
        majorCheck = (e) => isTennisMajorLateRound(e, TENNIS_MAJORS); break;
      case 'golf_pga': majorCheck = (e) => isMajorTournament(e, GOLF_MAJORS_MEN); break;
      case 'golf_lpga': majorCheck = (e) => isMajorTournament(e, GOLF_MAJORS_WOMEN); break;
      case 'f1': majorCheck = isF1Race; break;
      case 'nascar': majorCheck = (e) => isMotorsportMajor(e, NASCAR_MAJORS); break;
      case 'indycar': majorCheck = (e) => isMotorsportMajor(e, INDYCAR_MAJORS); break;
      // Tournament-specific paths — no extra filter needed
    }

    const isGolf = src.key === 'golf_pga' || src.key === 'golf_lpga';
    let filtered;
    if (isGolf) {
      filtered = data.events.filter(majorCheck).filter(e => {
        const diff = new Date(e.date) - new Date();
        return diff <= THREE_DAYS_MS && diff >= -11 * 24 * 3600 * 1000;
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

    let tennisDraw = null;
    if (src.key === 'tennis_atp') tennisDraw = await fetchTennisMajorDraw(src.path, TENNIS_MAJORS, NOTABLE_TENNIS_MEN);
    else if (src.key === 'tennis_wta') tennisDraw = await fetchTennisMajorDraw(src.path, TENNIS_MAJORS, NOTABLE_TENNIS_WOMEN);

    if (!relevant.length && !nextGame && !tennisDraw) return null;
    const out = { key: src.key, label: src.label, events: relevant, nextGame };
    if (tennisDraw) { out.players = tennisDraw.players; out.bracketData = tennisDraw.bracketData; }
    return out;
  }));

  let active = results.filter(Boolean);

  // Single call — fetchWorldCupStandings now builds fixtures/soon internally
  const wcStandings = await fetchWorldCupStandings();
  const wcFixtures = wcStandings ? wcStandings.fixtures : null;
  const wcUpcomingSoon = wcStandings ? wcStandings.soon : null;
  const wcGroups = wcStandings ? wcStandings.groups : null;
  const wcThirdPlaceTable = wcStandings ? wcStandings.thirdPlaceTable : null;
  const wcStats = wcStandings ? wcStandings.stats : null;
  const wcScheduleData = wcStandings ? wcStandings.schedule : null;

  const wcIndex = active.findIndex(r => r.key === 'wc');
  if (wcGroups || wcFixtures || wcUpcomingSoon || wcStats || wcScheduleData) {
    if (wcIndex > -1) {
      active[wcIndex].standings = wcGroups;
      active[wcIndex].thirdPlaceTable = wcThirdPlaceTable;
      active[wcIndex].fixtures = wcFixtures;
      active[wcIndex].stats = wcStats;
      active[wcIndex].scheduleData = wcScheduleData;
      if (wcUpcomingSoon) {
        const existingKeys = new Set(active[wcIndex].events.map(e => e.name + e.date));
        wcUpcomingSoon.forEach(e => { if (!existingKeys.has(e.name + e.date)) active[wcIndex].events.push(e); });
      }
    } else if (wcFixtures || wcUpcomingSoon) {
      active.push({ key: 'wc', label: 'FIFA World Cup', events: wcUpcomingSoon || [], standings: wcGroups, thirdPlaceTable: wcThirdPlaceTable, fixtures: wcFixtures, stats: wcStats, scheduleData: wcScheduleData });
    }
  }

  res.status(200).json({ active, updated: new Date().toISOString() });
}
