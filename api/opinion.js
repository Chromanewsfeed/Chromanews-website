const YK = process.env.YOUTUBE_API_KEY || '';

const T4_FEEDS = [
  {name:'Joe Rogan',        type:'youtube', id:'UCzWQYUVCpZqtN93H8RR44Qw', lean:'center',       reach:5},
  {name:'Tucker Carlson',   type:'youtube', id:'UCNVy9H8FpOgBiMmCpZIXj7Q', lean:'far-right',    reach:4},
  {name:'Ben Shapiro',      type:'youtube', id:'UCnQC_G5Xsjhp9fEJKuIcrsg', lean:'far-right',    reach:4},
  {name:'Jordan Peterson',  type:'youtube', id:'UCL_f53ZEJxp8TtlOkHwMV9Q', lean:'center-right', reach:4},
  {name:'Bill Maher',       type:'youtube', id:'UCy6kyFxaBcCFSnGd4MY0Wbg', lean:'center-left',  reach:3},
  {name:'Rachel Maddow',    type:'youtube', id:'UCaXkIU1QidjPwiAAxw8JSJA', lean:'center-left',  reach:3},
  {name:'The Young Turks',  type:'youtube', id:'UC1yBKRuGpC1tSM73A0ZjYjQ', lean:'far-left',     reach:3},
  {name:'Bari Weiss',       type:'rss',     url:'https://www.thefp.com/feed', lean:'center', reach:3},
  {name:'Douglas Murray',   type:'rss',     url:'https://www.spectator.co.uk/feed/', lean:'center-right', reach:2},
  {name:'Naomi Klein',      type:'rss',     url:'https://www.theguardian.com/profile/naomi-klein/rss', lean:'far-left', reach:2},
  {name:'Nate Silver',      type:'rss',     url:'https://www.natesilver.net/feed', lean:'center', reach:2},
  {name:'Glenn Greenwald',  type:'youtube', id:'UCi_GmMBOCrwwDLOhBRHOeZA', lean:'center',       reach:2},
  {name:'Candace Owens',    type:'youtube', id:'UCL0u5uz7KZ9q-pe-VC8TY-w', lean:'far-right',    reach:2},
  {name:'Megyn Kelly',      type:'youtube', id:'UCG1y4vJEHMTHMJSEMQ2wMMw', lean:'center-right', reach:2},
  {name:'Glenn Beck',       type:'youtube', id:'UCVqiSClkXbnqQ_2jdtlWGZg', lean:'far-right',    reach:2},
  {name:'Matt Walsh',       type:'youtube', id:'UCHaO2bPDDOFSYmfxDiNUhXQ', lean:'far-right',    reach:2}
];

async function fetchWithTimeout(url, options, ms=5000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, {...options, signal: controller.signal});
    clearTimeout(timer);
    return res;
  } catch(e) {
    clearTimeout(timer);
    throw e;
  }
}

async function fetchYouTube(channelId, name, lean, reach) {
  try {
    const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
    const res = await fetchWithTimeout(rssUrl, { headers: { 'User-Agent': 'ChromaNews/1.0' } }, 5000);
    if (!res.ok) return [];
    const xml = await res.text();
    const entries = xml.match(/<entry>([\s\S]*?)<\/entry>/g) || [];
    return entries.slice(0, 2).map(entry => {
      const titleMatch = entry.match(/<title>([\s\S]*?)<\/title>/);
      const linkMatch = entry.match(/<link rel="alternate" href="([^"]+)"/);
      const thumbMatch = entry.match(/url="([^"]+)"/);
      const dateMatch = entry.match(/<published>(.*?)<\/published>/);
      const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g,'').trim() : '';
      if (!title) return null;
      return {
        name, type: 'video',
        title,
        url: linkMatch ? linkMatch[1] : `https://www.youtube.com/channel/${channelId}`,
        thumb: thumbMatch ? thumbMatch[1] : null,
        date: dateMatch ? dateMatch[1] : new Date().toISOString(),
        lean, reach
      };
    }).filter(Boolean);
  } catch(e) { return []; }
}

async function fetchRSS(url, name, lean, reach) {
  try {
    const res = await fetchWithTimeout(url, { headers: { 'User-Agent': 'ChromaNews/1.0 RSS Reader' } }, 5000);
    if (!res.ok) return [];
    const xml = await res.text();
    const items = xml.match(/<item>([\s\S]*?)<\/item>/g) || xml.match(/<entry>([\s\S]*?)<\/entry>/g) || [];
    return items.slice(0, 2).map(item => {
      const titleMatch = item.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/) || item.match(/<title[^>]*>([\s\S]*?)<\/title>/);
      const linkMatch = item.match(/<link>(.*?)<\/link>/) || item.match(/<link[^>]+href="([^"]+)"/);
      const dateMatch = item.match(/<pubDate>(.*?)<\/pubDate>/) || item.match(/<published>(.*?)<\/published>/);
      const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g,'').trim() : '';
      const link = linkMatch ? linkMatch[1].trim() : url;
      if (!title) return null;
      return { name, type: 'editorial', title, url: link, thumb: null, date: dateMatch ? new Date(dateMatch[1]).toISOString() : new Date().toISOString(), lean, reach };
    }).filter(Boolean);
  } catch(e) { return []; }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate');

  try {
    const results = await Promise.allSettled(
      T4_FEEDS.map(feed => {
        if (feed.type === 'youtube') return fetchYouTube(feed.id, feed.name, feed.lean, feed.reach);
        return fetchRSS(feed.url, feed.name, feed.lean, feed.reach);
      })
    );

    const items = results
      .filter(r => r.status === 'fulfilled')
      .flatMap(r => r.value)
      .filter(i => i && i.title)
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 40);

    res.status(200).json({ items, count: items.length });
  } catch(e) {
    res.status(500).json({ error: e.message, items: [] });
  }
}
