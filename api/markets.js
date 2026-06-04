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

  async function fetchChart(sym) {
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=35d`;
      const r = await fetch(url, {headers:{'User-Agent':'Mozilla/5.0'}});
      const d = await r.json();
      const closes = d?.chart?.result?.[0]?.indicators?.adjclose?.[0]?.adjclose;
      if (!closes || closes.length < 2) return null;
      const valid = closes.filter(x => x && !isNaN(x));
      const cur = valid[valid.length - 1];
      const prev1 = valid[valid.length - 2] || null;
      const prev7 = valid[valid.length - 8] || null;
      const prev30 = valid[valid.length - 31] || null;
      const pct = (a, b) => b ? ((a - b) / b) * 100 : null;
      return {price: cur, d1: pct(cur, prev1), d7: pct(cur, prev7), d30: pct(cur, prev30)};
    } catch(e) { return null; }
  }

  const [commodResults, stockResults] = await Promise.all([
    Promise.all(COMMODITIES.map(async c => ({...c, data: await fetchChart(c.sym)}))),
    Promise.all(INDICES.map(async s => ({...s, data: await fetchChart(s.sym)})))
  ]);

  res.status(200).json({
    commodities: commodResults,
    stocks: stockResults
  });
}
