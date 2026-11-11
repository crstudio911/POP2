(function () {
  var A = window.POPAuth;
  var LOGIN = '../login/log.html';
  var $ = function (id) { return document.getElementById(id); };
  var lang = (window.POPLang && window.POPLang.current) || 'ar';

  function leave() {
    A.clear();
    window.location.replace(LOGIN);
  }

  var session = A.read();
  if (!session) {
    leave();
    return;
  }

  function fmtDate(ms, opts) {
    try {
      return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG' : lang, opts).format(new Date(ms));
    } catch (e) {
      return new Date(ms).toLocaleDateString();
    }
  }

  function apply(r) {
    A.user(r);
    $('hello').textContent = r.firstName || String(r.email || '').split('@')[0];
    var cards = document.querySelectorAll('.tcard');
    var allowed = Array.isArray(r.tools) ? r.tools : [];
    var count = 0;
    Array.prototype.forEach.call(cards, function (c) {
      var ok = allowed.indexOf(c.dataset.tool) >= 0;
      if (ok) count++;
      c.classList.toggle('locked', !ok);
      var st = c.querySelector('[data-state]');
      st.textContent = ok ? 'متاحة في خطتك' : 'غير متاحة في خطتك';
      if (!ok) c.setAttribute('aria-disabled', 'true');
    });
    $('f-tools').textContent = String(count);
    $('f-all').textContent = String(cards.length);
    if (r.expires) $('f-exp').textContent = fmtDate(Number(r.expires), { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
    var plan = document.getElementById('um-plan');
    if (plan) $('f-plan').textContent = plan.textContent;
    show();
  }

  function show() {
    $('gate').hidden = true;
    $('top').hidden = false;
    $('view').hidden = false;
  }

  $('today').textContent = fmtDate(Date.now(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  var yr = $('yr');
  if (yr) yr.textContent = String(new Date().getFullYear());

  function load() {
    A.call('/api/session/check', session.t).then(function (r) {
      if (r.ok) {
        apply(r);
        return;
      }
      if (r.error === 'invalid_session' || r.status === 401) {
        leave();
        return;
      }
      A.deny('offline', 'main.html', load);
    });
  }
  load();

  document.addEventListener('click', function (e) {
    var c = e.target.closest && e.target.closest('.tcard.locked');
    if (c) e.preventDefault();
  });

  var filter = 'all';
  function refilter() {
    var q = $('q').value.trim().toLowerCase();
    var shown = 0;
    Array.prototype.forEach.call(document.querySelectorAll('.tcard'), function (c) {
      var hit = (filter === 'all' || c.dataset.cat === filter) && (!q || c.textContent.toLowerCase().indexOf(q) >= 0);
      c.hidden = !hit;
      if (hit) shown++;
    });
    $('empty').hidden = shown > 0;
  }
  Array.prototype.forEach.call(document.querySelectorAll('[data-filter]'), function (b) {
    b.addEventListener('click', function () {
      filter = b.dataset.filter;
      Array.prototype.forEach.call(document.querySelectorAll('[data-filter]'), function (x) {
        x.classList.toggle('on', x === b);
        x.setAttribute('aria-pressed', x === b ? 'true' : 'false');
      });
      refilter();
    });
  });
  $('q').addEventListener('input', refilter);

  $('out').addEventListener('click', function () {
    A.call('/api/session/end', session.t).then(leave, leave);
  });
})();
