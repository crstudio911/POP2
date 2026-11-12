(function () {
  var A = window.POPAuth;
  var LOGIN = '../../login/log.html';
  var HOME = '../../main/main.html';
  var ORIGIN = window.location.origin;
  var $ = function (id) { return document.getElementById(id); };
  var ERR = {
    bad_url: 'اكتب رابطًا صحيحًا يبدأ بـ https أو http لموقع عام. لا يمكن اختصار روابط موقعنا نفسه أو عناوين داخلية.',
    bad_alias: 'الاسم المختصر يجب أن يكون من 3 إلى 32 حرفًا إنجليزيًا صغيرًا أو رقمًا أو شرطة، ولا يبدأ أو ينتهي بشرطة، وبعض الأسماء محجوزة.',
    alias_taken: 'هذا الاسم المختصر مستخدم بالفعل، اختر اسمًا آخر.',
    bad_password: 'كلمة سر الرابط يجب أن تكون من 4 إلى 64 حرفًا.',
    bad_expiry: 'اختر تاريخ انتهاء بعد دقيقة على الأقل من الآن.',
    limit_custom: 'اختيار الاسم المختصر متاح في باقة Pro وما فوقها.',
    limit_password: 'حماية الرابط بكلمة سر متاحة في باقة Pro وما فوقها.',
    limit_expiry: 'تاريخ الانتهاء متاح في باقة Pro وما فوقها.',
    limit_links: 'وصلت إلى الحد الأقصى لعدد الروابط في باقتك. احذف رابطًا قديمًا لتنشئ رابطًا مكانه، أو رقِّ باقتك.',
    link_blocked: 'أوقفت الإدارة هذا الرابط ولا يمكن تعديله.',
    not_found: 'هذا الرابط غير موجود في حسابك.',
    duplicate: 'تم إرسال الطلب نفسه للتو.',
    busy: 'هناك طلب آخر قيد التنفيذ، انتظر لحظة.',
    rate: 'طلبات كثيرة في وقت قصير، انتظر قليلًا.',
    unavailable: 'تعذّر إتمام الطلب الآن. يرجى المحاولة بعد قليل.',
    network: 'تعذّر الاتصال. يرجى التحقق من الإنترنت.'
  };
  var STATE = { active: ['يعمل', 'on'], paused: ['موقوف مؤقتًا', 'wait'], expired: ['منتهي', 'bad'], blocked: ['أوقفته الإدارة', 'bad'] };
  var DEVICE = { mobile: 'هاتف', tablet: 'جهاز لوحي', desktop: 'كمبيوتر', other: 'غير معروف' };
  var plan = 'free';
  var limits = {};
  var links = [];
  var editing = null;
  var busy = false;
  var names = null;
  try { names = new Intl.DisplayNames(['ar'], { type: 'region' }); } catch (e) {}

  var session = A.read();
  if (!session) { leave(); return; }

  function leave() { A.clear(); window.location.replace(LOGIN); }
  function show() { $('gate').hidden = true; $('top').hidden = false; $('view').hidden = false; }
  function can(k) { return Number(limits[k]) > 0; }
  function say(t, bad) { $('state').textContent = t || ''; $('state').style.color = bad ? 'var(--danger)' : ''; }
  function shortOf(alias) { return ORIGIN + '/' + alias; }
  function country(c) {
    if (!c || c === 'XX') return 'غير معروف';
    try { return (names && names.of(c)) || c; } catch (e) { return c; }
  }
  function when(ms) {
    if (!ms) return '-';
    var lang = (window.POPLang && window.POPLang.current) || 'ar';
    try {
      return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG' : lang, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' }).format(new Date(ms));
    } catch (e) { return new Date(ms).toLocaleString(); }
  }
  function errText(r) {
    var t = ERR[r.error] || ERR.unavailable;
    if (r.error === 'limit_links' && r.cap) t += ' الحد: ' + r.cap + ' رابط.';
    if ((r.error === 'rate' || r.error === 'duplicate' || r.error === 'busy') && r.retry) t += ' (' + r.retry + ' ثانية)';
    return t;
  }

  function renderPlan() {
    $('pb-name').textContent = 'باقة ' + A.planName(plan);
    var items = [];
    items.push(Number(limits.links) > 0 ? 'الروابط: حتى ' + limits.links + ' رابط ثابتة لا تتجدد يوميًا' : 'روابط محفوظة دون حد');
    items.push(can('custom') ? 'اسم مختصر تختاره' : 'اسم عشوائي');
    if (can('password')) items.push('كلمة سر');
    if (can('expiry')) items.push('تاريخ انتهاء');
    items.push(limits.stats === 'full' ? 'تحليلات كاملة' : 'عدد الضغطات فقط');
    $('pb-list').textContent = items.join(' · ');
    $('pb-up').hidden = plan === 'unlimited';
    $('alias').disabled = !can('custom');
    $('alias').placeholder = can('custom') ? 'offer1' : 'يُنشأ تلقائيًا';
    $('lock-alias').hidden = can('custom');
    $('pass').disabled = !can('password');
    $('lock-pass').hidden = can('password');
    $('exp').disabled = !can('expiry');
    $('lock-exp').hidden = can('expiry');
  }

  function load() {
    return A.call('/api/go/list', session.t, {}).then(function (r) {
      if (!r.ok) {
        if (r.error === 'invalid_session') return leave();
        $('empty').textContent = errText(r);
        return;
      }
      plan = r.plan || plan;
      limits = r.limits || limits;
      links = r.links || [];
      renderPlan();
      renderList();
    });
  }

  function tag(text, cls) {
    var s = document.createElement('span');
    s.className = 'sl-tag' + (cls ? ' ' + cls : '');
    s.textContent = text;
    return s;
  }
  function button(label, act, alias, cls) {
    var b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.dataset.act = act;
    b.dataset.alias = alias;
    if (cls) b.className = cls;
    return b;
  }

  function renderList() {
    var q = $('find').value.trim().toLowerCase();
    var box = $('list');
    box.textContent = '';
    var shown = links.filter(function (l) { return !q || (l.alias + ' ' + l.url).toLowerCase().indexOf(q) >= 0; });
    shown.forEach(function (l) {
      var it = document.createElement('div');
      it.className = 'sl-item' + (l.state === 'active' ? '' : ' off');
      var main = document.createElement('div');
      main.className = 'sl-main';
      var top = document.createElement('div');
      top.className = 'sl-short';
      var a = document.createElement('a');
      a.href = shortOf(l.alias);
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.dir = 'ltr';
      a.setAttribute('translate', 'no');
      a.textContent = shortOf(l.alias).replace(/^https?:\/\//, '');
      top.appendChild(a);
      var st = STATE[l.state] || STATE.active;
      top.appendChild(tag(st[0], st[1]));
      if (l.locked) top.appendChild(tag('بكلمة سر'));
      main.appendChild(top);
      var dest = document.createElement('div');
      dest.className = 'sl-dest';
      dest.title = l.url;
      dest.setAttribute('translate', 'no');
      dest.textContent = l.url;
      main.appendChild(dest);
      var meta = document.createElement('div');
      meta.className = 'sl-meta';
      var c = document.createElement('span');
      c.appendChild(document.createTextNode('الضغطات: '));
      var cb = document.createElement('b');
      cb.textContent = String(l.clicks || 0);
      c.appendChild(cb);
      meta.appendChild(c);
      var made = document.createElement('span');
      made.textContent = 'أُنشئ: ' + A.fmtDate(l.createdAt);
      meta.appendChild(made);
      if (l.expiresAt) {
        var ex = document.createElement('span');
        ex.textContent = (l.state === 'expired' ? 'انتهى: ' : 'ينتهي: ') + when(l.expiresAt);
        meta.appendChild(ex);
      }
      main.appendChild(meta);
      it.appendChild(main);
      var tools = document.createElement('div');
      tools.className = 'sl-tools';
      tools.appendChild(button('نسخ', 'copy', l.alias));
      tools.appendChild(button('الإحصائيات', 'stats', l.alias));
      if (l.state !== 'blocked') {
        tools.appendChild(button('تعديل', 'edit', l.alias));
        if (l.state === 'active') tools.appendChild(button('إيقاف', 'pause', l.alias));
        if (l.state === 'paused') tools.appendChild(button('تشغيل', 'resume', l.alias));
      }
      tools.appendChild(button('حذف', 'delete', l.alias, 'danger'));
      it.appendChild(tools);
      box.appendChild(it);
    });
    var cap = Number(limits.links) || 0;
    $('used').textContent = cap ? links.length + ' / ' + cap : String(links.length);
    $('empty').hidden = shown.length > 0;
    $('empty').textContent = links.length ? 'لا توجد روابط مطابقة لبحثك.' : 'لم تنشئ أي رابط مختصر بعد.';
  }

  function expiryValue() {
    var v = $('exp').value;
    if (v === 'keep') return undefined;
    if (v === '0') return 0;
    if (v === 'custom') {
      var t = new Date($('exp-at').value).getTime();
      return isFinite(t) ? Math.round(A.now() + (t - Date.now())) : NaN;
    }
    return Math.round(A.now() + Number(v));
  }

  function resetForm() {
    editing = null;
    $('form').reset();
    $('alias').readOnly = false;
    $('exp-at').hidden = true;
    $('exp').querySelector('[value="keep"]').hidden = true;
    $('exp').value = '0';
    $('clear-pass-row').hidden = true;
    $('cancel-edit').hidden = true;
    $('t-make').textContent = 'أنشئ رابطًا مختصرًا';
    $('go').textContent = 'اختصر الرابط';
    $('pass').placeholder = '4 أحرف على الأقل';
    renderPlan();
  }

  function startEdit(l) {
    editing = l;
    $('done').hidden = true;
    $('url').value = l.url;
    $('alias').value = l.alias;
    $('alias').disabled = false;
    $('alias').readOnly = true;
    $('pass').value = '';
    $('pass').placeholder = l.locked ? 'اتركها فارغة للإبقاء على الحالية' : '4 أحرف على الأقل';
    $('clear-pass-row').hidden = !l.locked;
    $('clear-pass').checked = false;
    var keep = $('exp').querySelector('[value="keep"]');
    keep.hidden = false;
    $('exp').value = 'keep';
    $('exp-at').hidden = true;
    $('cancel-edit').hidden = false;
    $('t-make').textContent = 'تعديل الرابط /' + l.alias;
    $('go').textContent = 'حفظ التعديل';
    say('');
    $('url').focus();
    $('url').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function submit(ev) {
    ev.preventDefault();
    if (busy) return;
    var url = $('url').value.trim();
    if (!url) { say('الصق الرابط الطويل أولًا.', true); return; }
    var body = { url: url };
    var exp = expiryValue();
    if (exp !== undefined && isNaN(exp)) { say(ERR.bad_expiry, true); return; }
    var pass = $('pass').value;
    if (pass && (pass.length < 4 || pass.length > 64)) { say(ERR.bad_password, true); return; }
    if (pass) body.password = pass;
    var path = '/api/go/create';
    if (editing) {
      path = '/api/go/edit';
      body.alias = editing.alias;
      if (exp === 0) body.clearExpiry = true;
      else if (exp) body.expiresAt = exp;
      if (!pass && $('clear-pass').checked) body.clearPass = true;
    } else {
      var alias = $('alias').value.trim().toLowerCase();
      if (alias) body.alias = alias;
      if (exp) body.expiresAt = exp;
    }
    busy = true;
    $('go').disabled = true;
    $('done').hidden = true;
    say(editing ? 'جارٍ الحفظ...' : 'جارٍ إنشاء الرابط...');
    A.call(path, session.t, body).then(function (r) {
      busy = false;
      $('go').disabled = false;
      if (!r.ok) {
        if (r.error === 'invalid_session') return leave();
        say(errText(r), true);
        return;
      }
      var wasEdit = !!editing;
      resetForm();
      if (wasEdit) say('تم حفظ التعديل.');
      else {
        say('');
        $('done').hidden = false;
        $('done-link').href = shortOf(r.link.alias);
        $('done-link').textContent = shortOf(r.link.alias);
      }
      load();
    });
  }

  function copy(text, okMsg) {
    var done = function () { say(okMsg || 'تم النسخ.'); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () { say('تعذّر النسخ، انسخ الرابط يدويًا: ' + text, true); });
    else say('انسخ الرابط يدويًا: ' + text);
  }

  function bars(id, map, label) {
    var box = $(id);
    box.textContent = '';
    var keys = Object.keys(map || {}).sort(function (a, b) { return map[b] - map[a]; }).slice(0, 12);
    var max = keys.reduce(function (m, k) { return Math.max(m, map[k]); }, 0) || 1;
    if (!keys.length) {
      var p = document.createElement('p');
      p.className = 'hint';
      p.textContent = 'لا توجد ضغطات مسجّلة بعد.';
      box.appendChild(p);
      return;
    }
    keys.forEach(function (k) {
      var row = document.createElement('div');
      row.className = 'sl-bar';
      var n = document.createElement('span');
      n.textContent = label(k);
      var track = document.createElement('i');
      var fill = document.createElement('s');
      fill.style.width = Math.max(3, Math.round((map[k] / max) * 100)) + '%';
      track.appendChild(fill);
      var v = document.createElement('b');
      v.textContent = String(map[k]);
      row.appendChild(n);
      row.appendChild(track);
      row.appendChild(v);
      box.appendChild(row);
    });
  }

  function openStats(alias) {
    $('stats').hidden = false;
    $('st-link').textContent = shortOf(alias);
    $('st-total').textContent = '...';
    $('st-full').hidden = true;
    $('st-basic').hidden = true;
    $('stats').scrollIntoView({ behavior: 'smooth', block: 'start' });
    A.call('/api/go/stats', session.t, { alias: alias }).then(function (r) {
      if (!r.ok) {
        if (r.error === 'invalid_session') return leave();
        $('st-total').textContent = '-';
        say(errText(r), true);
        return;
      }
      $('st-total').textContent = String(r.link.clicks || 0);
      $('st-last').textContent = when(r.link.lastClick);
      $('st-made').textContent = A.fmtDate(r.link.createdAt);
      if (!r.full) { $('st-basic').hidden = false; return; }
      $('st-full').hidden = false;
      bars('st-countries', r.countries, country);
      bars('st-devices', r.devices, function (k) { return DEVICE[k] || k; });
      var days = $('st-days');
      days.textContent = '';
      var keys = Object.keys(r.days || {}).sort();
      var max = keys.reduce(function (m, k) { return Math.max(m, r.days[k]); }, 0) || 1;
      keys.forEach(function (k) {
        var s = document.createElement('span');
        var n = r.days[k];
        s.style.height = Math.max(2, Math.round((n / max) * 100)) + '%';
        if (!n) s.className = 'zero';
        s.title = k + ': ' + n;
        days.appendChild(s);
      });
      var tb = $('st-recent');
      tb.textContent = '';
      (r.recent || []).forEach(function (x) {
        var tr = document.createElement('tr');
        [when(x[0]), country(x[1]), DEVICE[x[2]] || x[2]].forEach(function (v) {
          var td = document.createElement('td');
          td.textContent = v;
          tr.appendChild(td);
        });
        tb.appendChild(tr);
      });
      if (!(r.recent || []).length) {
        var tr = document.createElement('tr');
        var td = document.createElement('td');
        td.colSpan = 3;
        td.textContent = 'لا توجد ضغطات مسجّلة بعد.';
        tr.appendChild(td);
        tb.appendChild(tr);
      }
      $('st-keep').textContent = 'تُحفظ تفاصيل كل ضغطة ' + (r.keepDays || 90) + ' يومًا ثم تُحذف تلقائيًا، ويبقى العدد الكلي. المسجّل بالتفصيل: ' + (r.tracked || 0) + ' ضغطة.';
    });
  }

  function act(ev) {
    var b = ev.target.closest('button[data-act]');
    if (!b) return;
    var alias = b.dataset.alias;
    var l = links.filter(function (x) { return x.alias === alias; })[0];
    if (!l) return;
    var a = b.dataset.act;
    if (a === 'copy') return copy(shortOf(alias), 'نُسخ الرابط ' + shortOf(alias));
    if (a === 'stats') return openStats(alias);
    if (a === 'edit') return startEdit(l);
    if (a === 'delete' && !window.confirm('حذف الرابط /' + alias + ' نهائيًا مع إحصائياته؟ لن يفتح بعد الآن لأي أحد.')) return;
    b.disabled = true;
    var path = a === 'delete' ? '/api/go/delete' : '/api/go/edit';
    var body = { alias: alias };
    if (a === 'pause') body.status = 'paused';
    if (a === 'resume') body.status = 'active';
    A.call(path, session.t, body).then(function (r) {
      b.disabled = false;
      if (!r.ok) {
        if (r.error === 'invalid_session') return leave();
        say(errText(r), true);
        return;
      }
      if (a === 'delete') {
        if (editing && editing.alias === alias) resetForm();
        if ($('st-link').textContent === shortOf(alias)) $('stats').hidden = true;
        say('تم حذف الرابط.');
      } else say(a === 'pause' ? 'تم إيقاف الرابط مؤقتًا.' : 'عاد الرابط للعمل.');
      load();
    });
  }

  $('base').textContent = ORIGIN.replace(/^https?:\/\//, '') + '/';
  $('ex-link').textContent = ORIGIN.replace(/^https?:\/\//, '') + '/offer1';
  $('exp').addEventListener('change', function () { $('exp-at').hidden = $('exp').value !== 'custom'; });
  $('alias').addEventListener('input', function () {
    if ($('alias').readOnly) return;
    var v = $('alias').value.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 32);
    if (v !== $('alias').value) $('alias').value = v;
  });
  $('form').addEventListener('submit', submit);
  $('cancel-edit').addEventListener('click', function () { resetForm(); say(''); });
  $('done-copy').addEventListener('click', function () { copy($('done-link').textContent); });
  $('list').addEventListener('click', act);
  $('find').addEventListener('input', renderList);
  $('stats-close').addEventListener('click', function () { $('stats').hidden = true; });
  $('out').addEventListener('click', function () { A.call('/api/session/end', session.t).then(leave, leave); });

  A.access('short', { login: LOGIN, home: HOME }, function (r) {
    plan = r.plan || 'free';
    limits = r.limits || {};
    renderPlan();
    resetForm();
    show();
    load();
  });
})();
