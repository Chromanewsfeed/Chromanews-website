const SUPABASE_URL = 'https://wjpzockgilneshwjnzyq.supabase.co';
const SUPABASE_KEY = 'sb_publishable_3dddKM0I04IPWvDM06mS9g__SfHH9fx';

// Map common source name variations to our database names
const SOURCE_ALIASES = {
  'bbc': 'BBC News', 'bbc news': 'BBC News', 'bbc world': 'BBC News',
  'reuters': 'Reuters', 'associated press': 'AP News', 'ap': 'AP News',
  'new york times': 'New York Times', 'nyt': 'New York Times',
  'washington post': 'Washington Post', 'wapo': 'Washington Post',
  'wall street journal': 'Wall Street Journal', 'wsj': 'Wall Street Journal',
  'financial times': 'Financial Times', 'ft': 'Financial Times',
  'the guardian': 'The Guardian', 'guardian': 'The Guardian',
  'al jazeera': 'Al Jazeera', 'fox news': 'Fox News',
  'cnn': 'CNN', 'msnbc': 'MSNBC', 'nbc news': 'NBC News',
  'abc news': 'ABC News', 'cbs news': 'CBS News',
  'bloomberg': 'Bloomberg', 'economist': 'The Economist',
  'time': 'TIME', 'newsweek': 'Newsweek',
  'daily mail': 'Daily Mail', 'the times': 'The Times',
  'le monde': 'Le Monde', 'der spiegel': 'Der Spiegel',
  'south china morning post': 'South China Morning Post',
  'nikkei': 'Nikkei Asia', 'arab news': 'Arab News',
  'times of india': 'Times of India'
};

function matchSource(text) {
  if (!text) return null;
  const lower = text.toLowerCase();
  for (const [alias, name] of Object.entries(SOURCE_ALIASES)) {
    if (lower.includes(alias)) return name;
  }
  return null;
}

function categorize(text) {
  const lower = (text || '').toLowerCase();
  if (lower.match(/kill|murder|dead|death|assassin/)) return 'Journalist Safety';
  if (lower.match(/arrest|jail|prison|detain|imprison/)) return 'Journalist Safety';
  if (lower.match(/assault|attack|beat|injur|harm|threaten/)) return 'Journalist Safety';
  if (lower.match(/fine|sanction|regulat|license|ban/)) return 'Regulatory';
  if (lower.match(/lawsuit|sue|court|defamat|libel|injunction/)) return 'Legal';
  if (lower.match(/plagiar|fabricat|retract|fake|mislead|misinform/)) return 'Editorial Integrity';
  if (lower.match(/censor|block|restrict|pressure|propaganda/)) return 'Press Freedom';
  if (lower.match(/owner|acqui|bought|sold|merger|invest/)) return 'Ownership';
  return 'Press Freedom';
}

function getIcon(category) {
  const icons = {
    'Journalist Safety': '🆘',
    'Regulatory': '⚖️',
    'Legal': '📋',
    'Editorial Integrity': '📰',
    'Press Freedom': '🔇',
    'Ownership': '🏢'
  };
  return icons[category] || '⚠️';
}

async function fetchCPJ() {
  const items = [];
  try {
    const res = await fetch('https://cpj.org/feed/', {
      headers: { 'User-Agent': 'ChromaNews/1.0 RSS Reader' }
    });
    const xml = await res.text();
    const entries = xml.match(/<item>([\s\S]*?)<\/item>/g) || [];
    for (const item of entries.slice(0, 30)) {
      const titleMatch = item.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/) || item.match(/<title>([\s\S]*?)<\/title>/);
      const linkMatch = item.match(/<link>(.*?)<\/link>/);
      const descMatch = item.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/) || item.match(/<description>([\s\S]*?)<\/description>/);
      const dateMatch = item.match(/<pubDate>(.*?)<\/pubDate>/);
      if (!titleMatch) continue;
      const headline = titleMatch[1].replace(/<[^>]+>/g, '').trim();
      const detail = descMatch ? descMatch[1].replace(/<[^>]+>/g, '').trim().slice(0, 300) : '';
      const url = linkMatch ? linkMatch[1].trim() : '';
      const date = dateMatch ? new Date(dateMatch[1]).toISOString().split('T')[0] : null;
      const sourceName = matchSource(headline + ' ' + detail);
      const category = categorize(headline + ' ' + detail);
      if (sourceName) {
        items.push({ source_name: sourceName, category, status: 'reported', headline, detail, incident_date: date, reported_by: 'CPJ', external_url: url });
      }
    }
  } catch(e) { console.error('CPJ fetch error:', e.message); }
  return items;
}

async function fetchRSF() {
  const items = [];
  try {
    const res = await fetch('https://rsf.org/en/rss', {
      headers: { 'User-Agent': 'ChromaNews/1.0 RSS Reader' }
    });
    const xml = await res.text();
    const entries = xml.match(/<item>([\s\S]*?)<\/item>/g) || [];
    for (const item of entries.slice(0, 30)) {
      const titleMatch = item.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/) || item.match(/<title>([\s\S]*?)<\/title>/);
      const linkMatch = item.match(/<link>(.*?)<\/link>/);
      const descMatch = item.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/) || item.match(/<description>([\s\S]*?)<\/description>/);
      const dateMatch = item.match(/<pubDate>(.*?)<\/pubDate>/);
      if (!titleMatch) continue;
      const headline = titleMatch[1].replace(/<[^>]+>/g, '').trim();
      const detail = descMatch ? descMatch[1].replace(/<[^>]+>/g, '').trim().slice(0, 300) : '';
      const url = linkMatch ? linkMatch[1].trim() : '';
      const date = dateMatch ? new Date(dateMatch[1]).toISOString().split('T')[0] : null;
      const sourceName = matchSource(headline + ' ' + detail);
      const category = categorize(headline + ' ' + detail);
      if (sourceName) {
        items.push({ source_name: sourceName, category, status: 'reported', headline, detail, incident_date: date, reported_by: 'RSF', external_url: url });
      }
    }
  } catch(e) { console.error('RSF fetch error:', e.message); }
  return items;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');

  const { source, refresh } = req.query;

  // If refresh=1, fetch fresh data from CPJ and RSF
  if (refresh === '1') {
    const [cpjItems, rsfItems] = await Promise.all([fetchCPJ(), fetchRSF()]);
    const allItems = [...cpjItems, ...rsfItems];

    // Upsert into Supabase
    let inserted = 0;
    for (const item of allItems) {
      try {
        const r = await fetch(`${SUPABASE_URL}/rest/v1/red_flags`, {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json', 'Prefer': 'return=minimal,resolution=ignore-duplicates'
          },
          body: JSON.stringify(item)
        });
        if (r.status === 201) inserted++;
      } catch(e) {}
    }
    res.status(200).json({ success: true, fetched: allItems.length, inserted });
    return;
  }

  // Otherwise return cached flags, optionally filtered by source
  try {
    let url = `${SUPABASE_URL}/rest/v1/red_flags?order=incident_date.desc&select=*`;
    if (source) url += `&source_name=eq.${encodeURIComponent(source)}`;
    const r = await fetch(url, {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
    });
    const data = await r.json();
    res.status(200).json({ flags: Array.isArray(data) ? data : [] });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}
