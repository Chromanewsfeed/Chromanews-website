const SUPABASE_URL = 'https://wjpzockgilneshwjnzyq.supabase.co';
const SUPABASE_KEY = 'sb_publishable_3dddKM0I04IPWvDM06mS9g__SfHH9fx';
const GROQ_KEY = process.env.GROQ_API_KEY;

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { url, headline, url_hash, deck } = req.method === 'POST' ? req.body : req.query;
  if (!url) { res.status(400).json({ error: 'Missing url' }); return; }

  // Strip stray markdown code-fence markers (```json, ```) that Groq
  // sometimes leaves inside individual field values even when the outer
  // JSON wrapper itself is clean.
  function stripFences(s) {
    if (typeof s !== 'string') return s;
    return s
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/gi, '')
      .trim();
  }

  // Check cache — match on URL (exact) not just url_hash (which can collide when truncated)
  try {
    const cached = await fetch(
      `${SUPABASE_URL}/rest/v1/summaries?url=eq.${encodeURIComponent(url)}&select=*&limit=1`,
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
    );
    const cachedData = await cached.json();
    if (Array.isArray(cachedData) && cachedData.length > 0 && cachedData[0].summary_brief) {
      const row = cachedData[0];
      res.status(200).json({
        cached: true,
        ...row,
        summary_brief: stripFences(row.summary_brief),
        summary_body: stripFences(row.summary_body),
        summary_why: stripFences(row.summary_why),
        summary_bullets: Array.isArray(row.summary_bullets) ? row.summary_bullets.map(stripFences) : row.summary_bullets,
      });
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
    articleText = `Headline: ${headline}. ${deck || ''}`;
  }

  // Call Groq
  try {
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_KEY}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 800,
        temperature: 0.1,
        messages: [
          {
            role: 'system',
            content: 'You are a news summarizer. Respond with ONLY a raw JSON object, no markdown, no code blocks, no extra text, and no markdown code fences anywhere in the response including inside field values. Use this exact format: {"brief":"2-3 sentence overview here","bullets":["key point one","key point two","key point three"],"why":"1 sentence on why this matters"}'
          },
          {
            role: 'user',
            content: `Summarize this news article.\nHeadline: ${headline}\n\nContent:\n${articleText}`
          }
        ]
      })
    });

    const groqData = await groqRes.json();
    const rawText = groqData.choices?.[0]?.message?.content || '';

    // Parse JSON from Groq response
    let summary = { brief: '', bullets: [], why: '' };
    try {
      let cleaned = rawText
        .replace(/```json\s*/gi, '')
        .replace(/```\s*/gi, '')
        .trim();
      try {
        summary = JSON.parse(cleaned);
      } catch(e1) {
        const match = cleaned.match(/\{[\s\S]*\}/);
        if (match) {
          try { summary = JSON.parse(match[0]); }
          catch(e2) { summary = { brief: cleaned.slice(0, 300), bullets: [], why: '' }; }
        }
      }
    } catch(e) {}

    // Strip any leftover code-fence markers from inside individual fields
    // (catches cases where Groq nests ```json inside a field's string value,
    // which survives outer-level cleanup since the JSON still parses fine)
    const brief   = stripFences(typeof summary.brief   === 'string' ? summary.brief   : '');
    const bullets = Array.isArray(summary.bullets)      ? summary.bullets.map(stripFences) : [];
    const why     = stripFences(typeof summary.why     === 'string' ? summary.why     : '');
    const body    = stripFences(typeof summary.body    === 'string' ? summary.body    : '');

    // Save to cache keyed on full URL
    if (brief || bullets.length) {
      try {
        await fetch(`${SUPABASE_URL}/rest/v1/summaries`, {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'resolution=merge-duplicates,return=minimal'
          },
          body: JSON.stringify({
            url_hash: url_hash || url,
            url,
            headline,
            summary_brief: brief,
            summary_body: body,
            summary_bullets: bullets,
            summary_why: why
          })
        });
      } catch(e) {}
    }

    res.status(200).json({ cached: false, summary_brief: brief, summary_body: body, summary_bullets: bullets, summary_why: why });

  } catch(e) {
    res.status(500).json({ error: 'Summary generation failed: ' + e.message });
  }
};
