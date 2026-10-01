(function () {
  var btn = document.querySelector('.menu-btn'), side = document.querySelector('.sidebar');
  if (btn) btn.addEventListener('click', function () { side.classList.toggle('open'); });

  var input = document.getElementById('q'), box = document.getElementById('results'), index = null, sel = -1;
  var root = document.documentElement.getAttribute('data-root') || '';
  function load() {
    if (index) return Promise.resolve(index);
    return fetch(root + 'search-index.json').then(function (r) { return r.json(); }).then(function (j) { return (index = j); });
  }
  function esc(s) { return s.replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function run() {
    var q = input.value.trim().toLowerCase();
    if (q.length < 2) { box.classList.remove('open'); return; }
    load().then(function (idx) {
      var terms = q.split(/\s+/), hits = [];
      idx.forEach(function (p) {
        var hay = (p.title + ' ' + p.headings.join(' ') + ' ' + p.text).toLowerCase(), score = 0;
        for (var i = 0; i < terms.length; i++) {
          if (hay.indexOf(terms[i]) < 0) return;
          if (p.title.toLowerCase().indexOf(terms[i]) >= 0) score += 5;
          if (p.headings.join(' ').toLowerCase().indexOf(terms[i]) >= 0) score += 3;
          score += 1;
        }
        hits.push([score, p]);
      });
      hits.sort(function (a, b) { return b[0] - a[0]; });
      box.innerHTML = hits.slice(0, 8).map(function (h) {
        var p = h[1], at = p.text.toLowerCase().indexOf(terms[0]);
        var snip = at >= 0 ? p.text.slice(Math.max(0, at - 40), at + 90) : p.text.slice(0, 120);
        return '<a href="' + root + p.url + '"><b>' + esc(p.title) + '</b><small>' + esc(p.section) + ' · ' + esc(snip) + '…</small></a>';
      }).join('') || '<a><b>No matches</b><small>Try fewer or different words.</small></a>';
      box.classList.add('open'); sel = -1;
    });
  }
  if (input) {
    input.addEventListener('input', run);
    input.addEventListener('keydown', function (e) {
      var items = box.querySelectorAll('a[href]');
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length; items.forEach(function (a, i) { a.classList.toggle('sel', i === sel); }); }
      if (e.key === 'Enter' && items[Math.max(sel, 0)]) location.href = items[Math.max(sel, 0)].href;
      if (e.key === 'Escape') { box.classList.remove('open'); input.blur(); }
    });
    document.addEventListener('keydown', function (e) { if (e.key === '/' && document.activeElement.tagName !== 'INPUT') { e.preventDefault(); input.focus(); } });
    document.addEventListener('click', function (e) { if (!e.target.closest('.search')) box.classList.remove('open'); });
  }
  var links = [].slice.call(document.querySelectorAll('.toc a'));
  if (links.length && 'IntersectionObserver' in window) {
    var map = {}; links.forEach(function (a) { map[a.getAttribute('href').slice(1)] = a; });
    var obs = new IntersectionObserver(function (es) { es.forEach(function (en) { if (en.isIntersecting) { links.forEach(function (a) { a.style.color = ''; }); var a = map[en.target.id]; if (a) a.style.color = 'var(--brand)'; } }); }, { rootMargin: '-60px 0px -70% 0px' });
    document.querySelectorAll('article h2[id], article h3[id]').forEach(function (h) { obs.observe(h); });
  }
})();
