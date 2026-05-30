const SUPABASE_URL = 'https://wjpzockgilneshwjnzyq.supabase.co'
const SUPABASE_KEY = 'sb_publishable_3dddKM0I04IPWvDM06mS9g__SfHH9fx'

module.exports = async function handler(req, res) {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/articles?status=eq.published&order=published_at.desc&limit=20&select=*,sources(name,tier)`,
    { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
  )
  const articles = await response.json()
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.status(200).json(articles)
}
