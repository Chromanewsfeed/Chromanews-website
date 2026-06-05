const SUPABASE_URL = 'https://wjpzockgilneshwjnzyq.supabase.co';
const SUPABASE_KEY = 'sb_publishable_3dddKM0I04IPWvDM06mS9g__SfHH9fx';
const GROQ_KEY = process.env.GROQ_API_KEY;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { url, headline, url_hash } = req.method === 'POST' ? req.body : req.query;
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
    articleText = `Article headline: ${headline}. Full text unavailable - summarize based on headline only.`;
  }

  // Call Groq API
  try {
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_KEY}`
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 1000,
        temperature: 0.3,
        messages: [
          {
            role: 'system',
            content: `You are a neutral, factual news summarizer for ChromaNews. Summarize news articles in clear, objective journalistic prose. No opinion, no spin. Always attribute to the source. Return ONLY a valid JSON object with these exact fields:
{
  "brief": "2-3 sentence overview of what happened and why it matters",
  "body": "2-3 paragraphs of flowing prose covering context, background, and key developments",
  "bullets": ["key point 1", "key point 2", "key point 3", "key point 4"],
  "why": "1 paragraph on broader significance or implications"
}`
          },
          {
            role: 'user',
            content: `Headline: ${headline}\n\nArticle content:\n${articleText}`
          }
        ]
      })
    });

    const groqData = await groqRes.json();
    const rawText = groqData.choices?.[0]?.message?.content || '{}';
    const clean = rawText.replace(/```json|```/g, '').trim();
    const summary = JSON.parse(clean);

    // Cache in Supabase
    await fetch(`${SUPABASE_URL}/rest/v1/summaries`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        url_hash,
        url,
        headline,
        summary_brief: summary.brief,
        summary_body: summary.body,
        summary_bullets: summary.bullets,
        summary_why: summary.why
      })
    });

    res.status(200).json({
      cached: false,
      summary_brief: summary.brief,
      summary_body: summary.body,
      summary_bullets: summary.bullets,
      summary_why: summary.why
    });
  } catch(e) {
    res.status(500).json({ error: 'Summary generation failed: ' + e.message });
  }
}
