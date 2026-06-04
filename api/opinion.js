const YK = 'AIzaSyDJt6ew4F5hUJ8Pp0mZlHau9IboiBn1iwo';

const T4_FEEDS = [
  {name:'Joe Rogan',        type:'youtube', id:'UCzWQYUVCpZqtN93H8RR44Qw', lean:'center',       reach:5},
  {name:'Tucker Carlson',   type:'youtube', id:'UCNVy9H8FpOgBiMmCpZIXj7Q', lean:'far-right',    reach:4},
  {name:'Ben Shapiro',      type:'youtube', id:'UCnQC_G5Xsjhp9fEJKuIcrsg', lean:'far-right',    reach:4},
  {name:'Jordan Peterson',  type:'youtube', id:'UCL_f53ZEJxp8TtlOkHwMV9Q', lean:'center-right', reach:4},
  {name:'Bill Maher',       type:'youtube', id:'UCy6kyFxaBcCFSnGd4MY0Wbg', lean:'center-left',  reach:3},
  {name:'Rachel Maddow',    type:'youtube', id:'UCaXkIU1QidjPwiAYu6GcHjg', lean:'center-left',  reach:3},
  {name:'The Young Turks',  type:'youtube', id:'UC1yBKRuGpC1tSM73A0ZjYjQ', lean:'far-left',     reach:3},
  {name:'Glenn Greenwald',  type:'youtube', id:'UCi_GmMBOCrwwDLOhBRHOeZA', lean:'center',       reach:2},
  {name:'Mehdi Hasan',      type:'youtube', id:'UCloNQauxDuXH9Bg3GXBMFkw', lean:'center-left',  reach:2},
  {name:'Candace Owens',    type:'youtube', id:'UCL0u5uz7KZ9q-pe-VC8TY-w', lean:'far-right',    reach:2},
  {name:'Megyn Kelly',      type:'youtube', id:'UCG1y4vJEHMTHMJSEMQ2wMMw', lean:'center-right', reach:2},
  {name:'Glenn Beck',       type:'youtube', id:'UCVqiSClkXbnqQ_2jdtlWGZg', lean:'far-right',    reach:2},
  {name:'Matt Walsh',       type:'youtube', id:'UCHaO2bPDDOFSYmfxDiNUhXQ', lean:'far-right',    reach:2},
  {name:'Paul Krugman',     type:'rss',     url:'https://rss.nytimes.com/services/xml/rss/nyt/Opinion.xml', lean:'center-left', reach:3},
  {name:'Thomas Friedman',  type:'rss',     url:'https://rss.nytimes.com/services/xml/rss/nyt/Opinion.xml', lean:'center-left', reach:3},
  {name:'Bari Weiss',       type:'rss',     url:'https://www.thefp.com/feed', lean:'center', reach:3},
  {name:'Ezra Klein',       type:'rss',     url:'https://rss.nytimes.com/services/xml/rss/nyt/Opinion.xml', lean:'center-left', reach:2},
  {name:'Douglas Murray',   type:'rss',     url:'https://www.spectator.co.uk/feed/', lean:'center-right', reach:2},
  {name:'Naomi Klein',      type:'rss',     url:'https://www.theguardian.com/profile/naomi-klein/rss', lean:'far-left', reach:2},
  {name:'Nate Silver',      type:'rss',     url:'https://www.natesilver.net/feed', lean:'center', reach:2},
  {name:'Fareed Zakaria',   type:'rss',     url:'https://rss.cnn.com/rss/cnn_allpolitics.rss', lean:'center-left', reach:3}
];

async function fetchYouTube(channelId, name) {
  const url = `https://www.googleapis.com/youtube/v3/search?key=${YK}&channelId=${channelId}&part=snippet&order=date&maxResults=2&type=video`;
  const res = await fetch(url);
  const data = await res.json();
  if (!data.items) return [];
  return data.items.map(v => ({
    name,
    type: 'video',
    title: v.snippet.title,
    url: `https://www.youtube.com/watch?v=${v.id.videoId}`,
    thumb: v.snippet.thumbnails?.medium?.url || null,
    date: v.snippet.publishedAt
  }));
}

async function fetchRSS(rssUrl, name) {
  const url = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rssUrl)}&count=2`;
  const res = await fetch(url);
  const data = await res.json();
  if (!data.items) return [];
  return data.items.slice(0, 2).map(a => ({
    name,
    type: 'article',
    title: a.title,
    url: a.link,
    thumb: a.thumbnail || null,
    date: a.pubDate
  }));
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate');

  const results = await Promise.allSettled(
    T4_FEEDS.map(src => {
      const meta = { lean: src.lean, reach: src.reach };
      if (src.type === 'youtube') {
        return fetchYouTube(src.id, src.name).then(items =>
          items.map(i => ({ ...i, ...meta }))
        );
      } else {
        return fetchRSS(src.url, src.name).then(items =>
          items.map(i => ({ ...i, ...meta }))
        );
      }
    })
  );

  const items = results
    .filter(r => r.status === 'fulfilled')
    .flatMap(r => r.value)
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  res.status(200).json({ items });
}
