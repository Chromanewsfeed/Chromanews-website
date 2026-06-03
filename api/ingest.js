const SUPABASE_URL = 'https://wjpzockgilneshwjnzyq.supabase.co'
const SUPABASE_KEY = 'sb_publishable_3dddKM0I04IPWvDM06mS9g__SfHH9fx'

// Stock symbols to track via Yahoo Finance (server-side, no CORS)
const STOCK_SYMBOLS = [
  {symbol:'DIA', name:'DOW Jones'},
  {symbol:'SPY', name:'S&P 500'},
  {symbol:'QQQ', name:'NASDAQ'},
  {symbol:'EWU', name:'FTSE 100'},
  {symbol:'EWJ', name:'Nikkei'},
  {symbol:'EWG', name:'DAX'},
  {symbol:'EWH', name:'Hang Seng'},
  {symbol:'EWA', name:'ASX 200'}
]

async function fetchStockPrice(symbol) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=2d`
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ChromaNews/1.0)',
        'Accept': 'application/json'
      }
    })
    if (!res.ok) return null
    const data = await res.json()
    const result = data?.chart?.result?.[0]
    if (!result) return null
    const meta = result.meta
    const price = meta.regularMarketPrice
    const prevClose = meta.chartPreviousClose || meta.previousClose
    const changePct = prevClose ? ((price - prevClose) / prevClose * 100) : 0
    return { price: Math.round(price * 100) / 100, change_pct: Math.round(changePct * 100) / 100 }
  } catch (e) {
    return null
  }
}

async function updateStocks() {
  for (const stock of STOCK_SYMBOLS) {
    const data = await fetchStockPrice(stock.symbol)
    if (!data) continue
    await fetch(`${SUPABASE_URL}/rest/v1/stocks?symbol=eq.${stock.symbol}`, {
      method: 'PATCH',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        price: data.price,
        change_pct: data.change_pct,
        updated_at: new Date().toISOString()
      })
    })
  }
  console.log('Stocks updated')
}

module.exports = async function handler(req, res) {
  try {
    // Update stocks first
    await updateStocks()

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
        const feedRes = await fetch(source.feed_url, {
          headers: { 'User-Agent': 'ChromaNews/1.0 RSS Reader' }
        })
        if (!feedRes.ok) continue
        const xml = await feedRes.text()

        const items = xml.match(/<item[\s>]([\s\S]*?)<\/item>/g) ||
                     xml.match(/<entry>([\s\S]*?)<\/entry>/g) || []

        for (const item of items.slice(0, 10)) {
          const titleMatch = item.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/) ||
                            item.match(/<title[^>]*>([\s\S]*?)<\/title>/)
          const headline = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : null
          if (!headline || headline === 'BBC News') continue

          const linkMatch = item.match(/<link>(.*?)<\/link>/) ||
                           item.match(/<link[^>]+href="([^"]+)"/) ||
                           item.match(/<guid[^>]*>(.*?)<\/guid>/)
          const url = linkMatch ? linkMatch[1].trim() : null
          if (!url || !url.startsWith('http')) continue

          const descMatch = item.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/) ||
                           item.match(/<description>([\s\S]*?)<\/description>/) ||
                           item.match(/<summary[^>]*>([\s\S]*?)<\/summary>/)
          const deck = descMatch
            ? descMatch[1].replace(/<[^>]+>/g, '').trim().slice(0, 300)
            : null

          const dateMatch = item.match(/<pubDate>(.*?)<\/pubDate>/) ||
                           item.match(/<published>(.*?)<\/published>/) ||
                           item.match(/<updated>(.*?)<\/updated>/)
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
