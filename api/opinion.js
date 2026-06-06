const SUPABASE_URL = 'https://wjpzockgilneshwjnzyq.supabase.co';
const SUPABASE_KEY = 'sb_publishable_3dddKM0I04IPWvDM06mS9g__SfHH9fx';

const T4_FEEDS = [
  {name:'Joe Rogan',        type:'youtube', id:'UCzWQYUVCpZqtN93H8RR44Qw', lean:'center',       reach:5},
  {name:'Tucker Carlson',   type:'youtube', id:'UCNVy9H8FpOgBiMmCpZIXj7Q', lean:'far-right',    reach:4},
  {name:'Ben Shapiro',      type:'youtube', id:'UCnQC_G5Xsjhp9fEJKuIcrsg', lean:'far-right',    reach:4},
  {name:'Jordan Peterson',  type:'youtube', id:'UCL_f53ZEJxp8TtlOkHwMV9Q', lean:'center-right', reach:4},
  {name:'Bill Maher',       type:'youtube', id:'UCy6kyFxaBcCFSnGd4MY0Wbg', lean:'center-left',  reach:3},
  {name:'Rachel Maddow',    type:'youtube', id:'UCaXkIU1QidjPwiAAxw8JSJA', lean:'center-left',  reach:3},
  {name:'The Young Turks',  type:'youtube', id:'UC1yBKRuGpC1tSM73A0ZjYjQ', lean:'far-left',     reach:3},
  {name:'Bari Weiss',       type:'rss', url:'https://api.rss2json.com/v1/api.json?rss_url=https://www.thefp.com/feed', lean:'center', reach:3},
  {name:'Douglas Murray',   type:'rss', url:'https://api.rss2json.com/v1/api.json?rss_url=https://www.spectator.co.uk/feed/', lean:'center-right', reach:2},
  {name:'Naomi Klein',      type:'rss', url:'https://api.rss2json.com/v1/api.json?rss_url=https://www.theguardian.com/profile/naomi-klein/rss', lean:'far-left', reach:2},
  {name:'Nate Silver',      type:'rss', url:'https://api.rss2json.com/v1/api.json?rss_url=https://www.natesilver.net/feed', lean:'center', reach:2},
  {name:'Glenn Greenwald',  type:'youtube', id:'UCi_GmMBOCrwwDLOhBRHOeZA', lean:'center',       reach:2},
  {name:'Candace Owens',    type:'youtube', id:'UCL0u5uz7KZ9q-pe-VC8TY-w', lean:'far-right',    reach:2},
  {name:'Megyn Kelly',      type:'youtube', id:'UCG1y4vJEHMTHMJSEMQ2wMMw', lean:'center-right', reach:2},
  {name:'Glenn Beck',       type:'youtube', id:'UCVqiSClkXbnqQ_2jdtlWGZg', lean:'far-right',    reach:2},
  {name:'Matt Walsh',       type:'youtube', id:'UCHaO2bPDDOFSYmfxDiNUhXQ', lean:'far-right',    reach:2}
];

async function fetchWithTimeout(url, options, ms=6000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, {...options, signal: controller.signal});
    clearTimeout(timer);
    return res;
  } catch(e) { clearTimeout(timer); throw e; }
}

async function fetchYouTube(feed) {
  try {
    const rssUrl = `https://api.rss2json.com/v1/api.json?rss_url=https://www.youtube.com/feeds/videos.xml?channel_id=${feed.id}`;
    const res = await fetchWithTimeout(rssUrl, {headers:{'User-Agent':'ChromaNews/1.0'}});
    if (!res.ok) return [];
    const data = await res.json();
    if (!data.items) return [];
    return data.items.slice(0, 3).map(item => ({
      name: feed.name,
      type: 'video',
      title: item.title || '',
      url: item.link || '',
      thumb: item.thumbnail || item.enclosure?.link || null,
      date: item.pubDate || new Date().toISOString(),
      lean: feed.lean,
      reach: feed.reach
    })).filter(i => i.title && i.url);
  } catch(e) { return []; }
}

async function fetchRSS(feed) {
  try {
    const res = await fetchWithTimeout(feed.url, {headers:{'User-Agent':'ChromaNews/1.0'}});
    if (!res.ok) return [];
    const data = await res.json();
    if (!data.items) return [];
    return data.items.slice(0, 3).map(item => ({
      name: feed.name,
      type: 'editorial',
      title: item.title || '',
      url: item.link || '',
      thumb: item.thumbnail || null,
      date: item.pubDate || new Date().toISOString(),
      lean: feed.lean,
      reach: feed.reach
    })).filter(i => i.title && i.url);
  } catch(e) { return []; }
}

async function refreshOpinion() {
  const results = await Promise.allSettled(
    T4_FEEDS.map(feed => feed.type === 'youtube' ? fetchYouTube(feed) : fetchRSS(feed))
  );

  const items = results
    .filter(r => r.status === 'fulfilled')
    .flatMap(r => r.value)
    .filter(i => i && i.title);

  if (!items.length) return 0;

  // Clear old items and insert fresh ones
  await fetch(`${SUPABASE_URL}/rest/v1/opinion_items?id=neq.00000000-0000-0000-0000-000000000000`, {
    method: 'DELETE',
    headers: {'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`}
  });

  let inserted = 0;
  for (const item of items) {
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/opinion_items`, {
        method: 'POST',
        headers: {'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal'},
        body: JSON.stringify({
          name: item.name,
          type: item.type,
          title: item.title,
          url: item.url,
          thumb: item.thumb,
          date: new Date(item.date).toISOString(),
          lean: item.lean,
          reach: item.reach
        })
      });
      if (r.status === 201) inserted++;
    } catch(e) {}
  }
  return inserted;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate');

  // Refresh mode
  if (req.query.refresh === '1') {
    const inserted = await refreshOpinion();
    res.status(200).json({ success: true, inserted });
    return;
  }

  // Serve from Supabase cache
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/opinion_items?order=date.desc&limit=60&select=*`, {
      headers: {'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`}
    });
    const data = await r.json();
    const items = Array.isArray(data) ? data : [];

    // If cache is empty, trigger refresh
    if (!items.length) {
      const inserted = await refreshOpinion();
      const r2 = await fetch(`${SUPABASE_URL}/rest/v1/opinion_items?order=date.desc&limit=60&select=*`, {
        headers: {'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`}
      });
      const data2 = await r2.json();
      res.status(200).json({ items: Array.isArray(data2) ? data2 : [], refreshed: true });
      return;
    }

    res.status(200).json({ items });
  } catch(e) {
    res.status(500).json({ error: e.message, items: [] });
  }
}
