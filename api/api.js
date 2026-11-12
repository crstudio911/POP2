(function () {
  var A = window.POPAuth;
  var LOGIN = '../login/log.html';
  var $ = function (id) { return document.getElementById(id); };
  var BASE = (String((window.POP && window.POP.api) || '').replace(/\/+$/, '') || window.location.origin) + '/v1';
  var session = A.read();
  var info = null;

  Array.prototype.forEach.call(document.querySelectorAll('[data-base]'), function (e) { e.textContent = BASE; });
  Array.prototype.forEach.call(document.querySelectorAll('pre.code code'), function (e) {
    e.textContent = e.textContent.split('{BASE}').join(BASE);
  });
  Array.prototype.forEach.call(document.querySelectorAll('pre.code .copy'), function (b) {
    b.addEventListener('click', function () {
      var t = b.parentNode.querySelector('code').textContent;
      copy(t, function (ok) {
        b.textContent = ok ? 'تم النسخ' : 'تعذّر النسخ';
        setTimeout(function () { b.textContent = 'نسخ'; }, 1600);
      });
    });
  });

  function copy(text, done) {
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(false); });
    else done(false);
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function show() {
    $('gate').hidden = true;
    $('top').hidden = false;
    $('view').hidden = false;
  }

  function leave() {
    A.clear();
    window.location.replace(LOGIN);
  }

  function renderPlans(cfg) {
    var t = cfg && cfg.tools && cfg.tools.api;
    var box = $('api-plans');
    box.textContent = '';
    if (!t) return;
    var cur = info && info.api ? info.api.plan : '';
    ['free', 'pro', 'max', 'dev'].forEach(function (p) {
      if (!t.plans[p]) return;
      var c = el('article', 'pcard' + (p === cur ? ' current' : ''));
      var top = el('div', 'pcard-top');
      top.appendChild(el('h3', '', 'API ' + A.planName(p)));
      if (p === cur) top.appendChild(el('span', 'now', 'باقتك الحالية'));
      c.appendChild(top);
      var ul = el('ul', 'feats');
      t.plans[p].features.forEach(function (f) { ul.appendChild(el('li', '', f)); });
      c.appendChild(ul);
      box.appendChild(c);
    });
  }

  function renderKey() {
    var k = info.key || { has: false };
    var a = info.api || {};
    $('api-plan').textContent = 'API ' + A.planName(a.plan);
    $('k-min').textContent = String(a.perMinute || '-');
    $('k-day').textContent = (a.usedDay || 0) + ' / ' + (a.perDay || '-');
    $('k-share').textContent = (a.factor || '-') + '%';
    $('k-exp').textContent = a.plan === 'free' ? 'دائمة' : a.expiresAt ? 'حتى ' + A.fmtDate(a.expiresAt) : 'دون تاريخ انتهاء';
    var st = $('k-state');
    st.textContent = '';
    if (k.has) {
      var row = el('div', 'krow');
      var code = el('code', 'mono', k.hint);
      code.setAttribute('translate', 'no');
      code.dir = 'ltr';
      row.appendChild(el('span', 'kdot'));
      row.appendChild(code);
      st.appendChild(row);
      var meta = el('p', 'hint', 'أُنشئ في ' + A.fmtDate(k.createdAt) + (k.lastUsed ? '، وآخر استخدام في ' + A.fmtDate(k.lastUsed) : '، ولم يُستخدم بعد') + '. إجمالي الطلبات: ' + (k.uses || 0) + '.');
      st.appendChild(meta);
      $('k-make').textContent = 'إنشاء مفتاح جديد';
      $('k-revoke').hidden = false;
      $('k-ips-form').hidden = false;
      if (document.activeElement !== $('k-ips')) $('k-ips').value = String(k.ips || '').split(',').filter(Boolean).join(', ');
    } else {
      st.appendChild(el('p', 'hint', 'لا يوجد مفتاح فعّال لحسابك حتى الآن.'));
      $('k-make').textContent = 'إنشاء مفتاح';
      $('k-revoke').hidden = true;
      $('k-ips-form').hidden = true;
    }
  }

  function loadUser() {
    return A.call('/api/dev/info', session.t, {}).then(function (r) {
      if (!r.ok) {
        if (r.error === 'invalid_session' || r.status === 401) return leave();
        return A.goError(r.status ? 'server' : 'net');
      }
      info = r;
      A.user(r);
      $('keys-user').hidden = false;
      renderKey();
    });
  }

  var cfgP = A.post('/api/config', {});

  if (session) {
    Promise.all([loadUser(), cfgP]).then(function (res) {
      renderPlans(res[1]);
      show();
    });
  } else {
    A.guest({ login: LOGIN });
    $('keys-guest').hidden = false;
    cfgP.then(function (c) {
      renderPlans(c);
      show();
    });
  }

  var MSG = {
    rate: 'أنشأت مفاتيح كثيرة في وقت قصير. يرجى المحاولة بعد 15 دقيقة.',
    unavailable: 'تعذّر تنفيذ الطلب الآن. يرجى المحاولة بعد قليل.'
  };

  $('k-make').addEventListener('click', function () {
    if (!info) return;
    if (info.key && info.key.has && !window.confirm('سيُلغى المفتاح الحالي فورًا، وستتوقف كل البرامج التي تستخدمه. هل تريد المتابعة؟')) return;
    var b = $('k-make');
    b.disabled = true;
    $('k-msg').textContent = '';
    A.call('/api/dev/create', session.t, {}).then(function (r) {
      b.disabled = false;
      if (!r.ok) {
        if (r.error === 'invalid_session') return leave();
        $('k-msg').textContent = MSG[r.error] || MSG.unavailable;
        return;
      }
      $('k-full').textContent = r.key;
      $('k-fresh').hidden = false;
      info.key = { has: true, hint: r.hint, createdAt: A.now(), lastUsed: 0, uses: 0, ips: '' };
      renderKey();
      $('k-copy').focus();
    });
  });

  $('k-copy').addEventListener('click', function () {
    copy($('k-full').textContent, function (ok) {
      $('k-copy').textContent = ok ? 'تم النسخ' : 'انسخه يدويًا';
    });
  });

  $('k-revoke').addEventListener('click', function () {
    if (!window.confirm('سيُلغى المفتاح فورًا، وستتوقف كل البرامج التي تستخدمه. هل أنت متأكد؟')) return;
    var b = $('k-revoke');
    b.disabled = true;
    A.call('/api/dev/revoke', session.t, {}).then(function (r) {
      b.disabled = false;
      if (!r.ok) {
        $('k-msg').textContent = MSG.unavailable;
        return;
      }
      $('k-fresh').hidden = true;
      $('k-full').textContent = '';
      info.key = { has: false };
      renderKey();
      $('k-msg').textContent = 'أُلغي المفتاح.';
    });
  });

  $('k-ips-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var list = $('k-ips').value.split(/[\s,]+/).filter(Boolean);
    var bad = list.filter(function (x) {
      return !/^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/.test(x) && !/^(?=.*:.*:)[0-9a-fA-F:]{2,39}$/.test(x);
    });
    var msg = $('k-ips-msg');
    if (bad.length || list.length > 10) {
      msg.textContent = list.length > 10 ? 'يمكنك إضافة 10 عناوين كحد أقصى.' : 'هذا العنوان غير صحيح: ' + bad[0];
      return;
    }
    var b = $('k-ips-save');
    b.disabled = true;
    msg.textContent = 'جارٍ الحفظ...';
    A.call('/api/dev/ips', session.t, { ips: list }).then(function (r) {
      b.disabled = false;
      if (!r.ok) {
        if (r.error === 'invalid_session') return leave();
        msg.textContent = r.error === 'invalid_ips' ? 'تحقّق من العناوين، فأحدها غير صحيح.' : MSG.unavailable;
        return;
      }
      info.key.ips = r.ips || '';
      msg.textContent = r.ips ? 'حُفظت العناوين. سيعمل المفتاح من هذه العناوين فقط.' : 'أُزيل التقييد. يعمل المفتاح من أي عنوان.';
    });
  });

  var out = $('out');
  if (out) out.addEventListener('click', function () {
    A.call('/api/session/end', session.t).then(leave, leave);
  });
})();
