const SUPABASE_URL = 'https://wjpzockgilneshwjnzyq.supabase.co'
const SUPABASE_KEY = 'sb_publishable_3dddKM0I04IPWvDM06mS9g__SfHH9fx'

async function ingest() {
  // Get all active sources
  const sourcesRes = await fetch(`${SUPABASE_URL}/rest/v1/sources?status=eq.active&select=*`, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
  })
  const sources = await sourcesRes.json()
  if (!Array.isArray(sources) || !sources.length) {
    console.log('No sources found')
    return 0
  }
  console.log(`Processing ${sources.length} sources`)

  const cutoff = new Date(Date.now() - 6 * 60 * 60 * 1000)
  let totalInserted = 0

  for (const source of sources) {
    try {
      const feedRes = await fetch(source.feed_url, {
        headers: { 'User-Agent': 'ChromaNews/1.0 RSS Reader' },
        signal: AbortSignal.timeout(8000)
      })
      if (!feedRes.ok) continue
      const xml = await feedRes.text()

      const items = xml.match(/<item[\s>]([\s\S]*?)<\/item>/g) ||
                    xml.match(/<entry>([\s\S]*?)<\/entry>/g) || []

      for (const item of items.slice(0, 15)) {
        const titleMatch = item.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/) ||
                          item.match(/<title[^>]*>([\s\S]*?)<\/title>/)
        const headline = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : null
        if (!headline) continue

        const linkMatch = item.match(/<link>(.*?)<\/link>/) ||
                         item.match(/<link[^>]+href="([^"]+)"/) ||
                         item.match(/<guid[^>]*>(.*?)<\/guid>/)
        const url = linkMatch ? linkMatch[1].trim() : null
        if (!url || !url.startsWith('http')) continue

        const dateMatch = item.match(/<pubDate>(.*?)<\/pubDate>/) ||
                         item.match(/<published>(.*?)<\/published>/) ||
                         item.match(/<updated>(.*?)<\/updated>/)

        // Parse date safely — reject future dates more than 2 hours out (catches malformed/timezone-shifted RSS dates)
        const now = new Date()
        const parsedDate = dateMatch ? new Date(dateMatch[1]) : now
        const published_at = (isNaN(parsedDate.getTime()) || parsedDate > new Date(now.getTime() + 2 * 60 * 60 * 1000))
          ? now.toISOString()
          : parsedDate.toISOString()

        if (new Date(published_at) < cutoff) continue

        const descMatch = item.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/) ||
                         item.match(/<description>([\s\S]*?)<\/description>/) ||
                         item.match(/<summary[^>]*>([\s\S]*?)<\/summary>/)
        const deck = descMatch ? descMatch[1].replace(/<[^>]+>/g, '').trim().slice(0, 300) : null

        const url_hash = Buffer.from(url).toString('base64').slice(0, 64)

        const checkRes = await fetch(
          `${SUPABASE_URL}/rest/v1/articles?url_hash=eq.${encodeURIComponent(url_hash)}&select=id`,
          { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
        )
        const existing = await checkRes.json()
        if (Array.isArray(existing) && existing.length > 0) continue

        const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/articles`, {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json', 'Prefer': 'return=minimal'
          },
          body: JSON.stringify({
            source_id: source.id, headline, deck, url, url_hash,
            published_at, category: 'Top Stories', status: 'published'
          })
        })
        if (insertRes.status === 201) totalInserted++
      }
    } catch (e) {
      console.error(`Error with ${source.name}:`, e.message)
    }
  }

  console.log(`Inserted ${totalInserted} new articles`)
  return totalInserted
}

module.exports = async function handler(req, res) {
  try {
    const total = await ingest()
    const statusFn = res.status ? res.status.bind(res) : (code) => ({ json: (d) => console.log(code, JSON.stringify(d)) })
    statusFn(200).json({ success: true, inserted: total })
  } catch (error) {
    console.error(error)
    if (res.status) res.status(500).json({ success: false, error: error.message })
  }
}
