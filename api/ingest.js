import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = 'https://wjpzockgilneshwjnzyq.supabase.co'
const SUPABASE_KEY = 'sb_publishable_3dddKM0I04IPWvDM06mS9g__SfHH9fx'

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

export default async function handler(req, res) {
  try {
    // Get all active sources
    const { data: sources, error: sourcesError } = await supabase
      .from('sources')
      .select('*')
      .eq('status', 'active')

    if (sourcesError) throw sourcesError

    let totalInserted = 0

    for (const source of sources) {
      try {
        // Fetch RSS feed
        const response = await fetch(source.feed_url)
        const xml = await response.text()

        // Parse headlines from RSS
        const items = xml.match(/<item>([\s\S]*?)<\/item>/g) || []

        for (const item of items.slice(0, 10)) {
          // Get headline
          const titleMatch = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) ||
                            item.match(/<title>(.*?)<\/title>/)
          const headline = titleMatch ? titleMatch[1].trim() : null
          if (!headline) continue

          // Get URL
          const linkMatch = item.match(/<link>(.*?)<\/link>/) ||
                           item.match(/<guid>(.*?)<\/guid>/)
          const url = linkMatch ? linkMatch[1].trim() : null
          if (!url) continue

          // Get description
          const descMatch = item.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/) ||
                           item.match(/<description>(.*?)<\/description>/)
          const deck = descMatch ? descMatch[1].replace(/<[^>]+>/g, '').trim().slice(0, 300) : null

          // Get publish date
          const dateMatch = item.match(/<pubDate>(.*?)<\/pubDate>/)
          const published_at = dateMatch ? new Date(dateMatch[1]).toISOString() : new Date().toISOString()

          // Create URL hash to avoid duplicates
          const url_hash = btoa(url).slice(0, 64)

          // Insert article — skip if URL already exists
          const { error } = await supabase
            .from('articles')
            .insert({
              source_id: source.id,
              headline,
              deck,
              url,
              url_hash,
              published_at,
              category: 'Top Stories',
              status: 'published'
            })
            .select()

          if (!error) totalInserted++
        }
      } catch (sourceError) {
        console.error(`Error processing ${source.name}:`, sourceError)
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
