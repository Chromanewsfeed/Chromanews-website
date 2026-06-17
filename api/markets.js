export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate');
  const COMMODITIES = [
    {name:'Gold',    sym:'GC=F', label:'Metals'},
    {name:'Silver',  sym:'SI=F', label:''},
    {name:'Platinum',sym:'PL=F', label:''},
    {name:'Copper',  sym:'HG=F', label:''},
    {name:'Brent',   sym:'BZ=F', label:'Energy'},
    {name:'WTI',     sym:'CL=F', label:''},
    {name:'Nat Gas', sym:'NG=F', label:''}
  ];
  const INDICES = [
    {name:'DOW',      sym:'^DJI'},
    {name:'S&P',      sym:'^GSPC'},
    {name:'NASDAQ',   sym:'^IXIC'},
    {name:'FTSE',     sym:'^FTSE'},
    {name:'Nikkei',   sym:'^N225'},
    {name:'Hang Seng',sym:'^HSI'},
    {name:'DAX',      sym:'^GDAXI'},
    {name:'ASX',      sym:'^AXJO'}
  ];
  const CURRENCY_PAIRS = ['EUR','GBP','JPY','AUD','CAD','CHF','CNY','SGD','THB','HKD','NZD','MYR','INR','BRL'];

  function getLondonCloseUnix(daysAgo) {
    const now = new Date();
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysAgo, 23, 59, 0));
    return Math.floor(d.getTime() / 1000);
  }

  async function fetchChart(sym) {
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=400d`;
      const r = await fetch(url, {headers:{'User-Agent':'Mozilla/5.0'}});
      const d = await r.json();
      const result = d?.chart?.result?.[0];
      if (!result) return null;
      const timestamps = result.timestamp || [];
      const closes = result.indicators?.adjclose?.[0]?.adjclose ||
                     result.indicators?.quote?.[0]?.close || [];
      if (!closes.length) return null;
      let cur = null, curIdx = -1;
      for (let i = closes.length - 1; i >= 0; i--) {
        if (closes[i] && !isNaN(closes[i])) { cur = closes[i]; curIdx = i; break; }
      }
      if (!cur) return null;
      function findCloseForDay(daysAgo) {
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
      const prev1   = findCloseForDay(1);
      const prev7   = findCloseForDay(7);
      const prev30  = findCloseForDay(30);
      const prev365 = findCloseForDay(365);
      const pct = (a, b) => b ? ((a - b) / b) * 100 : null;
      return {price: cur, d1: pct(cur, prev1), d7: pct(cur, prev7), d30: pct(cur, prev30), d365: pct(cur, prev365)};
    } catch(e) { return null; }
  }

  async function fetchCurrencyHistory(pair, base) {
    const sym = pair + base + '=X';
    return fetchChart(sym);
  }

  // CoinGecko Top 10 by market cap — server-side to avoid browser rate-limiting
  // Excludes stablecoins (USDT, USDC, DAI, BUSD) to show real crypto assets only
  async function fetchCrypto() {
    try {
      const url = 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=20&page=1&sparkline=false&price_change_percentage=7d,30d';
      const r = await fetch(url, {headers:{'User-Agent':'Mozilla/5.0','Accept':'application/json'}});
      if (!r.ok) return null;
      const data = await r.json();
      if (!Array.isArray(data)) return null;
      const STABLECOINS = ['usdt','usdc','dai','busd','tusd','usdp','usdd','frax','lusd','gusd'];
      const filtered = data
        .filter(coin => !STABLECOINS.includes(coin.symbol.toLowerCase()))
        .slice(0, 10);
      return filtered.map(coin => ({
        symbol: coin.symbol.toUpperCase(),
        name: coin.name,
        price: coin.current_price,
        d1: coin.price_change_percentage_24h || 0,
        d7: coin.price_change_percentage_7d_in_currency || null,
        d30: coin.price_change_percentage_30d_in_currency || null,
      }));
    } catch(e) { return null; }
  }

  const [commodResults, stockResults, currencyResults, cryptoResults] = await Promise.all([
    Promise.all(COMMODITIES.map(async c => ({...c, data: await fetchChart(c.sym)}))),
    Promise.all(INDICES.map(async s => ({...s, data: await fetchChart(s.sym)}))),
    Promise.all(CURRENCY_PAIRS.map(async p => ({pair: p, data: await fetchCurrencyHistory(p, 'USD')}))),
    fetchCrypto()
  ]);

  res.status(200).json({
    commodities: commodResults,
    stocks: stockResults,
    currencyHistory: currencyResults,
    crypto: cryptoResults,
    closingTime: 'London 23:59 GMT'
  });
}
