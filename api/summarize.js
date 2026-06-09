const SUPABASE_URL = 'https://wjpzockgilneshwjnzyq.supabase.co';
const SUPABASE_KEY = 'sb_publishable_3dddKM0I04IPWvDM06mS9g__SfHH9fx';
const GROQ_KEY = process.env.GROQ_API_KEY;
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  const { url, headline, url_hash, deck } = req.method === 'POST' ? req.body : req.query;
  if (!url || !url_hash) { res.status(400).json({ error: 'Missing url or url_hash' }); return; }
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
  let articleText = '';
  try {
    const articleRes = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ChromaNews/1.0)', 'Accept': 'text/html' },
      redirect: 'follow'
    });
    const html = await articleRes.text();
    articleText = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 6000);
  } catch(e) {
    articleText = `Headline: ${headline}. ${deck || ''}`;
  }
  try {
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_KEY}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 1000,
        temperature: 0.3,
        messages: [
          { role: 'system', content: 'You are a neutral news summarizer. Return ONLY a valid JSON object: {"brief":"2-3 sentence overview","body":"2-3 paragraphs","bullets":["point1","point2","point3"],"why":"1 paragraph on significance"}. No markdown, no extra text.' },
          { role: 'user', content: `Headline: ${headline}\n\nContent:\n${articleText}` }
        ]
      })
    });
    const groqData = await groqRes.json();
    const rawText = groqData.choices?.[0]?.message?.content || '{}';
    const cleaned = rawText.replace(/```json/g, '').replace(/```/g, '').replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ').trim();
    let summary;
    try { summary = JSON.parse(cleaned); } catch(e) { const m = cleaned.match(/\{[\s\S]*\}/); summary = m ? JSON.parse(m[0]) : { brief: cleaned, body: '', bullets: [], why: '' }; }
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/summaries`, {
        method: 'POST',
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify({ url_hash, url, headline, summary_brief: summary.brief || '', summary_body: summary.body || '', summary_bullets: summary.bullets || [], summary_why: summary.why || '' })
      });
    } catch(e) {}
    res.status(200).json({ cached: false, summary_brief: summary.brief || '', summary_body: summary.body || '', summary_bullets: summary.bullets || [], summary_why: summary.why || '' });
  } catch(e) {
    res.status(500).json({ error: 'Summary generation failed: ' + e.message });
  }
};
