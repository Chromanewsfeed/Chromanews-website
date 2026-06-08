const SUPABASE_URL = 'https://wjpzockgilneshwjnzyq.supabase.co'
const SUPABASE_KEY = 'sb_publishable_3dddKM0I04IPWvDM06mS9g__SfHH9fx'
module.exports = async function handler(req, res) {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/articles?status=eq.published&order=published_at.desc&limit=300&select=headline,url,deck,published_at,sources(name,tier,trust_score,political_lean)`,
    { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
  )
  const articles = await response.json()
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0, s-maxage=0')
  res.setHeader('CDN-Cache-Control', 'no-store')
  res.setHeader('Vercel-CDN-Cache-Control', 'no-store')
  res.setHeader('Pragma', 'no-cache')
  res.status(200).json(articles)
}
