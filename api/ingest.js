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

    let totalInserted = 0

    for (const source of sources) {
      try {
        const feedRes = await fetch(source.feed_url)
        const xml = await feedRes.text()
        const items = xml.match(/<item>([\s\S]*?)<\/item>/g) || []

        for (const item of items.slice(0, 10)) {
          const titleMatch = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) ||
                            item.match(/<title>(.*?)<\/title>/)
          const headline = titleMatch ? titleMatch[1].trim() : null
          if (!headline) continue

          const linkMatch = item.match(/<link>(.*?)<\/link>/) ||
                           item.match(/<guid>(.*?)<\/guid>/)
          const url = linkMatch ? linkMatch[1].trim() : null
          if (!url) continue

          const descMatch = item.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/) ||
                           item.match(/<description>(.*?)<\/description>/)
          const deck = descMatch
            ? descMatch[1].replace(/<[^>]+>/g, '').trim().slice(0, 300)
            : null

          const dateMatch = item.match(/<pubDate>(.*?)<\/pubDate>/)
          const published_at = dateMatch
            ? new Date(dateMatch[1]).toISOString()
            : new Date().toISOString()

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
              'apikey': SUPABASE_KEY,
              'Authorization': `Bearer ${SUPABASE_KEY}`,
              'Content-Type': 'application/json',
              'Prefer': 'return=minimal'
            },
            body: JSON.stringify({
              source_id: source.id,
              headline,
              deck,
              url,
              url_hash,
              published_at,
              category: 'Top Stories',
              status: 'published'
            })
          })

          if (insertRes.status === 201) totalInserted++
        }
      } catch (e) {
        console.error(`Error with ${source.name}:`, e.message)
      }
    }

    res.status(200).json({
      success: true,
      message: `Ingested ${totalInserted} new articles`,
      sources_processed: sources.length
    })

  } catch (error) {
    res.status(500).json({ success: false, error: error.message })
  }
}
