(function () {
  'use strict';
  var cfg = window.POP || {};
  var API = String(cfg.api || '').replace(/\/+$/, '');
  var NATIVE_FETCH = window.fetch;
  var XHR = window.XMLHttpRequest && window.XMLHttpRequest.prototype;
  var XHR_OPEN = XHR && XHR.open;
  var XHR_SEND = XHR && XHR.send;
  var ROOT = (function () {
    try {
      return new URL('./', document.currentScript.src).href;
    } catch (e) {
      return '/';
    }
  })();
  var MODE = document.documentElement.getAttribute('data-guard') || 'full';
  var WATCH = cfg.guard !== false && MODE === 'full';
  var DEV_KEY = 'pop_d';
  var BAN_KEY = 'pop_ban';
  var OPEN_FLAG = 'pop_dt';
  var STATUS_KEY = 'pop_sc';
  var GRACE_MS = 10000;
  var leaving = false;
  var base = null;

  function hex(bytes) {
    return Array.prototype.map.call(bytes, function (x) {
      return ('0' + x.toString(16)).slice(-2);
    }).join('');
  }

  function device() {
    var d = '';
    try {
      d = window.localStorage.getItem(DEV_KEY) || '';
    } catch (e) {}
    if (!/^[a-f0-9]{32}$/.test(d)) {
      var b = new Uint8Array(16);
      window.crypto.getRandomValues(b);
      d = hex(b);
      try {
        window.localStorage.setItem(DEV_KEY, d);
      } catch (e) {}
    }
    return d;
  }
  var DEVICE = device();

  function sync(serverMs, rtt) {
    var s = Number(serverMs);
    if (!(s > 0)) return;
    base = { s: s + Math.max(0, Number(rtt) || 0) / 2, p: window.performance.now() };
  }

  function now() {
    return base ? base.s + (window.performance.now() - base.p) : Date.now();
  }

  function synced() {
    return !!base;
  }

  function token() {
    try {
      var raw = window.localStorage.getItem(cfg.storageKey || 'pop_s') || window.sessionStorage.getItem(cfg.storageKey || 'pop_s');
      var s = raw ? JSON.parse(raw) : null;
      return s && typeof s.t === 'string' ? s.t : '';
    } catch (e) {
      return '';
    }
  }

  function from() {
    return window.location.pathname + window.location.search;
  }

  function go(file) {
    if (leaving) return;
    leaving = true;
    var page = window.location.pathname;
    if (page.indexOf('/404/') >= 0) return;
    window.location.replace(ROOT + '404/' + file + '?from=' + encodeURIComponent(from()));
  }

  function saveBan(r) {
    try {
      window.localStorage.setItem(BAN_KEY, JSON.stringify({ u: Number(r.until) || 0, l: !!r.lifetime, at: Date.now() }));
      window.sessionStorage.removeItem(STATUS_KEY);
    } catch (e) {}
  }

  function clearBan() {
    try {
      window.localStorage.removeItem(BAN_KEY);
      window.sessionStorage.removeItem(STATUS_KEY);
    } catch (e) {}
  }

  function storedBan() {
    try {
      var b = JSON.parse(window.localStorage.getItem(BAN_KEY) || 'null');
      if (!b) return null;
      if (b.l || Number(b.u) > now()) return b;
      window.localStorage.removeItem(BAN_KEY);
    } catch (e) {}
    return null;
  }

  function banned(r) {
    saveBan(r || {});
    go('sec.html');
  }

  var holdUntil = 0;
  var pending = {};
  var toast = null;
  var toastTimer = 0;

  function notify(text) {
    if (!document.body) return;
    if (!toast) {
      toast = document.createElement('div');
      toast.setAttribute('role', 'status');
      toast.setAttribute('aria-live', 'polite');
      var st = toast.style;
      st.position = 'fixed';
      st.left = '50%';
      st.bottom = '22px';
      st.transform = 'translateX(-50%)';
      st.zIndex = '2147483000';
      st.maxWidth = 'min(92vw, 460px)';
      st.padding = '12px 18px';
      st.borderRadius = '14px';
      st.background = 'rgba(20, 16, 12, 0.94)';
      st.border = '1px solid rgba(255, 122, 0, 0.55)';
      st.color = '#fff';
      st.fontFamily = 'inherit';
      st.fontSize = '14px';
      st.fontWeight = '600';
      st.lineHeight = '1.6';
      st.textAlign = 'center';
      st.boxShadow = '0 12px 32px rgba(0, 0, 0, 0.45)';
      st.direction = 'rtl';
      document.body.appendChild(toast);
    }
    toast.textContent = text;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      if (toast) toast.hidden = true;
    }, 5000);
  }

  function held(secs) {
    return new Response(JSON.stringify({ ok: false, error: 'rate', retry: secs }), { status: 429, headers: { 'Content-Type': 'application/json' } });
  }

  function send(path, body, extra) {
    var h = { 'Content-Type': 'application/json', 'X-POP-Device': DEVICE };
    Object.keys(extra || {}).forEach(function (k) {
      h[k] = extra[k];
    });
    var t0 = window.performance.now();
    if (t0 < holdUntil && path !== '/api/sec/status') return Promise.resolve(held(Math.ceil((holdUntil - t0) / 1000)));
    var raw = JSON.stringify(body || {});
    var key = path + '|' + raw + '|' + (h.Authorization || '') + '|' + (h['X-WA-Ticket'] || '');
    if (!pending[key]) {
      pending[key] = NATIVE_FETCH.call(window, API + path, {
        method: 'POST',
        headers: h,
        body: raw,
        cache: 'no-store',
        credentials: 'omit'
      }).then(function (res) {
        sync(res.headers.get('X-POP-Time'), window.performance.now() - t0);
        return res.text().then(function (text) {
          return { s: res.status, t: text, h: res.headers.get('Content-Type') || 'application/json' };
        });
      }).then(function (x) {
        delete pending[key];
        if (x.s === 429) {
          var j = null;
          try {
            j = JSON.parse(x.t);
          } catch (e) {}
          var secs = Math.max(1, Math.min(900, Number(j && j.retry) || 5));
          if (j && (j.error === 'rate' || j.error === 'busy')) {
            holdUntil = Math.max(holdUntil, window.performance.now() + secs * 1000);
            notify('طلبات كثيرة في وقت قصير. انتظر ' + secs + ' ثانية ثم حاول مجددًا.');
          }
        }
        return x;
      }, function (e) {
        delete pending[key];
        throw e;
      });
    }
    return pending[key].then(function (x) {
      return new Response(x.t, { status: x.s, headers: { 'Content-Type': x.h } });
    });
  }

  function report(signal) {
    if (leaving) return Promise.resolve(null);
    var t = token();
    return send('/api/sec/report', { signal: signal, page: window.location.pathname }, t ? { Authorization: 'Bearer ' + t } : {})
      .then(function (res) {
        return res.json();
      })
      .then(function (j) {
        if (j && (j.banned || j.error === 'banned')) banned(j);
        return j;
      }, function () {
        return null;
      });
  }

  function checkTime() {
    var t0 = window.performance.now();
    return NATIVE_FETCH.call(window, API + '/api/time', { cache: 'no-store', credentials: 'omit' })
      .then(function (r) {
        return r.ok ? r.json() : null;
      })
      .then(function (j) {
        if (!j || !j.ok || !(j.now > 0)) return true;
        var rtt = window.performance.now() - t0;
        sync(j.now, rtt);
        var skew = Math.abs(Date.now() - (j.now + rtt / 2));
        var tzBad = j.check && typeof j.offset === 'number' && j.offset !== -new Date().getTimezoneOffset();
        return skew <= (Number(j.skew) || 120) * 1000 && !tzBad;
      }, function () {
        return true;
      });
  }

  function checkStatus() {
    try {
      var c = Number(window.sessionStorage.getItem(STATUS_KEY) || 0);
      if (c && Date.now() - c < 180000 && Date.now() >= c) return;
    } catch (e) {}
    var t = token();
    send('/api/sec/status', {}, t ? { Authorization: 'Bearer ' + t } : {})
      .then(function (res) {
        return res.json();
      })
      .then(function (j) {
        if (!j) return;
        if (j.banned || j.error === 'banned') banned(j);
        else if (j.ok) {
          clearBan();
          try {
            window.sessionStorage.setItem(STATUS_KEY, String(Date.now()));
          } catch (e) {}
        }
      }, function () {});
  }

  var veil = null;
  var veilTimer = null;
  var openSince = 0;
  var closedRuns = 0;
  var reported = false;

  function showVeil() {
    if (veil || !document.body) return;
    veil = document.createElement('div');
    veil.className = 'sec-veil';
    veil.setAttribute('role', 'alertdialog');
    veil.setAttribute('aria-live', 'assertive');
    veil.innerHTML =
      '<div class="sec-box">' +
      '<svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3Z"/><path d="M12 8v5M12 16h.01"/></svg>' +
      '<h2>أغلق أدوات المطوّر للمتابعة</h2>' +
      '<p>أوقفنا الصفحة مؤقتًا لحماية حسابك وخدمات POP. أغلق أدوات المطوّر الآن لمتابعة الاستخدام بشكل طبيعي.</p>' +
      '<b class="sec-count"></b>' +
      '</div>';
    document.body.appendChild(veil);
    var tick = function () {
      if (!veil) return;
      var left = Math.max(0, Math.ceil((GRACE_MS - (Date.now() - openSince)) / 1000));
      veil.querySelector('.sec-count').textContent = 'سيُؤمَّن الاتصال تلقائيًا خلال ' + left + ' ثانية إذا بقيت مفتوحة';
    };
    tick();
    veilTimer = setInterval(tick, 500);
  }

  var waiters = [];

  function hideVeil() {
    if (veilTimer) clearInterval(veilTimer);
    veilTimer = null;
    if (veil) veil.remove();
    veil = null;
    var list = waiters;
    waiters = [];
    list.forEach(function (fn) {
      fn();
    });
  }

  function whenClear() {
    if (!openSince) return Promise.resolve();
    return new Promise(function (resolve) {
      waiters.push(resolve);
    });
  }

  var sample = null;
  var maxLog = 0;
  function probe() {
    if (!sample) {
      sample = [];
      for (var i = 0; i < 50; i++) {
        var o = {};
        for (var j = 0; j < 500; j++) o[j] = j;
        sample.push(o);
      }
    }
    var c = window.console;
    var a = window.performance.now();
    c.table(sample);
    var tableMs = window.performance.now() - a;
    var b = window.performance.now();
    c.log(sample);
    var logMs = window.performance.now() - b;
    maxLog = Math.max(maxLog, logMs);
    c.clear();
    return tableMs > 0 && maxLog > 0 && tableMs > maxLog * 10;
  }

  function flagged() {
    try {
      return window.sessionStorage.getItem(OPEN_FLAG) === '1';
    } catch (e) {
      return false;
    }
  }

  function setFlag(on) {
    try {
      if (on) window.sessionStorage.setItem(OPEN_FLAG, '1');
      else window.sessionStorage.removeItem(OPEN_FLAG);
    } catch (e) {}
  }

  function strike(signal) {
    if (reported) return;
    reported = true;
    report(signal).then(function (j) {
      if (!j || !j.banned) reported = false;
    });
  }

  function watchTools() {
    var open = false;
    try {
      open = probe();
    } catch (e) {}
    if (open) {
      closedRuns = 0;
      if (!openSince) {
        openSince = Date.now();
        if (flagged()) {
          strike('devtools_refresh');
          return;
        }
        setFlag(true);
        showVeil();
      } else if (Date.now() - openSince > GRACE_MS) strike('devtools');
    } else if (openSince) {
      closedRuns++;
      if (closedRuns >= 2) {
        openSince = 0;
        setFlag(false);
        hideVeil();
      }
    }
  }

  function watchTamper() {
    if (window.fetch !== NATIVE_FETCH || (XHR && (XHR.open !== XHR_OPEN || XHR.send !== XHR_SEND))) strike('tamper');
  }

  function blockKeys(e) {
    var k = String(e.key || '').toLowerCase();
    var mod = e.ctrlKey || e.metaKey;
    if (k === 'f12' || (mod && e.shiftKey && ['i', 'j', 'c', 'k'].indexOf(k) >= 0) || (mod && e.altKey && ['i', 'j', 'c', 'u'].indexOf(k) >= 0) || (mod && k === 'u')) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  function blockMenu(e) {
    var t = e.target;
    if (t && t.closest && t.closest('input, textarea, [contenteditable="true"]')) return;
    e.preventDefault();
  }

  function chromium() {
    var brands = navigator.userAgentData && navigator.userAgentData.brands;
    if (brands && brands.some(function (b) { return /Chromium|Google Chrome|Microsoft Edge|Opera|Brave/i.test(b.brand); })) return true;
    return !!window.chrome && /Chrome\//.test(navigator.userAgent);
  }

  function desktop() {
    var coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    return !coarse && !/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  }

  function lockZoom() {
    var d = document.documentElement;
    d.style.touchAction = 'manipulation';
    d.style.webkitTextSizeAdjust = '100%';
    d.style.textSizeAdjust = '100%';
    var stop = function (e) {
      e.preventDefault();
    };
    ['gesturestart', 'gesturechange', 'gestureend'].forEach(function (name) {
      document.addEventListener(name, stop, { passive: false });
    });
    document.addEventListener('touchmove', function (e) {
      if ((e.touches && e.touches.length > 1) || (typeof e.scale === 'number' && e.scale !== 1)) e.preventDefault();
    }, { passive: false });
  }

  function start() {
    lockZoom();
    if (MODE === 'off') return;
    if (storedBan()) {
      go('sec.html');
      return;
    }
    checkTime().then(function (ok) {
      if (!ok) {
        go('time.html');
        return;
      }
      if (MODE === 'full') checkStatus();
    });
    if (!WATCH) return;
    window.addEventListener('keydown', blockKeys, true);
    window.addEventListener('contextmenu', blockMenu, true);
    if (navigator.webdriver === true) strike('automation');
    setInterval(watchTamper, 3000);
    if (desktop() && chromium()) {
      watchTools();
      setInterval(watchTools, 1500);
    }
  }

  window.POPGuard = Object.freeze({
    device: function () {
      return DEVICE;
    },
    now: now,
    synced: synced,
    sync: sync,
    send: send,
    report: report,
    banned: banned,
    clearBan: clearBan,
    storedBan: storedBan,
    checkTime: checkTime,
    blocked: function () {
      return !!openSince;
    },
    whenClear: whenClear,
    root: ROOT
  });

  start();
})();
