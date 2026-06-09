const SUPABASE_URL = 'https://wjpzockgilneshwjnzyq.supabase.co';
const SUPABASE_KEY = 'sb_publishable_3dddKM0I04IPWvDM06mS9g__SfHH9fx';
const GROQ_KEY = process.env.GROQ_API_KEY;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { url, headline, url_hash, deck } = req.method === 'POST' ? req.body : req.query;
  if (!url || !url_hash) { res.status(400).json({ error: 'Missing url or url_hash' }); return; }

  // Check cache first
  try {
    const cached = await fetch(`${SUPABASE_URL}/rest/v1/summaries?url_hash=eq.${encodeURIComponent(url_hash)}&select=*`, {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
    });
    const cachedData = await cached.json();
    if (Array.isArray(cachedData) && cachedData.length > 0) {
      res.status(200).json({ cached: true, ...cachedData[0] });
      return;
    }
  } catch(e) {}

  // Fetch article content
  let articleText = '';
  try {
    const articleRes = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ChromaNews/1.0)', 'Accept': 'text/html' },
      redirect: 'follow'
    });
    const html = await articleRes.text();
    articleText = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 6000);
  } catch(e) {
    articleText = `Article headline: ${headline}. ${deck || ''} Full text unavailable.`;
  }

  // Call Groq API
  try {
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
