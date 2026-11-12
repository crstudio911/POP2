(function () {
  var cfg = window.POP || {};
  var API = String(cfg.api || '').replace(/\/+$/, '');
  var KEY = cfg.storageKey || 'pop_s';
  var ME_KEY = 'pop_me';
  var ROOT = (function () {
    try {
      return new URL('./', document.currentScript.src).href;
    } catch (e) {
      return '/';
    }
  })();
  var netFails = 0;
  var leaving = false;

  var veil = null;

  function hideOffline() {
    if (veil) {
      veil.remove();
      veil = null;
    }
  }

  function showOffline() {
    if (veil || !document.body) return;
    veil = document.createElement('div');
    veil.className = 'net-veil';
    veil.setAttribute('role', 'alertdialog');
    veil.setAttribute('aria-live', 'assertive');
    veil.innerHTML =
      '<div class="net-box">' +
      '<svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 8.8a15 15 0 0 1 20 0M5 12.6a10 10 0 0 1 14 0M8.5 16.4a5 5 0 0 1 7 0M12 20h.01"/><path d="M3 3l18 18"/></svg>' +
      '<h2>انقطع اتصالك بالإنترنت</h2>' +
      '<p>لا تقلق، لن تفقد ما أدخلته في هذه الصفحة. سنكمل تلقائيًا فور عودة الاتصال.</p>' +
      '<button class="btn" type="button">إعادة المحاولة</button>' +
      '<span class="net-note"></span>' +
      '</div>';
    veil.querySelector('button').addEventListener('click', function () {
      if (navigator.onLine !== false) hideOffline();
      else veil.querySelector('.net-note').textContent = 'ما زال الاتصال مقطوعًا. يرجى التحقق من الشبكة أو بيانات الهاتف.';
    });
    document.body.appendChild(veil);
  }

  window.addEventListener('online', function () {
    netFails = 0;
    hideOffline();
  });

  function goError(kind) {
    if (kind === 'offline') {
      showOffline();
      return;
    }
    if (leaving) return;
    leaving = true;
    var from = window.location.pathname + window.location.search;
    window.location.href = ROOT + '404/er.html?k=' + encodeURIComponent(kind || 'net') + '&from=' + encodeURIComponent(from);
  }

  window.addEventListener('offline', function () {
    setTimeout(function () {
      if (navigator.onLine === false) goError('offline');
    }, 3000);
  });

  function read() {
    try {
      var raw = window.localStorage.getItem(KEY) || window.sessionStorage.getItem(KEY);
      var s = raw ? JSON.parse(raw) : null;
      return s && typeof s.t === 'string' && Number(s.e) > Date.now() ? s : null;
    } catch (e) {
      return null;
    }
  }

  function clear() {
    try {
      window.localStorage.removeItem(KEY);
      window.sessionStorage.removeItem(KEY);
      window.localStorage.removeItem(ME_KEY);
    } catch (e) {}
  }

  function cached() {
    if (!read()) return null;
    try {
      var m = JSON.parse(window.localStorage.getItem(ME_KEY) || 'null');
      return m && typeof m.email === 'string' ? m : null;
    } catch (e) {
      return null;
    }
  }

  var G = window.POPGuard;

  function post(path, body, headers) {
    var h = { 'Content-Type': 'application/json' };
    Object.keys(headers || {}).forEach(function (k) {
      h[k] = headers[k];
    });
    var req = G
      ? G.whenClear().then(function () {
          return G.send(path, body, h);
        })
      : fetch(API + path, { method: 'POST', headers: h, body: JSON.stringify(body || {}), cache: 'no-store', credentials: 'omit' });
    return req.then(
      function (res) {
        return res.json().then(
          function (j) {
            j = j && typeof j === 'object' ? j : { ok: false };
            j.status = res.status;
            netFails = 0;
            if (j.error === 'banned' && G) {
              G.banned(j);
              return new Promise(function () {});
            }
            return j;
          },
          function () {
            return { ok: false, error: 'unavailable', status: res.status };
          }
        );
      },
      function () {
        netFails++;
        if (navigator.onLine === false) goError('offline');
        else if (netFails >= 3) goError('net');
        return { ok: false, error: 'network', status: 0 };
      }
    );
  }

  function call(path, token, body) {
    return post(path, body, { Authorization: 'Bearer ' + token });
  }

  var PLAN_NAMES = { free: 'Free', pro: 'Pro', max: 'Max', unlimited: 'Unlimited', dev: 'Dev' };

  function planName(p) {
    return PLAN_NAMES[p] || PLAN_NAMES.free;
  }

  function paidCount(subs) {
    var n = 0;
    Object.keys(subs || {}).forEach(function (k) {
      if (subs[k] && subs[k].plan && subs[k].plan !== 'free') n++;
    });
    return n;
  }

  function fmtWait(ms) {
    var m = Math.max(1, Math.ceil(ms / 60000));
    if (m < 60) return m + ' دقيقة';
    var h = Math.floor(m / 60);
    var r = m % 60;
    return h + ' ساعة' + (r ? ' و' + r + ' دقيقة' : '');
  }

  function now() {
    return G ? G.now() : Date.now();
  }

  function pad(n) {
    return (n < 10 ? '0' : '') + n;
  }

  function fmtLeft(ms) {
    var t = Math.max(0, Math.ceil(ms / 1000));
    var h = Math.floor(t / 3600);
    var m = Math.floor((t % 3600) / 60);
    var s = t % 60;
    return (h ? h + ':' + pad(m) : String(m)) + ':' + pad(s);
  }

  function fmtAt(ms) {
    var lang = (window.POPLang && window.POPLang.current) || 'ar';
    var d = new Date(ms);
    var sameDay = new Date(now()).toDateString() === d.toDateString();
    var opts = sameDay ? { hour: 'numeric', minute: '2-digit' } : { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' };
    try {
      return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG' : lang, opts).format(d);
    } catch (e) {
      return d.toLocaleString();
    }
  }

  function fmtDate(ms) {
    var lang = (window.POPLang && window.POPLang.current) || 'ar';
    try {
      return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG' : lang, { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(ms));
    } catch (e) {
      return new Date(ms).toLocaleDateString();
    }
  }

  function initials(first, last, email) {
    var a = String(first || '').trim().charAt(0);
    var b = String(last || '').trim().charAt(0);
    var out = (a + b).trim();
    return out || String(email || '?').charAt(0).toUpperCase();
  }

  function setText(id, v) {
    var el = document.getElementById(id);
    if (el) el.textContent = v;
  }

  function ready() {
    document.documentElement.classList.remove('pop-loading');
  }

  function paintMe(me) {
    var name = [me.firstName, me.lastName].filter(Boolean).join(' ');
    setText('avatar', initials(me.firstName, me.lastName, me.email));
    setText('who-name', name || me.email || '');
    setText('who-mail', me.email || '');
    setText('um-name', name || me.email || '');
    setText('um-mail', me.email || '');
  }

  function early() {
    var gate = document.getElementById('gate');
    var view = document.getElementById('view');
    var top = document.getElementById('top');
    if (!gate || !view || gate.hidden || !read()) return;
    var me = cached();
    if (!me) return;
    document.documentElement.classList.add('pop-loading');
    paintMe(me);
    gate.hidden = true;
    view.hidden = false;
    if (top) top.hidden = false;
    setText('yr', String(new Date().getFullYear()));
    setTimeout(ready, 20000);
  }

  function user(r) {
    ready();
    var name = [r.firstName, r.lastName].filter(Boolean).join(' ');
    setText('avatar', initials(r.firstName, r.lastName, r.email));
    setText('who-name', name || r.email || '');
    setText('who-mail', r.email || '');
    setText('um-name', name || r.email || '');
    setText('um-mail', r.email || '');
    var paid = r.subs ? paidCount(r.subs) : -1;
    if (paid > 0) setText('um-plan', 'اشتراكات مدفوعة: ' + paid);
    else if (paid === 0) setText('um-plan', 'الباقة المجانية');
    else if (r.free) setText('um-plan', 'أداة مجانية بالكامل');
    else setText('um-plan', 'باقة ' + planName(r.plan) + ' لهذه الأداة');
    try {
      window.localStorage.setItem(ME_KEY, JSON.stringify({ email: r.email || '', firstName: r.firstName || '', lastName: r.lastName || '' }));
    } catch (e) {}
    setText('yr', String(new Date().getFullYear()));
    var btn = document.getElementById('user-btn');
    var menu = document.getElementById('user-menu');
    if (!btn || !menu || btn.dataset.bound) return;
    btn.dataset.bound = '1';
    function close() {
      menu.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
    }
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = menu.hidden;
      menu.hidden = !open;
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    menu.addEventListener('click', function (e) { e.stopPropagation(); });
    document.addEventListener('click', close);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') close();
    });
  }

  var ICON_LOCK = '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="10.5" width="16" height="10" rx="2.5"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3M12 15v2"/></svg>';
  var ICON_OFF = '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 8.5a15 15 0 0 1 20 0M5.5 12a10 10 0 0 1 13 0M9 15.5a5 5 0 0 1 6 0M12 19h.01"/></svg>';

  function deny(kind, home, retry) {
    if (kind !== 'access') {
      goError('net');
      return;
    }
    ready();
    var gate = document.getElementById('gate');
    if (gate) gate.hidden = true;
    var view = document.getElementById('view');
    if (view) view.hidden = true;
    var foot = document.querySelector('.site-foot');
    if (foot) foot.hidden = true;
    var box = document.createElement('section');
    box.className = 'deny';
    box.setAttribute('role', 'alert');
    var noAccess = kind === 'access';
    box.innerHTML =
      '<div class="deny-card"><span class="deny-icon">' + (noAccess ? ICON_LOCK : ICON_OFF) + '</span>' +
      '<h1></h1><p></p><div class="deny-actions"></div></div>';
    box.querySelector('h1').textContent = noAccess ? 'هذه الأداة غير متاحة في خطتك' : 'تعذّر التحقق من صلاحياتك';
    box.querySelector('p').textContent = noAccess
      ? 'لا يملك حسابك صلاحية استخدام هذه الأداة حاليًا. يمكنك العودة إلى لوحة الأدوات واستخدام الأدوات المتاحة لك.'
      : 'يرجى التحقق من اتصالك بالإنترنت ثم إعادة المحاولة.';
    var actions = box.querySelector('.deny-actions');
    var back = document.createElement('a');
    back.className = 'btn' + (noAccess ? '' : ' ghost');
    back.href = home;
    back.textContent = 'لوحة الأدوات';
    if (!noAccess) {
      var again = document.createElement('button');
      again.type = 'button';
      again.className = 'btn';
      again.textContent = 'إعادة المحاولة';
      again.addEventListener('click', function () {
        box.remove();
        if (gate) gate.hidden = false;
        if (foot) foot.hidden = false;
        retry();
      });
      actions.appendChild(again);
    }
    actions.appendChild(back);
    document.body.appendChild(box);
  }

  function access(tool, paths, onOk) {
    var s = read();
    if (!s) {
      clear();
      window.location.replace(paths.login);
      return;
    }
    function run() {
      call('/api/tool/access', s.t, { tool: tool }).then(function (r) {
        if (r.ok && r.allowed === true) {
          user(r);
          onOk(r, s);
          return;
        }
        if (r.ok) {
          deny('access', paths.home);
          return;
        }
        if (r.error === 'invalid_session' || r.status === 401) {
          clear();
          window.location.replace(paths.login);
          return;
        }
        goError(r.status ? 'server' : 'net');
      });
    }
    run();
  }

  function guest(paths) {
    var me = cached();
    if (me) {
      user({ email: me.email, firstName: me.firstName, lastName: me.lastName, free: true });
      return true;
    }
    var u = document.querySelector('.user');
    if (u) {
      var a = document.createElement('a');
      a.className = 'btn small';
      a.href = paths.login;
      a.textContent = 'تسجيل الدخول';
      u.replaceWith(a);
    }
    setText('yr', String(new Date().getFullYear()));
    return false;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', early);
  else early();

  window.POPAuth = Object.freeze({
    ready: ready,
    read: read,
    clear: clear,
    post: post,
    call: call,
    user: user,
    access: access,
    deny: deny,
    guest: guest,
    cached: cached,
    planName: planName,
    paidCount: paidCount,
    fmtWait: fmtWait,
    fmtDate: fmtDate,
    fmtLeft: fmtLeft,
    fmtAt: fmtAt,
    now: now,
    goError: goError,
    root: ROOT
  });
})();
