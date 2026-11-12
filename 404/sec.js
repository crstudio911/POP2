(function () {
  var $ = function (id) { return document.getElementById(id); };
  var G = window.POPGuard;
  var cfg = window.POP || {};
  var q = new URLSearchParams(window.location.search);
  var from = q.get('from') || '';
  var target = '../main/main.html';
  if (/^\/(?!\/)[A-Za-z0-9._~\-\/]*(\?[A-Za-z0-9._~\-=&%+]*)?$/.test(from) && from.indexOf('/404/') < 0) target = from;
  var ban = G.storedBan();
  var until = ban && !ban.l ? Number(ban.u) : 0;
  var lifetime = !!(ban && ban.l);
  var timer = null;
  var busy = false;
  var ERR = {
    invalid_unlock: 'هذا الكود غير صحيح. تأكّد من كتابته كما وصلك من إدارة POP.',
    unlock_used: 'استُخدم هذا الكود من قبل، ولا يمكن استخدامه مرة أخرى.',
    rate: 'محاولات كثيرة. يرجى الانتظار 15 دقيقة ثم المحاولة مجددًا.',
    not_banned: 'لا يوجد إيقاف نشط على هذا الجهاز أو الحساب الآن.',
    network: 'تعذّر الاتصال. يرجى التحقق من الإنترنت.',
    unavailable: 'تعذّر إتمام الطلب الآن. يرجى المحاولة بعد قليل.'
  };
  $('yr').textContent = String(new Date().getFullYear());

  function token() {
    try {
      var raw = window.localStorage.getItem(cfg.storageKey || 'pop_s') || window.sessionStorage.getItem(cfg.storageKey || 'pop_s');
      var s = raw ? JSON.parse(raw) : null;
      return s && typeof s.t === 'string' ? s.t : '';
    } catch (e) {
      return '';
    }
  }

  function auth() {
    var t = token();
    return t ? { Authorization: 'Bearer ' + t } : {};
  }

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function left(ms) {
    var t = Math.max(0, Math.ceil(ms / 1000));
    var d = Math.floor(t / 86400);
    var h = Math.floor((t % 86400) / 3600);
    var m = Math.floor((t % 3600) / 60);
    var s = t % 60;
    return (d ? d + 'd ' : '') + pad(h) + ':' + pad(m) + ':' + pad(s);
  }

  function at(ms) {
    try {
      return new Intl.DateTimeFormat('ar-EG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(ms));
    } catch (e) {
      return new Date(ms).toLocaleString();
    }
  }

  function paint() {
    if (lifetime) {
      $('ban-label').textContent = 'مدة الإيقاف';
      $('ban-left').textContent = 'دائم';
      $('ban-left').removeAttribute('dir');
      $('ban-at').textContent = 'لا ينتهي هذا الإيقاف تلقائيًا، ويمكن فكّه بكود من إدارة POP فقط.';
      return;
    }
    if (!until) return;
    var ms = until - G.now();
    $('ban-label').textContent = 'ينتهي الإيقاف بعد';
    $('ban-left').textContent = left(ms);
    $('ban-at').textContent = 'في ' + at(until);
    if (ms <= 0) {
      clearInterval(timer);
      timer = null;
      status();
    }
  }

  function free(text) {
    G.clearBan();
    try { window.sessionStorage.removeItem('pop_dt'); } catch (e) {}
    $('state').classList.add('ok');
    $('state-text').textContent = text;
    setTimeout(function () { window.location.replace(target); }, 1200);
  }

  function read(res) {
    return res.json().then(function (j) { j = j || {}; j.status = res.status; return j; }, function () { return { ok: false, error: 'unavailable', status: res.status }; });
  }

  function status() {
    G.send('/api/sec/status', {}, auth()).then(read).then(function (j) {
      if (j.ok && !j.banned) return free('لا يوجد إيقاف على هذا الجهاز، جارٍ إعادتك...');
      if (j.banned || j.error === 'banned') {
        lifetime = !!j.lifetime;
        until = Number(j.until) || 0;
        try { window.localStorage.setItem('pop_ban', JSON.stringify({ u: until, l: lifetime, at: Date.now() })); } catch (e) {}
        $('state-text').textContent = lifetime ? 'الإيقاف دائم على هذا الجهاز أو الحساب.' : 'الإيقاف ما زال ساريًا.';
        paint();
        if (!timer && !lifetime) timer = setInterval(paint, 1000);
        return;
      }
      $('state-text').textContent = ERR.unavailable;
    }, function () {
      $('state-text').textContent = ERR.network;
      paint();
    });
  }

  $('code').addEventListener('input', function () {
    var v = this.value.toUpperCase().replace(/[^A-Z0-9-]/g, '');
    if (v !== this.value) this.value = v;
  });

  $('unlock').addEventListener('submit', function (e) {
    e.preventDefault();
    if (busy) return;
    var code = $('code').value.trim().toUpperCase();
    var msg = $('unlock-msg');
    msg.classList.remove('ok');
    if (!/^UNL-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(code)) {
      msg.textContent = ERR.invalid_unlock;
      return;
    }
    busy = true;
    $('unlock-btn').disabled = true;
    msg.textContent = 'جارٍ التحقق من الكود...';
    G.send('/api/sec/unlock', { code: code }, auth()).then(read).then(function (j) {
      busy = false;
      $('unlock-btn').disabled = false;
      if (j.ok) {
        msg.classList.add('ok');
        msg.textContent = 'تم فك الإيقاف بنجاح.';
        free('تم فك الإيقاف، جارٍ إعادتك...');
        return;
      }
      msg.textContent = ERR[j.error] || ERR.unavailable;
    }, function () {
      busy = false;
      $('unlock-btn').disabled = false;
      msg.textContent = ERR.network;
    });
  });

  paint();
  if (until && !lifetime) timer = setInterval(paint, 1000);
  status();
})();
