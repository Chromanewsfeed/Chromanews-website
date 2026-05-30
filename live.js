window.addEventListener('load', function() {
  fetch('https://wjpzockgilneshwjnzyq.supabase.co/rest/v1/articles?status=eq.published&order=published_at.desc&limit=20&select=headline,url,deck,published_at', {
    headers: {
      'apikey': 'sb_publishable_3dddKM0I04IPWvDM06mS9g__SfHH9fx',
      'Authorization': 'Bearer sb_publishable_3dddKM0I04IPWvDM06mS9g__SfHH9fx'
    }
  })
  .then(function(r) { return r.json(); })
  .then(function(articles) {
    if (!Array.isArray(articles) || !articles.length) return;
    var feed = document.getElementById('feed');
    feed.querySelectorAll('.story-card').forEach(function(c) { c.remove(); });
    articles.forEach(function(a) {
      var diff = Date.now() - new Date(a.published_at).getTime();
      var ago = Math.floor(diff/3600000) < 24 ? Math.floor(diff/3600000) + 'h ago' : Math.floor(diff/86400000) + 'd ago';
      var el = document.createElement('article');
      el.className = 'story-card';
      el.innerHTML = '<div><div class="story-meta"><span class="source-badge t1"><span class="tier-dot"></span>T1 · BBC News</span><span class="story-time">' + ago + '</span></div><div class="story-headline" style="cursor:pointer" onclick="window.open(\'' + a.url + '\',\'_blank\')">' + a.headline + '</div>' + (a.deck ? '<div class="story-deck">' + a.deck + '</div>' : '') + '</div>';
      feed.appendChild(el);
    });
  })
  .catch(function(e) { console.error(e); });
});
