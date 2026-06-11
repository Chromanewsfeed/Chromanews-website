export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const sym = (req.query.sym || '').trim().toUpperCase();
  if (!sym) { res.status(400).json({ error: 'Missing sym parameter' }); return; }

  function getLondonCloseUnix(daysAgo) {
    const now = new Date();
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysAgo, 23, 59, 0));
    return Math.floor(d.getTime() / 1000);
  }

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=400d`;
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const d = await r.json();
    const result = d?.chart?.result?.[0];
    if (!result) { res.status(404).json({ error: 'Symbol not found' }); return; }

    const meta = result.meta || {};
    const timestamps = result.timestamp || [];
    const closes = result.indicators?.adjclose?.[0]?.adjclose ||
                   result.indicators?.quote?.[0]?.close || [];

    let cur = null, curIdx = -1;
    for (let i = closes.length - 1; i >= 0; i--) {
      if (closes[i] && !isNaN(closes[i])) { cur = closes[i]; curIdx = i; break; }
    }
    if (!cur) { res.status(404).json({ error: 'No price data' }); return; }

    function findClose(daysAgo) {
      const target = getLondonCloseUnix(daysAgo);
      let best = null, bestDiff = Infinity;
      for (let i = 0; i < timestamps.length; i++) {
        if (timestamps[i] >= timestamps[curIdx]) continue;
        const diff = Math.abs(timestamps[i] - target);
        if (diff < 259200 && closes[i] && !isNaN(closes[i])) {
          if (diff < bestDiff) { bestDiff = diff; best = closes[i]; }
        }
      }
      if (!best) {
        for (let i = curIdx - (daysAgo === 1 ? 1 : daysAgo); i >= 0; i--) {
          if (closes[i] && !isNaN(closes[i])) { best = closes[i]; break; }
        }
      }
      return best;
    }

    const pct = (a, b) => b ? ((a - b) / b) * 100 : null;
    const prev1   = findClose(1);
    const prev7   = findClose(7);
    const prev30  = findClose(30);
    const prev365 = findClose(365);

    res.status(200).json({
      symbol:       meta.symbol || sym,
      name:         meta.longName || meta.shortName || sym,
      exchange:     meta.exchangeName || '',
      currency:     meta.currency || 'USD',
      price:        cur,
      d1:           pct(cur, prev1),
      d7:           pct(cur, prev7),
      d30:          pct(cur, prev30),
      d365:         pct(cur, prev365),
      marketState:  meta.marketState || '',
    });
  } catch(e) {
    res.status(500).json({ error: 'Lookup failed: ' + e.message });
  }
}
