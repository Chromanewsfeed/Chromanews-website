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
    const start = '20260611';
    const end = ymd(new Date(Date.now() + 86400000));
    const data = await fetchJSON(`${ESPN}/soccer/fifa.world/scoreboard?dates=${start}-${end}&limit=500`);
    if (!data || !Array.isArray(data.events) || !data.events.length) return null;
    return data.events;
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

  async function fetchWorldCupStandings() {
    const fromESPN = await fetchWorldCupStandingsFromESPN();
    const events = await fetchAllWorldCupEvents();
    const stats = events ? buildWorldCupPlayerStats(events) : null;
    if (fromESPN) return { ...fromESPN, stats };
    const fallback = events ? buildWorldCupStandingsFromEvents(events) : null;
    if (fallback) return { ...fallback, stats };
    return stats ? { groups: null, thirdPlaceTable: null, stats } : null;
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
  const wcGroups = wcStandings ? wcStandings.groups : null;
  const wcThirdPlaceTable = wcStandings ? wcStandings.thirdPlaceTable : null;
  const wcStats = wcStandings ? wcStandings.stats : null;

  if (wcGroups || wcFixtures || wcUpcomingSoon || wcStats) {
    if (wcIndex > -1) {
      active[wcIndex].standings = wcGroups;
      active[wcIndex].thirdPlaceTable = wcThirdPlaceTable;
      active[wcIndex].fixtures = wcFixtures;
      active[wcIndex].stats = wcStats;
      if (wcUpcomingSoon) {
        const existingKeys = new Set(active[wcIndex].events.map(e => e.name + e.date));
        wcUpcomingSoon.forEach(e => {
          if (!existingKeys.has(e.name + e.date)) active[wcIndex].events.push(e);
        });
      }
    } else if (wcFixtures || wcUpcomingSoon) {
      active.push({ key: 'wc', label: 'FIFA World Cup', events: wcUpcomingSoon || [], standings: wcGroups, thirdPlaceTable: wcThirdPlaceTable, fixtures: wcFixtures, stats: wcStats });
    }
  }

  res.status(200).json({
    active,
    updated: new Date().toISOString(),
  });
}
