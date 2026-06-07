const SUPABASE_URL = 'https://wjpzockgilneshwjnzyq.supabase.co'
const SUPABASE_KEY = 'sb_publishable_3dddKM0I04IPWvDM06mS9g__SfHH9fx'

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

const CURRENCY_PAIRS = ['EUR','GBP','JPY','AUD','CAD','CHF','CNY','SGD','THB','HKD']

async function fetchYahooHistory(symbol, days) {
  try {
    const end = Math.floor(Date.now() / 1000)
    const start = end - (days * 24 * 60 * 60)
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&period1=${start}&period2=${end}`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ChromaNews/1.0)', 'Accept': 'application/json' }
    })
    if (!res.ok) return null
    const data = await res.json()
    const result = data?.chart?.result?.[0]
    if (!result) return null
    const closes = result.indicators?.quote?.[0]?.close || []
    const meta = result.meta
    const current = meta.regularMarketPrice
    const prev1d = closes.length >= 2 ? closes[closes.length - 2] : null
    const prev1w = closes.length >= 6 ? closes[closes.length - 6] : null
    const prev1m = closes.length >= 22 ? closes[closes.length - 22] : closes[0] || null
    const pct = (a, b) => b && a ? Math.round(((a - b) / b) * 10000) / 100 : null
    return {
      price: Math.round(current * 100) / 100,
      change_1d: pct(current, prev1d),
      change_1w: pct(current, prev1w),
      change_1m: pct(current, prev1m)
    }
  } catch (e) { return null }
}

async function fetchCurrencyHistory(base) {
  try {
    const today = new Date()
    const fmt = d => d.toISOString().split('T')[0]
    const d1 = new Date(today); d1.setDate(d1.getDate() - 1)
    const d7 = new Date(today); d7.setDate(d7.getDate() - 7)
    const d30 = new Date(today); d30.setDate(d30.getDate() - 30)

    const [r0, r1, r7, r30] = await Promise.all([
      fetch(`https://api.exchangerate-api.com/v4/latest/${base}`).then(r => r.json()),
      fetch(`https://api.exchangerate-api.com/v4/${fmt(d1)}/${base}`).then(r => r.json()).catch(() => null),
      fetch(`https://api.exchangerate-api.com/v4/${fmt(d7)}/${base}`).then(r => r.json()).catch(() => null),
      fetch(`https://api.exchangerate-api.com/v4/${fmt(d30)}/${base}`).then(r => r.json()).catch(() => null)
    ])

    return { current: r0, hist1d: r1, hist1w: r7, hist1m: r30 }
  } catch (e) { return null }
}

async function updateStocks() {
  for (const stock of STOCK_SYMBOLS) {
    const data = await fetchYahooHistory(stock.symbol, 35)
    if (!data) continue
    await fetch(`${SUPABASE_URL}/rest/v1/stocks?symbol=eq.${stock.symbol}`, {
      method: 'PATCH',
      headers: {
        'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json', 'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        price: data.price,
        change_pct: data.change_1d,
        change_1w: data.change_1w,
        change_1m: data.change_1m,
        updated_at: new Date().toISOString()
      })
    })
  }
  console.log('Stocks updated')
}

async function updateCurrencies() {
  const base = 'USD'
  const hist = await fetchCurrencyHistory(base)
  if (!hist || !hist.current) return
  const pct = (curr, prev, pair) => {
    if (!prev || !prev.rates) return null
    const c = curr.rates[pair], p = prev.rates[pair]
    return c && p ? Math.round(((c - p) / p) * 10000) / 100 : null
  }
  for (const pair of CURRENCY_PAIRS) {
    const rate = hist.current.rates[pair]
    if (!rate) continue
    await fetch(`${SUPABASE_URL}/rest/v1/currencies?symbol=eq.${pair}`, {
      method: 'PATCH',
      headers: {
        'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json', 'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        rate: Math.round(rate * 10000) / 10000,
        change_1d: pct(hist.current, hist.hist1d, pair),
        change_1w: pct(hist.current, hist.hist1w, pair),
        change_1m: pct(hist.current, hist.hist1m, pair),
        updated_at: new Date().toISOString()
      })
    })
  }
  console.log('Currencies updated')
}

module.exports = async function handler(req, res) {
  if (res.setHeader) res.setHeader('Access-Control-Allow-Origin', '*');

  try {
    await Promise.all([updateStocks(), updateCurrencies()])

    const sourcesRes = await fetch(`${SUPABASE_URL}/rest/v1/sources?status=eq.active&select=*`, {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
    })
    const sources = await sourcesRes.json()
    if (!Array.isArray(sources)) {
      return res.status(200).json({ debug: true, sources_response: sources })
    }

    // Only process articles published in the last 2 hours
    const cutoff = new Date(Date.now() - 6 * 60 * 60 * 1000)

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

          // Parse published date and skip if older than 2 hours
          const dateMatch = item.match(/<pubDate>(.*?)<\/pubDate>/) ||
                           item.match(/<published>(.*?)<\/published>/) ||
                           item.match(/<updated>(.*?)<\/updated>/)
          const published_at = dateMatch
            ? new Date(dateMatch[1]).toISOString()
            : new Date().toISOString()

          if (new Date(published_at) < cutoff) continue

          const descMatch = item.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/) ||
                           item.match(/<description>([\s\S]*?)<\/description>/) ||
                           item.match(/<summary[^>]*>([\s\S]*?)<\/summary>/)
          const deck = descMatch
            ? descMatch[1].replace(/<[^>]+>/g, '').trim().slice(0, 300)
            : null

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

    res.status(200).json({
      success: true,
      message: `Ingested ${totalInserted} new articles`,
      sources_processed: sources.length
    })
  } catch (error) {
    res.status(500).json({ success: false, error: error.message })
  }
}
