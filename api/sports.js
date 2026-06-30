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

  // ---- 2026 FIFA World Cup group draw (locked in since the December 2025 draw) ----
  // Used as a fallback so group standings can be calculated from match results
  // whenever ESPN's standings feed for the World Cup is unavailable.
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
    return name
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, '')
      .trim();
  }

  // Maps alternate names ESPN may use to the canonical name used in WORLD_CUP_GROUPS above.
  const TEAM_NAME_ALIASES = {
    'south korea': 'korea republic',
    'czech republic': 'czechia',
    'turkey': 'turkiye',
    'cote divoire': 'ivory coast',
    'ivory coast republic': 'ivory coast',
    'congo dr': 'dr congo',
    'republic of congo dr': 'dr congo',
    'usa': 'united states',
    'bosnia herzegovina': 'bosnia and herzegovina',
    'bosniaherzegovina': 'bosnia and herzegovina',
    'cabo verde': 'cape verde',
  };

  const TEAM_INFO_MAP = {};
  Object.entries(WORLD_CUP_GROUPS).forEach(([letter, teams]) => {
    teams.forEach(canonical => {
      TEAM_INFO_MAP[normalizeTeamName(canonical)] = { letter, canonical };
    });
  });
  Object.entries(TEAM_NAME_ALIASES).forEach(([alias, canonicalName]) => {
    const info = TEAM_INFO_MAP[normalizeTeamName(canonicalName)];
    if (info) TEAM_INFO_MAP[normalizeTeamName(alias)] = info;
  });

  function getTeamInfo(name) {
    return TEAM_INFO_MAP[normalizeTeamName(name)] || null;
  }

  // ---- Golf country abbreviations ----
  // ESPN's golf data only gives a full country name (e.g. "Northern Ireland"),
  // not a short code, so we map common ones to the 3-letter codes golf
  // broadcasts use. Anything not in the list falls back to the first 3
  // letters of the first word, so it's never too long to display.
  const GOLF_COUNTRY_ABBR = {
    'united states': 'USA', 'usa': 'USA', 'england': 'ENG', 'scotland': 'SCO',
    'wales': 'WAL', 'northern ireland': 'NIR', 'republic of ireland': 'IRL',
    'ireland': 'IRL', 'south africa': 'RSA', 'germany': 'GER', 'france': 'FRA',
    'spain': 'ESP', 'sweden': 'SWE', 'norway': 'NOR', 'denmark': 'DEN',
    'australia': 'AUS', 'new zealand': 'NZL', 'japan': 'JPN', 'south korea': 'KOR',
    'korea': 'KOR', 'canada': 'CAN', 'argentina': 'ARG', 'mexico': 'MEX',
    'chile': 'CHI', 'colombia': 'COL', 'italy': 'ITA', 'belgium': 'BEL',
    'austria': 'AUT', 'finland': 'FIN', 'india': 'IND', 'china': 'CHN',
    'thailand': 'THA', 'philippines': 'PHI', 'venezuela': 'VEN',
    'puerto rico': 'PUR', 'netherlands': 'NED', 'switzerland': 'SUI',
    'taiwan': 'TPE', 'chinese taipei': 'TPE', 'singapore': 'SIN',
    'malaysia': 'MAS', 'fiji': 'FIJ', 'paraguay': 'PAR', 'brazil': 'BRA',
    'zimbabwe': 'ZIM', 'czech republic': 'CZE', 'czechia': 'CZE',
    'poland': 'POL', 'portugal': 'POR', 'iceland': 'ISL',
  };

  function abbreviateCountry(name) {
    if (!name) return '';
    const norm = name.toLowerCase().trim();
    if (GOLF_COUNTRY_ABBR[norm]) return GOLF_COUNTRY_ABBR[norm];
    if (name.length <= 4) return name.toUpperCase();
    const firstWord = name.split(' ')[0];
    return firstWord.slice(0, 3).toUpperCase();
  }

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

  // ESPN's tennis match names are typically "Player A vs Player B" — the
  // tournament name usually isn't embedded in the individual match's text
  // the way it is for soccer ("Team A vs Team B" still has notes/season
  // context, but tennis often doesn't). Relying on text matching alone
  // means majors can silently fail to be detected. As a reliable fallback,
  // we also check whether the match falls within a major's known 2026 date
  // window (with a few buffer days for late-running matches/time zones).
  const TENNIS_MAJOR_WINDOWS_2026 = [
    { start: '2026-01-12', end: '2026-02-02' },  // Australian Open
    { start: '2026-05-18', end: '2026-06-08' },  // French Open / Roland Garros
    { start: '2026-06-22', end: '2026-07-13' },  // Wimbledon
    { start: '2026-08-24', end: '2026-09-14' },  // US Open
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
        const roundEntries = c.linescores || [];
        const rounds = roundEntries.map(ls => ls.displayValue || ls.value || '');
        // ESPN's golf data only provides a country name (via flag.alt), never
        // a ready-made short code, so we abbreviate it ourselves.
        const countryFullName = c.athlete?.flag?.alt || c.athlete?.country || '';
        const countryAbbr = abbreviateCountry(countryFullName);
        const countryName = countryFullName;
        const scoreDisplay = c.score?.displayValue || c.score || 'E';

        // Current hole tracking: ESPN doesn't give a direct "thru" field for
        // golf competitors. Instead, each round entry's own "linescores"
        // array holds one item per hole played so far in that round — once
        // a round is finished it has all 18; while in progress it only has
        // the holes completed up to that point. We use the most recent
        // (highest-numbered) round to figure out where a player stands.
        let thru = '-';
        if (roundEntries.length) {
          const currentRound = roundEntries.reduce((a, b) => (b.period > a.period ? b : a), roundEntries[0]);
          const holesPlayed = (currentRound.linescores || []).length;
          if (holesPlayed >= 18) {
            thru = 'F';
          } else if (holesPlayed > 0) {
            thru = String(holesPlayed);
          }
        }

        return {
          name: c.athlete?.displayName || c.athlete?.shortName || 'Unknown',
          order: typeof c.order === 'number' ? c.order : 9999,
          scoreNum: scoreToNum(scoreDisplay),
          score: scoreDisplay,
          rounds: rounds,
          total: c.statistics?.find(s => s.name === 'total')?.displayValue || '',
          status: '',
          thru: thru,
          countryAbbr: countryAbbr,
          countryName: countryName,
        };
      });

      // Detect players who missed the cut. ESPN's own competitor "order"
      // field doesn't move cut players to the bottom once the field moves
      // past the cut round, which scrambles the standings if trusted blindly.
      // A reliable signal: once the leaders have started round 3+, anyone
      // still stuck on only 1-2 rounds didn't advance.
      const maxRoundsPlayed = players.reduce((max, p) => Math.max(max, p.rounds.length), 0);
      // Round-count alone can't reliably tell a cut player from someone who
      // simply hasn't teed off yet in round 3, so we only apply this once
      // the leaders have clearly moved into round 4 — at that point anyone
      // still stuck on 2 rounds has unambiguously missed the cut.
      const tournamentInFinalStretch = maxRoundsPlayed >= 4;
      players.forEach(p => {
        p.madeCut = !tournamentInFinalStretch || p.rounds.length >= 3;
      });

      const activePlayers = players.filter(p => p.madeCut);
      const cutPlayers = players.filter(p => !p.madeCut);

      // Sort active players by ESPN's own competitor order — this already
      // reflects the official tournament position, correctly handling ties
      // and players mid-round.
      activePlayers.sort((a, b) => a.order - b.order);

      // Assign rank with ties: players with the same score share the same
      // rank number, prefixed "T" when 2+ players share it (e.g. "T2").
      let rank = 1;
      for (let i = 0; i < activePlayers.length; i++) {
        if (i > 0 && activePlayers[i].scoreNum === activePlayers[i - 1].scoreNum) {
          activePlayers[i].position = activePlayers[i - 1].position;
        } else {
          rank = i + 1;
          activePlayers[i].position = String(rank);
        }
      }
      const rankCounts = {};
      activePlayers.forEach(p => { rankCounts[p.position] = (rankCounts[p.position] || 0) + 1; });
      let finalActive = activePlayers.map(p => ({
        ...p,
        position: rankCounts[p.position] > 1 ? 'T' + p.position : p.position,
      }));

      // Cut players: sorted best-to-worst among themselves, labeled "CUT"
      // instead of a tournament position, and kept separate at the bottom.
      cutPlayers.sort((a, b) => a.scoreNum - b.scoreNum);
      const finalCut = cutPlayers.map(p => ({ ...p, position: 'CUT' }));

      players = finalActive.concat(finalCut);
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

      // Goal scorers, yellow/red cards, and own goals — ESPN's "details"
      // array on the competition lists all match events (goals, cards,
      // etc.) with athlete name, clock time, and which team it happened
      // for. We pull out each category separately.
      let scorers = [];
      let cards = [];
      let ownGoals = [];
      const detailsArr = comp.details || [];
      detailsArr.forEach(d => {
        const athlete = d.athletesInvolved?.[0];
        const name = athlete?.shortName || athlete?.displayName || '';
        if (!name) return;
        const teamId = d.team?.id;
        const side = teamId && home?.team?.id === teamId ? 'home' : (teamId && away?.team?.id === teamId ? 'away' : null);
        const clock = d.clock?.displayValue || '';

        const isGoal = d.scoringPlay === true ||
          (d.type?.text && /goal/i.test(d.type.text)) ||
          (d.type?.id === '70' || d.type?.id === '97');

        if (d.ownGoal === true) {
          ownGoals.push({ name, clock, side });
        } else if (isGoal) {
          scorers.push({ name, clock, side });
        }

        if (d.yellowCard === true) {
          cards.push({ name, clock, side, type: 'yellow' });
        }
        if (d.redCard === true) {
          cards.push({ name, clock, side, type: 'red' });
        }
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
        cards: cards.length ? cards : null,
        ownGoals: ownGoals.length ? ownGoals : null,
      };
    } catch(e) { return null; }
  }

  // Pull each goal/result tiebreak stat as a plain number, since ESPN
  // returns them as display strings (e.g. "+3", "-2", "9").
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
      const pts = toNum(b.points) - toNum(a.points);
      if (pts !== 0) return pts;
      const gd = toNum(b.goalDiff) - toNum(a.goalDiff);
      if (gd !== 0) return gd;
      return toNum(b.goalsFor) - toNum(a.goalsFor);
    });
    return allThirdPlace.map((t, i) => ({ ...t, rank: i + 1, advancing: i < 8 }));
  }

  // Attempt 1: ESPN's own pre-built standings feed (fastest & most accurate
  // when it's working, since it includes official tiebreakers like
  // head-to-head and fair play).
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

      entries.sort((a, b) => {
        const pts = toNum(b.points) - toNum(a.points);
        if (pts !== 0) return pts;
        const gd = toNum(b.goalDiff) - toNum(a.goalDiff);
        if (gd !== 0) return gd;
        return toNum(b.goalsFor) - toNum(a.goalsFor);
      });
      entries = entries.map((e, i) => ({ ...e, groupRank: i + 1 }));

      if (entries.length) groups.push({ group: groupName, teams: entries });
    });

    if (!groups.length) return null;
    return { groups, thirdPlaceTable: rankThirdPlaceTeams(groups) };
  }


  // Fetches every World Cup match result in one go (group stage through
  // whatever knockout rounds have happened) so it can feed both the
  // fallback standings calculation and the Statistics tab below, without
  // hitting ESPN twice for the same data.
  async function fetchAllWorldCupEvents() {
    // Querying ESPN's scoreboard across the full ~40-day tournament window
    // in one request can silently drop matches. Fetching in smaller date
    // chunks and merging the results is more reliable and ensures every
    // match — including already-confirmed Round of 32/16 pairings — comes through.
    const chunks = [
      ['20260611', '20260620'],
      ['20260621', '20260627'],
      ['20260628', '20260703'],
      ['20260704', '20260711'],
      ['20260712', '20260720'],
    ];
    const results = await Promise.all(
      chunks.map(c => fetchJSON(`${ESPN}/soccer/fifa.world/scoreboard?dates=${c[0]}-${c[1]}&limit=200`))
    );
    const seen = {};
    const merged = [];
    for (let i = 0; i < results.length; i++) {
      const data = results[i];
      const evts = (data && Array.isArray(data.events)) ? data.events : [];
      for (let j = 0; j < evts.length; j++) {
        const id = evts[j].id;
        if (id && seen[id]) continue;
        if (id) seen[id] = true;
        merged.push(evts[j]);
      }
    }
    return merged.length ? merged : null;
  }

  // Attempt 2 (fallback): calculate group standings ourselves from
  // completed match results, using the fixed group draw above. Used
  // whenever ESPN's own standings feed is unavailable.
  function buildWorldCupStandingsFromEvents(events) {
    if (!events || !events.length) return null;

    const groupsByLetter = {};
    Object.entries(WORLD_CUP_GROUPS).forEach(([letter, teams]) => {
      groupsByLetter[letter] = teams.map(name => ({
        team: name,
        logo: '',
        played: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        points: 0,
      }));
    });

    events.forEach(event => {
      const comp = event.competitions?.[0];
      if (!comp) return;
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

      const completed = event.status?.type?.completed === true;
      if (!completed) return;

      const homeScore = parseInt(home.score, 10);
      const awayScore = parseInt(away.score, 10);
      if (isNaN(homeScore) || isNaN(awayScore)) return;

      homeEntry.played++; awayEntry.played++;
      homeEntry.goalsFor += homeScore; homeEntry.goalsAgainst += awayScore;
      awayEntry.goalsFor += awayScore; awayEntry.goalsAgainst += homeScore;

      if (homeScore > awayScore) {
        homeEntry.wins++; homeEntry.points += 3; awayEntry.losses++;
      } else if (homeScore < awayScore) {
        awayEntry.wins++; awayEntry.points += 3; homeEntry.losses++;
      } else {
        homeEntry.draws++; awayEntry.draws++; homeEntry.points += 1; awayEntry.points += 1;
      }
    });

    function fmtGD(n) { return n > 0 ? '+' + n : String(n); }

    const groups = Object.entries(groupsByLetter).map(([letter, teams]) => {
      const goalDiffTeams = teams.map(t => ({ ...t, goalDiffNum: t.goalsFor - t.goalsAgainst }));
      goalDiffTeams.sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        if (b.goalDiffNum !== a.goalDiffNum) return b.goalDiffNum - a.goalDiffNum;
        return b.goalsFor - a.goalsFor;
      });
      const ranked = goalDiffTeams.map((t, i) => ({
        team: t.team,
        logo: t.logo,
        played: String(t.played),
        wins: String(t.wins),
        draws: String(t.draws),
        losses: String(t.losses),
        goalDiff: fmtGD(t.goalDiffNum),
        goalsFor: String(t.goalsFor),
        goalsAgainst: String(t.goalsAgainst),
        points: String(t.points),
        groupRank: i + 1,
      }));
      return { group: `Group ${letter}`, teams: ranked };
    });

    return { groups, thirdPlaceTable: rankThirdPlaceTeams(groups) };
  }

  // Statistics tab: top scorers (with assists, when ESPN's feed includes
  // them) and card leaders, aggregated across every World Cup match played
  // so far. ESPN's "details" array lists goal scorers and card recipients
  // reliably; assist data is included only when ESPN's own feed provides a
  // second athlete on a goal entry — if they don't supply it, assists show
  // as 0 rather than being guessed at.
  function buildWorldCupPlayerStats(events) {
    if (!events || !events.length) return null;
    const playerMap = {}; // key: athlete id

    function getEntry(athlete, teamName) {
      const key = athlete.id || athlete.displayName;
      if (!playerMap[key]) {
        playerMap[key] = {
          name: athlete.displayName || athlete.shortName || 'Unknown',
          team: teamName || '',
          goals: 0,
          assists: 0,
          yellow: 0,
          red: 0,
        };
      }
      return playerMap[key];
    }

    events.forEach(event => {
      const comp = event.competitions?.[0];
      if (!comp) return;
      const completed = event.status?.type?.completed === true;
      const isLive = event.status?.type?.state === 'in';
      if (!completed && !isLive) return; // only count matches that have actually been played

      const competitors = comp.competitors || [];
      const home = competitors.find(c => c.homeAway === 'home');
      const away = competitors.find(c => c.homeAway === 'away');
      const homeName = home?.team?.displayName || home?.team?.name || '';
      const awayName = away?.team?.displayName || away?.team?.name || '';

      (comp.details || []).forEach(d => {
        const athlete = d.athletesInvolved?.[0];
        if (!athlete) return;
        const teamId = d.team?.id;
        const teamName = teamId && home?.team?.id === teamId ? homeName
          : (teamId && away?.team?.id === teamId ? awayName : '');

        const isGoal = d.scoringPlay === true ||
          (d.type?.text && /goal/i.test(d.type.text)) ||
          (d.type?.id === '70' || d.type?.id === '97');

        if (isGoal && d.ownGoal !== true) {
          getEntry(athlete, teamName).goals++;
          // ESPN occasionally lists a second athlete on a goal entry — the assist provider.
          const assister = d.athletesInvolved?.[1];
          if (assister) getEntry(assister, teamName).assists++;
        }
        if (d.yellowCard === true) getEntry(athlete, teamName).yellow++;
        if (d.redCard === true) getEntry(athlete, teamName).red++;
      });
    });

    const all = Object.values(playerMap);
    const topScorers = all
      .filter(p => p.goals > 0)
      .sort((a, b) => b.goals - a.goals || b.assists - a.assists)
      .slice(0, 15)
      .map((p, i) => ({ rank: i + 1, ...p }));
    const cardLeaders = all
      .filter(p => p.yellow > 0 || p.red > 0)
      .sort((a, b) => (b.red * 2 + b.yellow) - (a.red * 2 + a.yellow))
      .slice(0, 15)
      .map((p, i) => ({ rank: i + 1, ...p }));

    const anyAssists = all.some(p => p.assists > 0);

    return { topScorers, cardLeaders, assistsAvailable: anyAssists };
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
    // All 48 participating teams are explicitly listed in WC_TEAM_ABBR. Any
    // name that doesn't match exactly is a placeholder/feeder description
    // from ESPN (e.g. "Round of 32 Winner...") — never guess an abbreviation
    // from that text, just show TBD.
    if (WC_TEAM_ABBR[name]) return WC_TEAM_ABBR[name];
    // Also check the known alias map (e.g. ESPN sometimes sends "South Korea"
    // instead of "Korea Republic") before giving up to TBD.
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
        const comp = event.competitions && event.competitions[0];
        if (!comp) continue;
        const competitors = comp.competitors || [];
        let home = null, away = null;
        for (let j = 0; j < competitors.length; j++) {
          if (competitors[j].homeAway === 'home') home = competitors[j];
          if (competitors[j].homeAway === 'away') away = competitors[j];
        }
        // Don't drop the match just because teams aren't determined yet
        // (common for future knockout-round fixtures) — treat as TBD instead.
        if (!home) home = { team: { displayName: '' }, score: null, winner: false };
        if (!away) away = { team: { displayName: '' }, score: null, winner: false };
        const state = (event.status && event.status.type && event.status.type.state) || '';
        const completed = !!(event.status && event.status.type && event.status.type.completed);
        const isLive = state === 'in';

        // Round is determined SOLELY by the official 2026 World Cup knockout
        // date windows — never from ESPN's text/notes, since placeholder
        // entries for undetermined future matches often reference their
        // FEEDING round (e.g. "Winner of Round of 32 Match..."), which would
        // get misread as the round being played rather than the actual one.
        // We use US Eastern time (the tournament's primary host zone) rather
        // than raw UTC so a late West Coast kickoff doesn't roll into the
        // next calendar day and cross a round boundary incorrectly.
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
        const venueCity = (comp.venue && comp.venue.address && comp.venue.address.city) || '';
        const venue = (comp.venue && comp.venue.fullName) || '';
        out.push({
          date: event.date,
          state: state,
          completed: completed,
          isLive: isLive,
          round: round,
          home: { name: (home.team && home.team.displayName) || '', abbr: wcTeamAbbr((home.team && home.team.displayName) || ''), score: hScore, winner: home.winner || false },
          away: { name: (away.team && away.team.displayName) || '', abbr: wcTeamAbbr((away.team && away.team.displayName) || ''), score: aScore, winner: away.winner || false },
          venue: venue,
          venueCity: venueCity,
        });
      } catch(e) { continue; }
    }
    const live = out.filter(function(m){ return m.isLive; }).sort(function(a,b){ return new Date(a.date)-new Date(b.date); });
    const upcoming = out.filter(function(m){ return !m.isLive && !m.completed && m.state==='pre'; }).sort(function(a,b){ return new Date(a.date)-new Date(b.date); });
    const past = out.filter(function(m){ return m.completed; }).sort(function(a,b){ return new Date(b.date)-new Date(a.date); });
    let allMatches = live.concat(upcoming).concat(past);

    // The 2026 World Cup knockout stage has a fixed, official number of
    // matches per round. ESPN doesn't always create the event entry for a
    // future match until it's closer to being played, which left rounds
    // showing fewer matchups than actually exist. We fill each round up to
    // its correct count with TBD placeholders, so every round always shows
    // the right number of slots.
    const ROUND_REQUIRED_COUNT = {
      'Round of 32': 16,
      'Round of 16': 8,
      'Quarterfinal': 4,
      'Semifinal': 2,
      '3rd Place': 1,
      'Final': 1,
    };
    const ROUND_PLACEHOLDER_DATE = {
      'Round of 32': '2026-06-28T18:00:00Z',
      'Round of 16': '2026-07-04T18:00:00Z',
      'Quarterfinal': '2026-07-09T18:00:00Z',
      'Semifinal': '2026-07-14T18:00:00Z',
      '3rd Place': '2026-07-18T22:00:00Z',
      'Final': '2026-07-19T19:00:00Z',
    };
    const ROUND_VENUE = {
      '3rd Place': { venue: 'Hard Rock Stadium', venueCity: 'Miami Gardens' },
      'Final': { venue: 'MetLife Stadium', venueCity: 'East Rutherford' },
    };

    Object.keys(ROUND_REQUIRED_COUNT).forEach(function(roundName){
      const required = ROUND_REQUIRED_COUNT[roundName];
      const existingCount = allMatches.filter(function(m){ return m.round === roundName; }).length;
      const missing = required - existingCount;
      if (missing <= 0) return;
      const venueInfo = ROUND_VENUE[roundName] || { venue: '', venueCity: '' };
      for (let k = 0; k < missing; k++) {
        allMatches.push({
          date: ROUND_PLACEHOLDER_DATE[roundName],
          state: 'pre',
          completed: false,
          isLive: false,
          round: roundName,
          home: { name: '', abbr: 'TBD', score: null, winner: false },
          away: { name: '', abbr: 'TBD', score: null, winner: false },
          venue: venueInfo.venue,
          venueCity: venueInfo.venueCity,
        });
      }
    });

    // Re-sort: live first, then upcoming soonest-first, then completed most-recent-first
    const finalLive = allMatches.filter(function(m){ return m.isLive; }).sort(function(a,b){ return new Date(a.date)-new Date(b.date); });
    const finalUpcoming = allMatches.filter(function(m){ return !m.isLive && !m.completed; }).sort(function(a,b){ return new Date(a.date)-new Date(b.date); });
    const finalPast = allMatches.filter(function(m){ return m.completed; }).sort(function(a,b){ return new Date(b.date)-new Date(a.date); });
    return finalLive.concat(finalUpcoming).concat(finalPast);
  }

  async function fetchWorldCupStandings() {
    const fromESPN = await fetchWorldCupStandingsFromESPN();
    const events = await fetchAllWorldCupEvents();
    const stats = events ? buildWorldCupPlayerStats(events) : null;
    const schedule = events ? buildWorldCupSchedule(events) : null;
    if (fromESPN) return { ...fromESPN, stats, schedule };
    const fallback = events ? buildWorldCupStandingsFromEvents(events) : null;
    if (fallback) return { ...fallback, stats, schedule };
    return stats ? { groups: null, thirdPlaceTable: null, stats, schedule } : null;
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

  // ---- Tennis Grand Slam draw (Players + Bracket tabs) ----
  // Past major champions and former world No.1s — used to flag "notable"
  // players in the early rounds (R128/R64) when ESPN's seed data is
  // missing or a player has dropped out of the current top 25.
  const NOTABLE_TENNIS_MEN = ['djokovic','alcaraz','sinner','nadal','federer','murray','medvedev','zverev','tsitsipas','rublev','ruud','hurkacz','shelton','fritz','tiafoe','wawrinka','thiem','cilic','del potro','auger-aliassime','korda','dimitrov','berrettini','norrie','khachanov','rune'];
  const NOTABLE_TENNIS_WOMEN = ['swiatek','sabalenka','gauff','rybakina','pegula','jabeur','vondrousova','krejcikova','osaka','williams','halep','kerber','wozniacki','azarenka','muguruza','kvitova','pliskova','barty','badosa','collins','keys','andreescu','raducanu'];

  function getTennisSeed(c) {
    if (!c) return null;
    if (typeof c.seed === 'number') return c.seed;
    if (typeof c.seed === 'string' && c.seed.trim()) {
      const n = parseInt(c.seed, 10);
      if (!isNaN(n)) return n;
    }
    if (c.curatedRank && typeof c.curatedRank.current === 'number') return c.curatedRank.current;
    return null;
  }

  function isNotableTennisPlayer(name, seed, list) {
    if (seed != null && seed > 0 && seed <= 25) return true;
    if (!name) return false;
    const lower = name.toLowerCase();
    return list.some(n => lower.includes(n));
  }

  // Normalizes ESPN's varied round wording ("1st Round", "Round of 128",
  // etc.) into a single consistent label and sort order.
  function parseTennisRound(textCombined) {
    const t = textCombined.toLowerCase();
    if (/\bfinal\b/.test(t) && !/semi|quarter/.test(t)) return { label: 'Final', order: 7 };
    if (/semifinal|semi-final/.test(t)) return { label: 'Semifinal', order: 6 };
    if (/quarterfinal|quarter-final/.test(t)) return { label: 'Quarterfinal', order: 5 };
    // ESPN's actual tennis labeling is plain "Round 1", "Round 2", etc.
    // rather than "First Round"/"Round of 128" — a 128-draw Grand Slam
    // goes Round 1 (R128) → Round 2 (R64) → Round 3 (R32) → Round 4 (R16).
    if (/\bround\s*4\b/.test(t) || /round of 16|4th round|fourth round/.test(t)) return { label: 'Round of 16', order: 4 };
    if (/\bround\s*3\b/.test(t) || /round of 32|3rd round|third round/.test(t)) return { label: 'Round of 32', order: 3 };
    if (/\bround\s*2\b/.test(t) || /round of 64|2nd round|second round/.test(t)) return { label: 'Round of 64', order: 2 };
    if (/\bround\s*1\b/.test(t) || /round of 128|1st round|first round/.test(t)) return { label: 'Round of 128', order: 1 };
    return null;
  }

  // Fetches the complete draw for a tennis major (all rounds, both
  // completed and upcoming matches) across a wide date window, then
  // builds the player roster and a round-by-round bracket. R128/R64 are
  // trimmed to notable players only, per the requested presentation —
  // everyone shows up from Round of 32 onward.
  async function fetchTennisMajorDraw(path, majorsList, notableList) {
    const data = await fetchScoreboard(path, dateRangeParam(21, 21));
    if (!data || !Array.isArray(data.events) || !data.events.length) return null;

    const majorEvents = data.events.filter(e => isTennisMajorEvent(e, majorsList));
    if (!majorEvents.length) return null;

    const rosterMap = {};
    const matches = [];

    majorEvents.forEach(event => {
      try {
        const text = getEventText(event);
        if (/\bdoubles\b/.test(text) || /\bmixed\b/.test(text)) return; // singles only
        const comp = event.competitions && event.competitions[0];
        if (!comp) return;
        const competitors = comp.competitors || [];
        const home = competitors.find(c => c.homeAway === 'home');
        const away = competitors.find(c => c.homeAway === 'away');
        if (!home && !away) return;

        const noteText = (comp.notes || []).map(n => n.headline || n.text || '').join(' ');
        const seasonText = (event.season && event.season.slug) || '';
        const altGameNote = comp.altGameNote || '';
        // Deliberately excludes event.status.type text — that field describes
        // match completion state (often literally "Final" meaning the match
        // has ended), not the tournament round, and would misclassify every
        // finished match as the championship Final if included.
        const combinedRoundText = [noteText, altGameNote, String(seasonText), event.name, event.shortName].filter(Boolean).join(' ');
        const roundInfo = parseTennisRound(combinedRoundText);
        if (!roundInfo) return;

        function playerInfo(c) {
          if (!c) return { name: 'TBD', country: '', countryAbbr: 'TBD', seed: null, score: null, winner: false };
          const athlete = c.athlete || {};
          const name = athlete.displayName || athlete.shortName || 'TBD';
          const country = athlete.flag && athlete.flag.alt || athlete.citizenship || '';
          const seed = getTennisSeed(c);
          return {
            name: name,
            country: country,
            countryAbbr: abbreviateCountry(country),
            seed: seed,
            score: c.score && c.score.displayValue || null,
            winner: c.winner || false,
          };
        }

        const homeInfo = playerInfo(home);
        const awayInfo = playerInfo(away);

        // Build/update roster
        [homeInfo, awayInfo].forEach(p => {
          if (!p.name || p.name === 'TBD') return;
          if (!rosterMap[p.name]) {
            rosterMap[p.name] = { name: p.name, country: p.country, countryAbbr: p.countryAbbr, seed: p.seed };
          } else if (p.seed != null && rosterMap[p.name].seed == null) {
            rosterMap[p.name].seed = p.seed;
          }
        });

        const state = (event.status && event.status.type && event.status.type.state) || '';
        const completed = !!(event.status && event.status.type && event.status.type.completed);
        const isLive = state === 'in';

        matches.push({
          date: event.date,
          state: state,
          completed: completed,
          isLive: isLive,
          round: roundInfo.label,
          roundOrder: roundInfo.order,
          home: homeInfo,
          away: awayInfo,
        });
      } catch (e) { /* skip malformed match */ }
    });

    if (!matches.length) return null;

    // Trim R128/R64 to notable players only
    const filteredMatches = matches.filter(m => {
      if (m.round === 'Round of 128' || m.round === 'Round of 64') {
        const homeNotable = isNotableTennisPlayer(m.home.name, m.home.seed, notableList);
        const awayNotable = isNotableTennisPlayer(m.away.name, m.away.seed, notableList);
        return homeNotable || awayNotable;
      }
      return true;
    });

    filteredMatches.sort((a, b) => a.roundOrder - b.roundOrder || new Date(a.date) - new Date(b.date));

    const roster = Object.values(rosterMap).sort((a, b) => {
      const as = a.seed != null ? a.seed : 9999;
      const bs = b.seed != null ? b.seed : 9999;
      if (as !== bs) return as - bs;
      return a.name.localeCompare(b.name);
    });

    return { players: roster, bracketData: filteredMatches };
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

    let tennisDraw = null;
    if (src.key === 'tennis_atp') {
      tennisDraw = await fetchTennisMajorDraw(src.path, TENNIS_MAJORS, NOTABLE_TENNIS_MEN);
    } else if (src.key === 'tennis_wta') {
      tennisDraw = await fetchTennisMajorDraw(src.path, TENNIS_MAJORS, NOTABLE_TENNIS_WOMEN);
    }

    if (!relevant.length && !nextGame && !tennisDraw) return null;
    const out = { key: src.key, label: src.label, events: relevant, nextGame: nextGame };
    if (tennisDraw) {
      out.players = tennisDraw.players;
      out.bracketData = tennisDraw.bracketData;
    }
    return out;
  }));

  let active = results.filter(Boolean);

  const wcIndex = active.findIndex(r => r.key === 'wc');
  const [wcStandings, wcSchedule] = await Promise.all([fetchWorldCupStandings(), fetchWorldCupSchedule()]);
  const wcFixtures = wcSchedule.fixtures;
  const wcUpcomingSoon = wcSchedule.soon;
  const wcGroups = wcStandings ? wcStandings.groups : null;
  const wcThirdPlaceTable = wcStandings ? wcStandings.thirdPlaceTable : null;
  const wcStats = wcStandings ? wcStandings.stats : null;

  if (wcGroups || wcFixtures || wcUpcomingSoon || wcStats) {
    if (wcIndex > -1) {
      active[wcIndex].standings = wcGroups;
      active[wcIndex].thirdPlaceTable = wcThirdPlaceTable;
      active[wcIndex].fixtures = wcFixtures;
      active[wcIndex].stats = wcStats;
      active[wcIndex].scheduleData = wcStandings ? wcStandings.schedule : null;
      if (wcUpcomingSoon) {
        const existingKeys = new Set(active[wcIndex].events.map(e => e.name + e.date));
        wcUpcomingSoon.forEach(e => {
          if (!existingKeys.has(e.name + e.date)) active[wcIndex].events.push(e);
        });
      }
    } else if (wcFixtures || wcUpcomingSoon) {
      active.push({ key: 'wc', label: 'FIFA World Cup', events: wcUpcomingSoon || [], standings: wcGroups, thirdPlaceTable: wcThirdPlaceTable, fixtures: wcFixtures, stats: wcStats, scheduleData: wcStandings ? wcStandings.schedule : null });
    }
  }

  res.status(200).json({
    active,
    updated: new Date().toISOString(),
  });
}
