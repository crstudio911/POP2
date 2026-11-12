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
    var subs = r.subs || {};
    var free = Array.isArray(r.free) ? r.free : ['clean', 'link'];
    var cards = document.querySelectorAll('.tcard');
    Array.prototype.forEach.call(cards, function (c) {
      var id = c.dataset.tool;
      var st = c.querySelector('[data-state]');
      st.className = 'tcard-state';
      if (free.indexOf(id) >= 0) {
        st.textContent = 'مجانية بالكامل';
        st.classList.add('is-free');
        return;
      }
      var s = subs[id] || { plan: 'free' };
      st.textContent = 'باقة ' + A.planName(s.plan) + (s.plan !== 'free' && s.expiresAt ? ' حتى ' + A.fmtDate(s.expiresAt) : '');
      if (s.plan !== 'free') st.classList.add('is-paid');
    });
    var paid = 0;
    Object.keys(subs).forEach(function (k) {
      if (k !== 'api' && subs[k] && subs[k].plan !== 'free') paid++;
    });
    $('f-plan').textContent = paid ? paid + (paid === 1 ? ' اشتراك' : ' اشتراكات') : 'لا يوجد';
    $('f-api').textContent = A.planName((subs.api && subs.api.plan) || 'free');
    if (r.expires) $('f-exp').textContent = fmtDate(Number(r.expires), { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
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
      A.goError(r.status ? 'server' : 'net');
    });
  }
  load();

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
