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

  window.POPAuth = Object.freeze({ read: read, clear: clear, post: post, call: call });
})();
