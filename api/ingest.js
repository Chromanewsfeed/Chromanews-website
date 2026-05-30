const SUPABASE_URL = 'https://wjpzockgilneshwjnzyq.supabase.co'
const SUPABASE_KEY = 'sb_publishable_3dddKM0I04IPWvDM06mS9g__SfHH9fx'

module.exports = async function handler(req, res) {
  try {
    const sourcesRes = await fetch(`${SUPABASE_URL}/rest/v1/sources?status=eq.active&select=*`, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
      }
    })
    const sources = await sourcesRes.json()

    if (!Array.isArray(sources)) {
      return res.status(200).json({ debug: true, sources_response: sources })
    }

    const debugInfo = []

    for (const source of sources) {
      try {
        const feedRes = await fetch(source.feed_url, {
          headers: { 'User-Agent': 'ChromaNews/1.0 RSS Reader' }
        })
        const xml = await feedRes.text()
        const items = xml.match(/<item>([\s\S]*?)<\/item>/g) || []
        
        debugInfo.push({
          source: source.name,
          url: source.feed_url,
          status: feedRes.status,
          items_found: items.length,
          first_500_chars: xml.slice(0, 500)
        })
      } catch (e) {
        debugInfo.push({ source: source.name, error: e.message })
      }
    }

    res.status(200).json({ debug: true, feeds: debugInfo })

  } catch (error) {
    res.status(500).json({ success: false, error: error.message })
  }
}
