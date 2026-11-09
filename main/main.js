(function () {
  var cfg = window.POP || {};
  var API = String(cfg.api || '').replace(/\/+$/, '');
  var KEY = cfg.storageKey || 'pop_s';
  var LOGIN = '../login/log.html';

  function readSession() {
    try {
      var raw = window.localStorage.getItem(KEY) || window.sessionStorage.getItem(KEY);
      var s = raw ? JSON.parse(raw) : null;
      return s && typeof s.t === 'string' && Number(s.e) > Date.now() ? s : null;
    } catch (e) {
      return null;
    }
  }

  function clearSession() {
    try {
      window.localStorage.removeItem(KEY);
      window.sessionStorage.removeItem(KEY);
    } catch (e) {}
  }

  function call(path, token) {
    return fetch(API + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: '{}',
      cache: 'no-store',
      credentials: 'omit'
    }).then(function (res) {
      return res.json().catch(function () {
        return { ok: false };
      });
    });
  }

  function leave() {
    clearSession();
    window.location.replace(LOGIN);
  }

  var session = readSession();
  if (!session) {
    leave();
    return;
  }

  call('/api/session/check', session.t)
    .then(function (r) {
      if (!r.ok) {
        leave();
        return;
      }
      var name = [r.firstName, r.lastName].filter(Boolean).join(' ');
      document.getElementById('who').textContent = name ? name + ' - ' + r.email : r.email;
      if (r.firstName) document.getElementById('hello').textContent = 'أهلا يا ' + r.firstName;
      document.getElementById('gate').hidden = true;
      document.getElementById('top').hidden = false;
      document.getElementById('view').hidden = false;
    })
    .catch(function () {
      window.location.replace(LOGIN);
    });

  document.getElementById('out').addEventListener('click', function () {
    call('/api/session/end', session.t).then(leave, leave);
  });
})();
