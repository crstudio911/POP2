(function () {
  var cfg = window.POP || {};
  var API = String(cfg.api || '').replace(/\/+$/, '');
  var KEY = cfg.storageKey || 'pop_s';

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
    } catch (e) {}
  }

  function post(path, body, headers) {
    var h = { 'Content-Type': 'application/json' };
    Object.keys(headers || {}).forEach(function (k) {
      h[k] = headers[k];
    });
    return fetch(API + path, {
      method: 'POST',
      headers: h,
      body: JSON.stringify(body || {}),
      cache: 'no-store',
      credentials: 'omit'
    }).then(
      function (res) {
        return res.json().then(
          function (j) {
            j = j && typeof j === 'object' ? j : { ok: false };
            j.status = res.status;
            return j;
          },
          function () {
            return { ok: false, error: 'unavailable', status: res.status };
          }
        );
      },
      function () {
        return { ok: false, error: 'network', status: 0 };
      }
    );
  }

  function call(path, token, body) {
    return post(path, body, { Authorization: 'Bearer ' + token });
  }

  var PLAN_NAMES = { free: 'الخطة المجانية', pro: 'الخطة الاحترافية', business: 'خطة الأعمال' };

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

  function user(r) {
    var name = [r.firstName, r.lastName].filter(Boolean).join(' ');
    setText('avatar', initials(r.firstName, r.lastName, r.email));
    setText('who-name', name || r.email || '');
    setText('who-mail', r.email || '');
    setText('um-name', name || r.email || '');
    setText('um-mail', r.email || '');
    setText('um-plan', PLAN_NAMES[r.plan] || PLAN_NAMES.free);
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
    var gate = document.getElementById('gate');
    if (gate) gate.hidden = true;
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
        deny('offline', paths.home, run);
      });
    }
    run();
  }

  window.POPAuth = Object.freeze({ read: read, clear: clear, post: post, call: call, user: user, access: access, deny: deny });
})();
