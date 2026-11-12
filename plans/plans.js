(function () {
  var A = window.POPAuth;
  var LOGIN = '../login/log.html';
  var $ = function (id) { return document.getElementById(id); };
  var ORDER = { free: 0, pro: 1, max: 2, unlimited: 3, dev: 3 };
  var TAG = {
    free: 'للبدء والتجربة والاستخدام الخفيف',
    pro: 'للأعمال الصغيرة والاستخدام المنتظم',
    max: 'للفرق والحملات الكبيرة',
    unlimited: 'للاستخدام المكثف دون حدود',
    dev: 'للمطورين والتكاملات الكبيرة'
  };
  var ERR = {
    invalid_pay_code: 'هذا الكود غير صحيح. تأكد من كتابته كما وصلك من MC_Ai.',
    code_used: 'استُخدم هذا الكود من قبل، ولا يمكن تفعيله مرة أخرى.',
    rate: 'محاولات كثيرة. يرجى الانتظار 15 دقيقة ثم المحاولة مجددًا.',
    unavailable: 'تعذّر تفعيل الكود الآن. يرجى المحاولة بعد قليل.',
    network: 'تعذّر الاتصال. يرجى التحقق من الإنترنت.'
  };

  var session = A.read();
  if (!session) {
    A.clear();
    window.location.replace(LOGIN);
    return;
  }

  var cfg = null;
  var me = null;

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function leave() {
    A.clear();
    window.location.replace(LOGIN);
  }

  function renderMine() {
    var box = $('mine');
    box.textContent = '';
    (cfg.order || []).forEach(function (id) {
      var t = cfg.tools[id];
      if (!t) return;
      var s = (me.subs && me.subs[id]) || { plan: 'free' };
      var row = el('div', 'mine-row' + (s.plan !== 'free' ? ' paid' : ''));
      var a = el('div', 'mine-name');
      a.appendChild(el('b', '', t.title));
      a.appendChild(el('small', '', s.plan === 'free' ? 'الباقة المجانية' : s.expiresAt ? 'سارية حتى ' + A.fmtDate(s.expiresAt) : 'اشتراك دائم دون تاريخ انتهاء'));
      row.appendChild(a);
      row.appendChild(el('span', 'badge plan-' + s.plan, A.planName(s.plan)));
      box.appendChild(row);
    });
  }

  function renderTools() {
    var host = $('tools');
    host.textContent = '';
    (cfg.order || []).forEach(function (id, idx) {
      var t = cfg.tools[id];
      if (!t) return;
      var cur = ((me.subs && me.subs[id]) || { plan: 'free' }).plan;
      var sec = el('section', 'card tool-plans');
      sec.setAttribute('aria-label', t.title);
      var head = el('div', 'card-head');
      head.appendChild(el('span', 'step', String(idx + 3)));
      head.appendChild(el('h2', '', t.title));
      if (id === 'api') {
        var link = el('a', 'btn ghost small', 'دليل الاستخدام');
        link.href = '../api/api.html';
        head.appendChild(link);
      }
      sec.appendChild(head);
      if (t.about) sec.appendChild(el('p', 'tool-about', t.about));
      var grid = el('div', 'pgrid');
      Object.keys(t.plans)
        .sort(function (a, b) { return (ORDER[a] || 0) - (ORDER[b] || 0); })
        .forEach(function (p) {
          var card = el('article', 'pcard' + (p === cur ? ' current' : '') + (p === 'pro' ? ' pop' : ''));
          var top = el('div', 'pcard-top');
          top.appendChild(el('h3', '', A.planName(p)));
          if (p === cur) top.appendChild(el('span', 'now', 'باقتك الحالية'));
          else if (p === 'pro') top.appendChild(el('span', 'tag', 'الأكثر طلبًا'));
          card.appendChild(top);
          card.appendChild(el('p', 'pcard-tag', TAG[p] || ''));
          if (t.plans[p].price && p !== 'free') {
            var price = el('p', 'pcard-price');
            price.appendChild(el('b', '', t.plans[p].price));
            price.appendChild(el('span', '', ' ' + (cfg.currency || '') + (cfg.period ? ' / ' + cfg.period : '')));
            card.appendChild(price);
          }
          var ul = el('ul', 'feats');
          (t.plans[p].features || []).forEach(function (f) { ul.appendChild(el('li', '', f)); });
          card.appendChild(ul);
          if (p === 'free') card.appendChild(el('span', 'pcard-foot', 'متاحة لكل الحسابات تلقائيًا'));
          else {
            var go = el('a', 'btn small' + (p === cur ? ' ghost' : ''), p === cur ? 'تمديد الاشتراك' : 'الحصول على كود');
            go.href = cfg.store || 'https://mc-ai.crstudio911.workers.dev/';
            go.target = '_blank';
            go.rel = 'noopener noreferrer';
            card.appendChild(go);
          }
          grid.appendChild(card);
        });
      sec.appendChild(grid);
      host.appendChild(sec);
    });
  }

  function render() {
    if (cfg.store) $('store').href = cfg.store;
    renderMine();
    renderTools();
    $('gate').hidden = true;
    $('top').hidden = false;
    $('view').hidden = false;
  }

  function load() {
    Promise.all([A.post('/api/config', {}), A.call('/api/session/check', session.t)]).then(function (res) {
      var c = res[0];
      var s = res[1];
      if (!s.ok && (s.error === 'invalid_session' || s.status === 401)) return leave();
      if (!c.ok || !s.ok) return A.goError(c.status && s.status ? 'server' : 'net');
      cfg = c;
      me = s;
      A.user(s);
      render();
    });
  }

  $('code').addEventListener('input', function () {
    var v = this.value.toUpperCase().replace(/[^A-Z0-9-]/g, '');
    if (v !== this.value) this.value = v;
  });

  $('redeem').addEventListener('submit', function (e) {
    e.preventDefault();
    var code = $('code').value.trim().toUpperCase();
    var state = $('redeem-state');
    state.className = 'hint';
    if (!/^[A-Z0-9][A-Z0-9-]{6,38}[A-Z0-9]$/.test(code)) {
      state.textContent = 'يرجى إدخال كود الاشتراك كاملًا كما وصلك.';
      state.classList.add('bad');
      return;
    }
    var btn = $('redeem-btn');
    btn.disabled = true;
    state.textContent = 'جارٍ التحقق من الكود...';
    A.call('/api/plans/redeem', session.t, { code: code }).then(function (r) {
      btn.disabled = false;
      if (r.ok) {
        $('code').value = '';
        state.textContent = 'تم تفعيل باقة ' + A.planName(r.plan) + ' لـ «' + (r.title || r.tool) + '»' + (r.expiresAt ? ' حتى ' + A.fmtDate(r.expiresAt) : ' دون تاريخ انتهاء') + '.';
        state.classList.add('good');
        me.subs = me.subs || {};
        me.subs[r.tool] = { plan: r.plan, expiresAt: r.expiresAt };
        A.user(me);
        renderMine();
        renderTools();
        return;
      }
      if (r.error === 'invalid_session') return leave();
      state.textContent = ERR[r.error] || ERR.unavailable;
      state.classList.add('bad');
    });
  });

  $('out').addEventListener('click', function () {
    A.call('/api/session/end', session.t).then(leave, leave);
  });

  load();
})();
