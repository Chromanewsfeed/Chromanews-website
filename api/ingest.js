const SUPABASE_URL = 'https://wjpzockgilneshwjnzyq.supabase.co'
const SUPABASE_KEY = 'sb_publishable_3dddKM0I04IPWvDM06mS9g__SfHH9fx'

export default async function handler(req, res) {
  try {
    // Get all active sources
    const sourcesRes = await fetch(`${SUPABASE_URL}/rest/v1/sources?status=eq.active`, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
      }
    })
    const sources = await sourcesRes.json()

    let totalInserted = 0

    for (const source of sources) {
      try {
        const response = await fetch(source.feed_url)
        const xml = await response.text()
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
          const deck = descMatch ? descMatch[1].replace(/<[^>]+>/g, '').trim().slice(0, 300) : null

          const dateMatch = item.match(/<pubDate>(.*?)<\/pubDate>/)
          const published_at = dateMatch ? new Date(dateMatch[1]).toISOString() : new Date().toISOString()

          const url_hash = Buffer.from(url).toString('base64').slice(0, 64)

          // Check if article already exists
          const checkRes = await fetch(
            `${SUPABASE_URL}/rest/v1/articles?url_hash=eq.${encodeURIComponent(url_hash)}`,
            {
              headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`
              }
            }
          )
          const existing = await checkRes.json()
          if (existing.length > 0) continue

          // Insert new article
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

          if (insertRes.ok) totalInserted++
        }
      } catch (sourceError) {
        console.error(`Error processing ${source.name}:`, sourceError.message)
      }
    }

    res.status(200).json({
      success: true,
      message: `Ingested ${totalInserted} new articles`,
      sources_processed: sources.length
    })

  } catch (error) {
    console.error('Ingestion error:', error)
    res.status(500).json({ success: false, error: error.message })
  }
}
