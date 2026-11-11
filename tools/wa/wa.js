(function () {
  var A = window.POPAuth;
  var LOGIN = '../../login/log.html';
  var DRAFT_KEY = 'pop_wa_d';
  var JOB_KEY = 'pop_wa_j';
  var MAX_VARS = 6;
  var MAX_MSG = 4096;
  var MAX_VALUE = 300;
  var NAME_RE = /^[\p{L}\p{N}_ ]{1,20}$/u;
  var TOKEN_RE = /\{\{([^{}]{1,40})\}\}/g;
  var SPEED_AVG = { safe: 11.5, normal: 6 };
  var STATUS_TEXT = { s: 'اتبعتت', n: 'مش على واتساب', f: 'فشلت' };
  var TRASH = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>';

  var $ = function (id) {
    return document.getElementById(id);
  };

  var session = A.read();
  if (!session) {
    leave();
    return;
  }

  var draft = loadDraft();
  var parsed = { rows: [], invalid: 0, dupes: 0 };
  var perSend = 500;
  var ticket = null;
  var ticketExp = 0;
  var wa = { state: 'idle', expiresAt: 0, phone: null, job: null };
  var jobMeta = loadJob();
  var results = [];
  var pollTimer = null;
  var pollBusy = false;
  var wakeTries = 0;
  var previewAt = 0;
  var lastCaret = null;

  function leave() {
    A.clear();
    window.location.replace(LOGIN);
  }

  function loadDraft() {
    var d = null;
    try {
      d = JSON.parse(window.localStorage.getItem(DRAFT_KEY) || 'null');
    } catch (e) {}
    d = d && typeof d === 'object' ? d : {};
    return {
      vars: Array.isArray(d.vars)
        ? d.vars.slice(0, MAX_VARS).map(function (v) {
            return { n: String((v && v.n) || '').slice(0, 20), d: String((v && v.d) || '').slice(0, MAX_VALUE) };
          })
        : [],
      msg: typeof d.msg === 'string' ? d.msg.slice(0, MAX_MSG) : '',
      nums: typeof d.nums === 'string' ? d.nums.slice(0, 200000) : '',
      cc: typeof d.cc === 'string' && /^\d{0,4}$/.test(d.cc) ? d.cc : '20',
      speed: d.speed === 'normal' ? 'normal' : 'safe'
    };
  }

  var saveTimer = null;
  function saveDraft() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try {
        window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      } catch (e) {}
    }, 300);
  }

  function loadJob() {
    try {
      var j = JSON.parse(window.localStorage.getItem(JOB_KEY) || 'null');
      return j && typeof j.id === 'string' && Array.isArray(j.phones) ? j : null;
    } catch (e) {
      return null;
    }
  }

  function saveJob() {
    try {
      if (jobMeta) window.localStorage.setItem(JOB_KEY, JSON.stringify(jobMeta));
      else window.localStorage.removeItem(JOB_KEY);
    } catch (e) {}
  }

  function getTicket(force) {
    if (!force && ticket && ticketExp - Date.now() > 60000) return Promise.resolve(ticket);
    return A.call('/api/wa/ticket', session.t, {}).then(function (r) {
      if (!r.ok) {
        if (r.error === 'invalid_session') leave();
        throw r;
      }
      ticket = r.ticket;
      ticketExp = Number(r.expires) || 0;
      if (Number(r.perSend) > 0) perSend = Number(r.perSend);
      return ticket;
    });
  }

  function waCall(path, body, retried) {
    return getTicket(false)
      .then(function (t) {
        return A.post(path, body || {}, { 'X-WA-Ticket': t });
      })
      .then(function (r) {
        if (!r.ok && r.error === 'invalid_ticket' && !retried) {
          ticket = null;
          return waCall(path, body, true);
        }
        return r;
      })
      .catch(function (r) {
        return r && typeof r === 'object' ? r : { ok: false, error: 'network' };
      });
  }

  function cleanDigits(s) {
    return String(s)
      .replace(/[\u0660-\u0669]/g, function (c) {
        return String(c.charCodeAt(0) - 0x0660);
      })
      .replace(/[\u06F0-\u06F9]/g, function (c) {
        return String(c.charCodeAt(0) - 0x06f0);
      });
  }

  function normalizePhone(raw, cc) {
    var s = cleanDigits(raw).trim();
    var plus = /^\s*\+/.test(s);
    var d = s.replace(/\D/g, '');
    if (!d) return '';
    if (plus) return d;
    if (d.indexOf('00') === 0) return d.slice(2);
    if (cc && d.charAt(0) === '0') return cc + d.slice(1);
    if (cc && d.length <= 10 && d.indexOf(cc) !== 0) return cc + d;
    return d;
  }

  function splitLine(line) {
    return line.split(/[,\t;\u060C]/).map(function (c) {
      return c.trim().replace(/^"(.*)"$/, '$1').trim();
    });
  }

  function parseNumbers() {
    var cc = draft.cc;
    var n = draft.vars.length;
    var seen = {};
    var rows = [];
    var invalid = 0;
    var dupes = 0;
    var lines = draft.nums.split(/\r?\n/);
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;
      var cells = splitLine(line);
      if (!/\d/.test(cleanDigits(cells[0]))) {
        if (rows.length === 0 && invalid === 0) continue;
        invalid++;
        continue;
      }
      var p = normalizePhone(cells[0], cc);
      if (!/^\d{8,15}$/.test(p)) {
        invalid++;
        continue;
      }
      if (seen[p]) {
        dupes++;
        continue;
      }
      seen[p] = true;
      var v = [];
      for (var k = 0; k < n; k++) v.push(String(cells[k + 1] || '').slice(0, MAX_VALUE));
      rows.push({ p: p, v: v });
    }
    parsed = { rows: rows, invalid: invalid, dupes: dupes };
  }

  function varIndex(name) {
    for (var i = 0; i < draft.vars.length; i++) if (draft.vars[i].n.trim() === name.trim()) return i;
    return -1;
  }

  function valueFor(row, i) {
    var own = row && row.v[i];
    if (own) return own;
    return draft.vars[i] ? draft.vars[i].d : '';
  }

  function unknownTokens() {
    var out = [];
    draft.msg.replace(TOKEN_RE, function (m, name) {
      if (varIndex(name) < 0 && out.indexOf(name) < 0) out.push(name);
      return m;
    });
    return out;
  }

  function missingCount() {
    var used = [];
    draft.msg.replace(TOKEN_RE, function (m, name) {
      var i = varIndex(name);
      if (i >= 0 && used.indexOf(i) < 0) used.push(i);
      return m;
    });
    if (!used.length) return 0;
    var c = 0;
    parsed.rows.forEach(function (r) {
      if (
        used.some(function (i) {
          return !valueFor(r, i);
        })
      )
        c++;
    });
    return c;
  }

  function templateForSend() {
    return draft.msg.replace(TOKEN_RE, function (m, name) {
      var i = varIndex(name);
      return i >= 0 ? '{{' + (i + 1) + '}}' : m;
    });
  }

  function renderVars() {
    var box = $('vars');
    box.textContent = '';
    draft.vars.forEach(function (v, i) {
      var row = document.createElement('div');
      row.className = 'var';
      var num = document.createElement('span');
      num.className = 'num';
      num.textContent = String(i + 1);
      var name = document.createElement('input');
      name.type = 'text';
      name.maxLength = 20;
      name.placeholder = 'اسم المتغير، مثلا: الاسم';
      name.value = v.n;
      name.setAttribute('aria-label', 'اسم المتغير ' + (i + 1));
      var def = document.createElement('input');
      def.type = 'text';
      def.maxLength = MAX_VALUE;
      def.placeholder = 'القيمة اللي تتكتب للكل (اختياري)';
      def.value = v.d;
      def.setAttribute('aria-label', 'القيمة العامة للمتغير ' + (i + 1));
      var del = document.createElement('button');
      del.type = 'button';
      del.className = 'icon-btn del';
      del.innerHTML = TRASH;
      del.setAttribute('aria-label', 'حذف المتغير');
      var before = v.n;
      name.addEventListener('focus', function () {
        before = draft.vars[i].n;
      });
      name.addEventListener('input', function () {
        var clean = name.value.replace(/[{}]/g, '');
        if (clean !== name.value) name.value = clean;
        draft.vars[i].n = clean;
        name.classList.toggle('bad', !nameOk(i));
        refresh(false);
      });
      name.addEventListener('change', function () {
        var now = draft.vars[i].n.trim();
        draft.vars[i].n = now;
        name.value = now;
        if (before.trim() && now && before.trim() !== now && nameOk(i)) {
          draft.msg = draft.msg.split('{{' + before.trim() + '}}').join('{{' + now + '}}');
          $('msg').value = draft.msg;
        }
        before = now;
        refresh(false);
      });
      def.addEventListener('input', function () {
        draft.vars[i].d = def.value;
        refresh(false);
      });
      del.addEventListener('click', function () {
        var gone = draft.vars[i].n.trim();
        draft.vars.splice(i, 1);
        if (gone) {
          draft.msg = draft.msg.split('{{' + gone + '}}').join('');
          $('msg').value = draft.msg;
        }
        renderVars();
        refresh(true);
      });
      if (!nameOk(i)) name.classList.add('bad');
      row.appendChild(num);
      row.appendChild(name);
      row.appendChild(def);
      row.appendChild(del);
      box.appendChild(row);
    });
    $('vars-count').textContent = draft.vars.length + ' / ' + MAX_VARS;
    $('add-var').disabled = draft.vars.length >= MAX_VARS;
  }

  function nameOk(i) {
    var n = draft.vars[i].n.trim();
    if (!n) return true;
    if (!NAME_RE.test(n)) return false;
    for (var k = 0; k < draft.vars.length; k++) if (k !== i && draft.vars[k].n.trim() === n) return false;
    return true;
  }

  function allNamesOk() {
    for (var i = 0; i < draft.vars.length; i++) if (!draft.vars[i].n.trim() || !nameOk(i)) return false;
    return true;
  }

  function renderMenu() {
    var menu = $('menu');
    menu.textContent = '';
    var any = false;
    draft.vars.forEach(function (v, i) {
      var n = v.n.trim();
      if (!n || !nameOk(i)) return;
      any = true;
      var b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('role', 'menuitem');
      b.textContent = n;
      b.addEventListener('click', function () {
        insertToken(n);
        closeMenu();
      });
      menu.appendChild(b);
    });
    if (!any) {
      var e = document.createElement('div');
      e.className = 'empty';
      e.textContent = 'ضيف متغير وسميه الأول من الخطوة 2.';
      menu.appendChild(e);
    }
  }

  function openMenu() {
    renderMenu();
    $('menu').hidden = false;
    $('insert').setAttribute('aria-expanded', 'true');
    var first = $('menu').querySelector('button');
    if (first) first.focus();
  }

  function closeMenu() {
    $('menu').hidden = true;
    $('insert').setAttribute('aria-expanded', 'false');
  }

  function insertToken(name) {
    var ta = $('msg');
    var token = '{{' + name + '}}';
    var start = lastCaret ? lastCaret[0] : ta.value.length;
    var end = lastCaret ? lastCaret[1] : ta.value.length;
    if (ta.value.length - (end - start) + token.length > MAX_MSG) return;
    ta.value = ta.value.slice(0, start) + token + ta.value.slice(end);
    var pos = start + token.length;
    ta.focus();
    ta.setSelectionRange(pos, pos);
    lastCaret = [pos, pos];
    draft.msg = ta.value;
    refresh(false);
  }

  function renderNumbers() {
    var stats = $('nums-stats');
    stats.textContent = '';
    function chip(text, cls) {
      var s = document.createElement('span');
      if (cls) s.className = cls;
      s.textContent = text;
      stats.appendChild(s);
    }
    chip(parsed.rows.length + ' رقم صحيح');
    if (parsed.dupes) chip(parsed.dupes + ' مكرر اتشال', 'warn');
    if (parsed.invalid) chip(parsed.invalid + ' رقم غلط', 'bad');
    if (parsed.rows.length > perSend) chip('الحد في المرة الواحدة ' + perSend + ' رقم', 'bad');
    $('nums-count').textContent = String(parsed.rows.length);

    var wrap = $('table-wrap');
    var table = $('table');
    table.textContent = '';
    if (!parsed.rows.length) {
      wrap.hidden = true;
      return;
    }
    wrap.hidden = false;
    var head = document.createElement('tr');
    ['#', 'الرقم'].concat(
      draft.vars.map(function (v, i) {
        return v.n.trim() || 'متغير ' + (i + 1);
      })
    ).forEach(function (t) {
      var th = document.createElement('th');
      th.textContent = t;
      head.appendChild(th);
    });
    var thead = document.createElement('thead');
    thead.appendChild(head);
    table.appendChild(thead);
    var body = document.createElement('tbody');
    parsed.rows.slice(0, 100).forEach(function (r, idx) {
      var tr = document.createElement('tr');
      var a = document.createElement('td');
      a.textContent = String(idx + 1);
      tr.appendChild(a);
      var b = document.createElement('td');
      b.className = 'ph';
      b.textContent = '+' + r.p;
      tr.appendChild(b);
      draft.vars.forEach(function (v, i) {
        var td = document.createElement('td');
        var val = valueFor(r, i);
        td.textContent = val || 'فاضي';
        if (!r.v[i]) td.className = 'empty';
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });
    table.appendChild(body);
  }

  function renderPreview() {
    var bubble = $('bubble');
    var rows = parsed.rows;
    if (previewAt >= rows.length) previewAt = Math.max(0, rows.length - 1);
    $('prev-to').textContent = rows.length ? '+' + rows[previewAt].p + '  (' + (previewAt + 1) + ' / ' + rows.length + ')' : '-';
    $('prev-back').disabled = previewAt <= 0;
    $('prev-next').disabled = previewAt >= rows.length - 1;
    bubble.textContent = '';
    if (!draft.msg.trim()) {
      bubble.textContent = 'اكتب رسالة وحط أرقام عشان تشوف المعاينة.';
      return;
    }
    var row = rows[previewAt] || null;
    var last = 0;
    draft.msg.replace(TOKEN_RE, function (m, name, at) {
      bubble.appendChild(document.createTextNode(draft.msg.slice(last, at)));
      var i = varIndex(name);
      var val = i >= 0 ? valueFor(row, i) : '';
      if (i >= 0 && val) bubble.appendChild(document.createTextNode(val));
      else {
        var mark = document.createElement('mark');
        mark.textContent = i >= 0 ? name + ': فاضي' : m;
        bubble.appendChild(mark);
      }
      last = at + m.length;
      return m;
    });
    bubble.appendChild(document.createTextNode(draft.msg.slice(last)));
  }

  function renderMsgInfo() {
    $('msg-count').textContent = draft.msg.length + ' / ' + MAX_MSG;
    var warn = [];
    var unknown = unknownTokens();
    if (unknown.length) warn.push('في الرسالة متغير مش متعرف: ' + unknown.join('، '));
    var miss = missingCount();
    if (miss) warn.push(miss + ' رقم ناقصهم قيمة متغير، والمكان ده هيفضل فاضي في رسايلهم.');
    $('msg-warn').hidden = !warn.length;
    $('msg-warn').textContent = warn.join(' ');
  }

  function jobRunning() {
    return !!(wa.job && wa.job.running);
  }

  function renderSend() {
    var reason = '';
    if (wa.state !== 'open') reason = 'اربط رقم الواتساب الأول.';
    else if (jobRunning()) reason = 'في إرسال شغال دلوقتي.';
    else if (!draft.msg.trim()) reason = 'اكتب الرسالة.';
    else if (!allNamesOk()) reason = 'كل متغير لازم يبقى ليه اسم مختلف، من غير رموز.';
    else if (unknownTokens().length) reason = 'صلّح المتغيرات اللي مش متعرفة في الرسالة.';
    else if (!parsed.rows.length) reason = 'حط رقم واحد على الأقل.';
    else if (parsed.rows.length > perSend) reason = 'الحد في المرة الواحدة ' + perSend + ' رقم.';
    $('send').disabled = !!reason;
    if (reason) {
      $('send-hint').textContent = reason;
    } else {
      $('send-hint').textContent = 'الوقت المتوقع: حوالي ' + formatDuration(parsed.rows.length * SPEED_AVG[draft.speed]) + '. خلي الصفحة مفتوحة لحد ما الإرسال يخلص.';
    }
    if (reason) $('confirm').hidden = true;
  }

  function formatDuration(sec) {
    sec = Math.max(1, Math.round(sec));
    if (sec < 60) return sec + ' ثانية';
    var m = Math.round(sec / 60);
    if (m < 60) return m + ' دقيقة';
    var h = Math.floor(m / 60);
    var r = m % 60;
    return h + ' ساعة' + (r ? ' و' + r + ' دقيقة' : '');
  }

  function refresh() {
    parseNumbers();
    renderNumbers();
    renderMsgInfo();
    renderPreview();
    renderSend();
    saveDraft();
  }

  function show(id) {
    ['link-idle', 'link-wait', 'link-qr', 'link-open'].forEach(function (k) {
      $(k).hidden = k !== id;
    });
  }

  function setError(text) {
    $('link-error').hidden = !text;
    $('link-error').textContent = text || '';
  }

  var ERR_TEXT = {
    qr_timeout: 'الكود خلص وقته من غير ما يتمسح. دوس ربط تاني عشان كود جديد.',
    expired: 'عدّت ساعة من آخر استخدام واتمسحت بيانات الربط. اربط الرقم تاني لو محتاج.',
    logged_out: 'الرقم اتفصل من الموبايل. اربطه تاني لو محتاج.',
    failed: 'معرفناش نتصل بواتساب. جرب تربط تاني.',
    busy: 'السيرفر مشغول دلوقتي. جرب كمان دقيقة.',
    unavailable: 'الخدمة مش متاحة دلوقتي. جرب كمان شوية.',
    network: 'في مشكلة في الإنترنت. اتأكد من الاتصال وجرب تاني.',
    not_open: 'الرقم مش متصل دلوقتي.',
    job_running: 'في إرسال شغال بالفعل.',
    invalid_request: 'في بيانات مش مظبوطة في الإرسال. راجع الرسالة والأرقام.'
  };

  function renderLink() {
    var pill = $('pill');
    pill.className = 'pill';
    if (wa.state === 'open') {
      show('link-open');
      pill.textContent = 'متصل';
      pill.classList.add('on');
      $('phone').textContent = wa.phone ? '+' + wa.phone : '';
    } else if (wa.state === 'qr' && wa.qr) {
      show('link-qr');
      pill.textContent = 'مستني المسح';
      pill.classList.add('wait');
      $('qr').src = wa.qr;
    } else if (wa.state === 'connecting' || wa.state === 'waking' || wa.state === 'qr') {
      show('link-wait');
      pill.textContent = 'جاري الاتصال';
      pill.classList.add('wait');
      $('wait-text').textContent =
        wa.state === 'waking' ? 'السيرفر بيصحى دلوقتي، ده ممكن ياخد لحد دقيقة. خليك معانا...' : 'جاري الاتصال بواتساب...';
    } else {
      show('link-idle');
      pill.textContent = 'غير متصل';
    }
    tickTimer();
  }

  function tickTimer() {
    $('left').hidden = wa.state !== 'open';
  }

  function applyStatus(r) {
    wa.state = r.state || 'idle';
    wa.qr = r.qr || null;
    wa.phone = r.phone || null;
    wa.expiresAt = Number(r.expiresAt) || 0;
    if (r.error && ERR_TEXT[r.error]) setError(ERR_TEXT[r.error]);
    else if (wa.state === 'open' || wa.state === 'qr') setError('');
    applyJob(r.job);
    renderLink();
    renderSend();
  }

  function applyJob(j) {
    wa.job = j || null;
    if (!j) return;
    if (jobMeta && !jobMeta.id && j.running) {
      jobMeta.id = j.id;
      saveJob();
    }
    if (jobMeta && jobMeta.id === j.id) {
      (j.results || []).forEach(function (x) {
        if (Array.isArray(x) && x[0] === results.length) results.push(x[1]);
      });
    }
    renderJob();
  }

  function renderJob() {
    var j = wa.job;
    var box = $('job');
    if (!j || !jobMeta || jobMeta.id !== j.id) {
      box.hidden = !results.length;
      return;
    }
    box.hidden = false;
    $('bar').style.width = (j.total ? Math.round((j.done / j.total) * 100) : 0) + '%';
    $('j-done').textContent = String(j.done);
    $('j-total').textContent = String(j.total);
    $('j-sent').textContent = String(j.sent);
    $('j-invalid').textContent = String(j.invalid);
    $('j-failed').textContent = String(j.failed);
    $('stop').hidden = !j.running;
    $('report').disabled = !results.length;
    var st = '';
    if (j.running && j.stopped) st = 'جاري الإيقاف...';
    else if (j.running) st = 'الإرسال شغال. خلي الصفحة مفتوحة، والتقرير بيتحفظ على جهازك بس.';
    else if (j.stopped) st = 'الإرسال وقف قبل ما يخلص. الأرقام اللي ماتبعتلهاش مش هتظهر في التقرير.';
    else st = 'الإرسال خلص.';
    $('j-state').textContent = st;
    var table = $('results');
    var have = table.querySelectorAll('tbody tr').length;
    if (!table.querySelector('thead')) {
      var thead = document.createElement('thead');
      var tr = document.createElement('tr');
      ['#', 'الرقم', 'الحالة'].forEach(function (t) {
        var th = document.createElement('th');
        th.textContent = t;
        tr.appendChild(th);
      });
      thead.appendChild(tr);
      table.appendChild(thead);
      table.appendChild(document.createElement('tbody'));
    }
    var body = table.querySelector('tbody');
    for (var i = have; i < results.length; i++) {
      var row = document.createElement('tr');
      var a = document.createElement('td');
      a.textContent = String(i + 1);
      var b = document.createElement('td');
      b.className = 'ph';
      b.textContent = '+' + (jobMeta.phones[i] || '');
      var c = document.createElement('td');
      c.textContent = STATUS_TEXT[results[i]] || '';
      c.className = results[i] === 's' ? 's-ok' : results[i] === 'n' ? 's-no' : 's-bad';
      row.appendChild(a);
      row.appendChild(b);
      row.appendChild(c);
      body.appendChild(row);
    }
  }

  function schedulePoll() {
    clearTimeout(pollTimer);
    var fast = wa.state === 'qr' || wa.state === 'connecting' || jobRunning();
    if (wa.state === 'idle' && !jobRunning()) return;
    pollTimer = setTimeout(poll, fast ? 3000 : 20000);
  }

  function poll() {
    if (pollBusy) return;
    pollBusy = true;
    var from = wa.job && jobMeta && wa.job.id === jobMeta.id ? results.length : 0;
    waCall('/api/wa/status', { from: from }).then(function (r) {
      pollBusy = false;
      if (r.ok) {
        wakeTries = 0;
        var wasActive = wa.state === 'open' || wa.state === 'connecting';
        applyStatus(r);
        if (wasActive && r.state === 'idle' && !r.error) {
          connect('resume');
          return;
        }
      } else if (r.error === 'waking' && wakeTries < 6) {
        wakeTries++;
        wa.state = wa.state === 'open' ? 'open' : 'waking';
        renderLink();
      } else if (r.error && ERR_TEXT[r.error]) {
        setError(ERR_TEXT[r.error]);
      }
      schedulePoll();
    });
  }

  function connect(mode) {
    setError('');
    if (mode === 'new') {
      wa.state = 'connecting';
      renderLink();
    }
    return waCall('/api/wa/connect', { mode: mode }).then(function (r) {
      if (r.ok) {
        wakeTries = 0;
        applyStatus(r);
        if (mode === 'resume' && jobMeta) poll();
        schedulePoll();
        return;
      }
      if (r.error === 'waking' && wakeTries < 6) {
        wakeTries++;
        wa.state = 'waking';
        renderLink();
        setTimeout(function () {
          connect(mode);
        }, 4000);
        return;
      }
      wa.state = 'idle';
      renderLink();
      setError(ERR_TEXT[r.error] || ERR_TEXT.unavailable);
    });
  }

  function logout() {
    $('logout').disabled = true;
    waCall('/api/wa/logout', {}).then(function (r) {
      $('logout').disabled = false;
      if (r.ok) {
        applyStatus(r);
        setError('');
      } else setError(ERR_TEXT[r.error] || ERR_TEXT.unavailable);
    });
  }

  function askSend() {
    if ($('send').disabled) return;
    var n = parsed.rows.length;
    $('confirm-text').textContent =
      'هتتبعت الرسالة لـ ' + n + ' رقم من رقمك +' + (wa.phone || '') + '. الوقت المتوقع حوالي ' + formatDuration(n * SPEED_AVG[draft.speed]) + '. متأكد؟';
    $('confirm').hidden = false;
    $('confirm-yes').focus();
  }

  function send() {
    $('confirm').hidden = true;
    $('send').disabled = true;
    var rows = parsed.rows.slice(0, perSend);
    var body = {
      template: templateForSend(),
      defs: draft.vars.map(function (v) {
        return v.d.slice(0, MAX_VALUE);
      }),
      rows: rows,
      speed: draft.speed
    };
    jobMeta = { id: '', phones: rows.map(function (r) {
      return r.p;
    }), at: Date.now() };
    results = [];
    $('results').textContent = '';
    saveJob();
    waCall('/api/wa/send', body).then(function (r) {
      if (!r.ok) {
        jobMeta = null;
        saveJob();
        setError(ERR_TEXT[r.error] || ERR_TEXT.unavailable);
        renderSend();
        return;
      }
      if (r.job) {
        jobMeta.id = r.job.id;
        saveJob();
      }
      applyStatus(r);
      schedulePoll();
      $('job').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  function stop() {
    $('stop').disabled = true;
    waCall('/api/wa/stop', { from: results.length }).then(function (r) {
      $('stop').disabled = false;
      if (r.ok) applyStatus(r);
    });
  }

  function downloadReport() {
    if (!jobMeta || !results.length) return;
    var lines = ['الرقم,الحالة'];
    for (var i = 0; i < results.length; i++) lines.push('+' + jobMeta.phones[i] + ',' + (STATUS_TEXT[results[i]] || ''));
    var blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'pop-whatsapp-report.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1000);
  }

  function bind() {
    $('msg').value = draft.msg;
    $('nums').value = draft.nums;
    $('cc').value = draft.cc;
    $('speed').value = draft.speed;

    $('add-var').addEventListener('click', function () {
      if (draft.vars.length >= MAX_VARS) return;
      draft.vars.push({ n: '', d: '' });
      renderVars();
      refresh(true);
      var inputs = $('vars').querySelectorAll('.var input[type=text]');
      if (inputs.length) inputs[inputs.length - 2].focus();
    });

    var ta = $('msg');
    ['keyup', 'click', 'select', 'input', 'blur'].forEach(function (ev) {
      ta.addEventListener(ev, function () {
        lastCaret = [ta.selectionStart, ta.selectionEnd];
      });
    });
    ta.addEventListener('input', function () {
      draft.msg = ta.value.slice(0, MAX_MSG);
      refresh(false);
    });

    $('insert').addEventListener('click', function (e) {
      e.stopPropagation();
      if ($('menu').hidden) openMenu();
      else closeMenu();
    });
    document.addEventListener('click', function (e) {
      if (!$('menu').hidden && !$('menu').contains(e.target)) closeMenu();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !$('menu').hidden) {
        closeMenu();
        $('insert').focus();
      }
    });

    var numTimer = null;
    $('nums').addEventListener('input', function () {
      draft.nums = $('nums').value;
      clearTimeout(numTimer);
      numTimer = setTimeout(function () {
        refresh(true);
      }, 200);
    });
    $('cc').addEventListener('input', function () {
      var v = cleanDigits($('cc').value).replace(/\D/g, '').slice(0, 4);
      if (v !== $('cc').value) $('cc').value = v;
      draft.cc = v;
      refresh(true);
    });
    $('clear-nums').addEventListener('click', function () {
      draft.nums = '';
      $('nums').value = '';
      refresh(true);
    });
    $('file').addEventListener('change', function () {
      var f = $('file').files && $('file').files[0];
      $('file').value = '';
      if (!f) return;
      if (f.size > 2 * 1024 * 1024) {
        setError('الملف كبير. أقصى حجم 2 ميجا.');
        return;
      }
      var reader = new FileReader();
      reader.onload = function () {
        var text = String(reader.result || '').replace(/^\uFEFF/, '');
        draft.nums = (draft.nums.trim() ? draft.nums.replace(/\s+$/, '') + '\n' : '') + text;
        draft.nums = draft.nums.slice(0, 200000);
        $('nums').value = draft.nums;
        refresh(true);
      };
      reader.readAsText(f);
    });

    $('speed').addEventListener('change', function () {
      draft.speed = $('speed').value === 'normal' ? 'normal' : 'safe';
      refresh(false);
    });
    $('prev-back').addEventListener('click', function () {
      if (previewAt > 0) previewAt--;
      renderPreview();
    });
    $('prev-next').addEventListener('click', function () {
      if (previewAt < parsed.rows.length - 1) previewAt++;
      renderPreview();
    });

    $('connect').addEventListener('click', function () {
      wakeTries = 0;
      connect('new');
    });
    $('cancel-qr').addEventListener('click', function () {
      waCall('/api/wa/logout', {}).then(function (r) {
        if (r.ok) applyStatus(r);
      });
      wa.state = 'idle';
      renderLink();
    });
    $('logout').addEventListener('click', logout);
    $('send').addEventListener('click', askSend);
    $('confirm-yes').addEventListener('click', send);
    $('confirm-no').addEventListener('click', function () {
      $('confirm').hidden = true;
    });
    $('stop').addEventListener('click', stop);
    $('report').addEventListener('click', downloadReport);
    $('out').addEventListener('click', function () {
      A.call('/api/session/end', session.t).then(leave, leave);
    });

    setInterval(tickTimer, 1000);
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && wa.state !== 'idle') poll();
    });
  }

  A.call('/api/session/check', session.t).then(function (r) {
    if (!r.ok && r.error !== 'network') {
      leave();
      return;
    }
    if (r.ok) {
      var name = [r.firstName, r.lastName].filter(Boolean).join(' ');
      $('who').textContent = name ? name + ' - ' + r.email : r.email;
    }
    $('gate').hidden = true;
    $('top').hidden = false;
    $('view').hidden = false;
    bind();
    renderVars();
    refresh(true);
    renderLink();
    wa.state = 'waking';
    renderLink();
    connect('resume');
  });
})();
