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
    b.setAttribute('data-nobusy', '');
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
    var cur = info && info.api ? info.api.account : '';
    ['free', 'pro', 'max', 'dev'].forEach(function (p) {
      if (!t.plans[p]) return;
      var c = el('article', 'pcard' + (p === cur ? ' current' : ''));
      var top = el('div', 'pcard-top');
      top.appendChild(el('h3', '', 'API ' + A.planName(p)));
      if (p === cur) top.appendChild(el('span', 'now', 'باقتك الحالية'));
      c.appendChild(top);
      if (t.plans[p].price && p !== 'free') c.appendChild(el('p', 'pcard-price', t.plans[p].price + ' ' + (cfg.currency || '') + (cfg.period ? ' / ' + cfg.period : '')));
      var ul = el('ul', 'feats');
      t.plans[p].features.forEach(function (f) { ul.appendChild(el('li', '', f)); });
      c.appendChild(ul);
      box.appendChild(c);
    });
  }

  var MSG = {
    rate: 'أنشأت مفاتيح كثيرة في وقت قصير. يرجى المحاولة بعد 15 دقيقة.',
    key_limit: 'وصلت إلى الحد الأقصى لعدد المفاتيح. ألغِ مفتاحًا لا تحتاجه ثم أنشئ مفتاحًا جديدًا.',
    bad_name: 'اسم المفتاح غير صالح. استخدم حروفًا وأرقامًا ومسافات فقط، حتى 40 حرفًا.',
    duplicate: 'تم إرسال الطلب نفسه للتو. انتظر لحظة.',
    unavailable: 'تعذّر تنفيذ الطلب الآن. يرجى المحاولة بعد قليل.'
  };
  function msg(t, ok) {
    $('k-msg').textContent = t || '';
    $('k-msg').classList.toggle('ok', !!ok);
  }

  function renderUsage() {
    var a = info.api || {};
    var used = a.usedDay || 0;
    var cap = a.perDay || 0;
    $('api-plan').textContent = 'API ' + A.planName(a.account || a.plan);
    $('k-min').textContent = String(a.perMinute || '-');
    $('k-day').textContent = used + ' / ' + (cap || '-');
    $('k-bar').style.width = cap ? Math.min(100, Math.round((used / cap) * 100)) + '%' : '0%';
    $('k-bar').className = cap && used >= cap ? 'full' : cap && used / cap >= 0.8 ? 'warn' : '';
    $('k-share').textContent = (a.factor || '-') + '%';
    $('k-count').textContent = (info.keys || []).length + ' من ' + (info.maxKeys || 3);
    $('k-exp').textContent = (a.account || a.plan) === 'free' ? 'دائمة' : a.expiresAt ? 'حتى ' + A.fmtDate(a.expiresAt) : 'دون تاريخ انتهاء';
  }

  function renderMove() {
    var box = $('k-move');
    var ids = info.pending || [];
    if (!ids.length) {
      box.hidden = true;
      return;
    }
    var plan = A.planName(info.api.account);
    $('k-move-text').textContent = 'رقّيت باقة API إلى ' + plan + '. لديك ' + ids.length + (ids.length === 1 ? ' مفتاح يعمل' : ' مفاتيح تعمل') + ' بحدود باقة أقدم. هل تريد نقلها إلى ' + plan + ' لتحصل على حدودها، أم إبقاءها على حدودها الحالية؟ يمكنك الاختيار مرة واحدة لكل ترقية.';
    box.hidden = false;
  }

  function keyCard(k) {
    var card = el('article', 'kcard');
    var head = el('div', 'kcard-head');
    var title = el('b', 'kname', k.name || k.id);
    title.setAttribute('translate', 'no');
    head.appendChild(title);
    var badge = el('span', 'badge' + (k.effective !== k.plan ? ' warn' : ''), 'API ' + A.planName(k.effective));
    badge.setAttribute('translate', 'no');
    head.appendChild(badge);
    card.appendChild(head);
    var code = el('code', 'mono', k.hint);
    code.setAttribute('translate', 'no');
    code.dir = 'ltr';
    card.appendChild(code);
    if (k.effective !== k.plan) card.appendChild(el('p', 'hint warn', 'أُنشئ على باقة ' + A.planName(k.plan) + '، ويعمل الآن بحدود ' + A.planName(k.effective) + ' لأن اشتراك API الحالي أقل أو انتهى.'));
    card.appendChild(el('p', 'hint', 'أُنشئ في ' + A.fmtDate(k.createdAt) + (k.lastUsed ? '، آخر استخدام ' + A.fmtDate(k.lastUsed) : '، لم يُستخدم بعد') + '. الطلبات: ' + (k.uses || 0) + (k.ips ? '. مقيّد بعناوين IP.' : '.')));
    var actions = el('div', 'row-actions');
    var rename = el('button', 'btn ghost small', 'إعادة التسمية');
    rename.type = 'button';
    rename.addEventListener('click', function () {
      var name = window.prompt('الاسم الجديد للمفتاح', k.name || '');
      if (name === null) return;
      name = name.trim();
      if (!name) return;
      rename.disabled = true;
      A.call('/api/dev/rename', session.t, { id: k.id, name: name }).then(function (r) {
        rename.disabled = false;
        if (!r.ok) return msg(MSG[r.error] || MSG.unavailable);
        k.name = r.name;
        renderKeys();
      });
    });
    var revoke = el('button', 'btn ghost small danger', 'إلغاء المفتاح');
    revoke.type = 'button';
    revoke.addEventListener('click', function () {
      if (!window.confirm('سيُلغى المفتاح "' + (k.name || k.id) + '" فورًا، وستتوقف البرامج التي تستخدمه. باقي مفاتيحك تظل تعمل. هل تريد المتابعة؟')) return;
      revoke.disabled = true;
      A.call('/api/dev/revoke', session.t, { id: k.id }).then(function (r) {
        revoke.disabled = false;
        if (!r.ok) return msg(MSG[r.error] || MSG.unavailable);
        info.keys = info.keys.filter(function (x) { return x.id !== k.id; });
        info.pending = (info.pending || []).filter(function (x) { return x !== k.id; });
        renderKeys();
        msg('أُلغي المفتاح.', true);
      });
    });
    actions.appendChild(rename);
    actions.appendChild(revoke);
    card.appendChild(actions);
    var ips = el('details', 'kips');
    ips.appendChild(el('summary', '', 'تقييد المفتاح بعناوين IP (اختياري)'));
    var form = el('form', '');
    form.noValidate = true;
    form.appendChild(el('p', 'hint', 'اكتب عناوين خوادمك مفصولة بفواصل، حتى 10 عناوين. اتركها فارغة للسماح بأي عنوان.'));
    var row = el('div', 'kbox');
    row.dir = 'ltr';
    var input = el('input', '');
    input.type = 'text';
    input.maxLength = 420;
    input.spellcheck = false;
    input.placeholder = '203.0.113.10, 2001:db8::1';
    input.value = String(k.ips || '').split(',').filter(Boolean).join(', ');
    var save = el('button', 'btn small', 'حفظ');
    save.type = 'submit';
    row.appendChild(input);
    row.appendChild(save);
    form.appendChild(row);
    var note = el('p', 'hint');
    form.appendChild(note);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var list = input.value.split(/[\s,]+/).filter(Boolean);
      var bad = list.filter(function (x) {
        return !/^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/.test(x) && !/^(?=.*:.*:)[0-9a-fA-F:]{2,39}$/.test(x);
      });
      if (bad.length || list.length > 10) {
        note.textContent = list.length > 10 ? 'يمكنك إضافة 10 عناوين كحد أقصى.' : 'هذا العنوان غير صحيح: ' + bad[0];
        return;
      }
      save.disabled = true;
      A.call('/api/dev/ips', session.t, { id: k.id, ips: list }).then(function (r) {
        save.disabled = false;
        if (!r.ok) {
          if (r.error === 'invalid_session') return leave();
          note.textContent = r.error === 'invalid_ips' ? 'تحقّق من العناوين، فأحدها غير صحيح.' : MSG.unavailable;
          return;
        }
        k.ips = r.ips || '';
        note.textContent = r.ips ? 'حُفظت العناوين. سيعمل المفتاح من هذه العناوين فقط.' : 'أُزيل التقييد. يعمل المفتاح من أي عنوان.';
      });
    });
    ips.appendChild(form);
    card.appendChild(ips);
    return card;
  }

  function renderKeys() {
    renderUsage();
    renderMove();
    var list = $('k-list');
    list.textContent = '';
    var keys = info.keys || [];
    if (!keys.length) list.appendChild(el('p', 'hint', 'لا توجد مفاتيح في حسابك حتى الآن. أنشئ أول مفتاح من الأسفل.'));
    keys.forEach(function (k) { list.appendChild(keyCard(k)); });
    var full = keys.length >= (info.maxKeys || 3);
    $('k-make').disabled = full;
    $('k-name').disabled = full;
    if (full) $('k-name').placeholder = 'وصلت إلى ' + (info.maxKeys || 3) + ' مفاتيح، وهو الحد الأقصى';
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
      renderKeys();
      renderPlans(r.config);
      show();
    });
  }

  if (session) loadUser();
  else {
    A.guest({ login: LOGIN });
    $('keys-guest').hidden = false;
    A.post('/api/config', {}).then(function (c) {
      renderPlans(c);
      show();
    });
  }

  function transfer(move) {
    var yes = $('k-move-yes');
    var no = $('k-move-no');
    (move ? yes : no).disabled = true;
    A.call('/api/dev/transfer', session.t, { ids: info.pending || [], move: move }).then(function (r) {
      yes.disabled = false;
      no.disabled = false;
      if (!r.ok) return msg(MSG[r.error] || MSG.unavailable);
      loadUser().then(function () {
        msg(move ? 'نُقلت المفاتيح إلى باقة ' + A.planName(r.plan) + '.' : 'أبقينا المفاتيح على حدودها الحالية.', true);
      });
    });
  }
  $('k-move-yes').addEventListener('click', function () { transfer(true); });
  $('k-move-no').addEventListener('click', function () { transfer(false); });

  $('k-make-form').addEventListener('submit', function (e) {
    e.preventDefault();
    if (!info) return;
    var b = $('k-make');
    var name = $('k-name').value.trim();
    b.disabled = true;
    msg('');
    A.call('/api/dev/create', session.t, name ? { name: name } : {}).then(function (r) {
      b.disabled = false;
      if (!r.ok) {
        if (r.error === 'invalid_session') return leave();
        msg(MSG[r.error] || MSG.unavailable);
        return;
      }
      $('k-full').textContent = r.key;
      $('k-fresh').hidden = false;
      $('k-name').value = '';
      info.keys = (info.keys || []).concat([{ id: r.id, name: r.name, hint: r.hint, plan: r.plan, effective: r.plan, createdAt: A.now(), lastUsed: 0, uses: 0, ips: '' }]);
      renderKeys();
      $('k-copy').focus();
    });
  });

  $('k-copy').addEventListener('click', function () {
    copy($('k-full').textContent, function (ok) {
      $('k-copy').textContent = ok ? 'تم النسخ' : 'انسخه يدويًا';
    });
  });

  var out = $('out');
  if (out) out.addEventListener('click', function () {
    A.call('/api/session/end', session.t).then(leave, leave);
  });
})();
