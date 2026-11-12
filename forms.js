(function () {
  'use strict';
  var AR = /[\u0660-\u0669\u06F0-\u06F9]/g;
  function latin(v) {
    return String(v).replace(AR, function (c) {
      var n = c.charCodeAt(0);
      return String(n >= 0x6f0 ? n - 0x6f0 : n - 0x660);
    });
  }

  function kind(el) {
    if (!el || el.tagName !== 'INPUT') return '';
    if (el.hasAttribute('data-free')) return '';
    if (el.type === 'number' || el.hasAttribute('data-num')) return el.getAttribute('data-num') === 'decimal' ? 'decimal' : 'int';
    var m = (el.getAttribute('inputmode') || '').toLowerCase();
    if (m === 'numeric') return 'int';
    if (m === 'decimal') return 'decimal';
    if (el.type === 'tel' || m === 'tel') return 'tel';
    return '';
  }

  function clean(v, k) {
    var s = latin(v);
    if (k === 'int') return s.replace(/\D+/g, '');
    if (k === 'decimal') {
      s = s.replace(/[,\u066B]/g, '.').replace(/[^\d.]+/g, '');
      var i = s.indexOf('.');
      return i < 0 ? s : s.slice(0, i + 1) + s.slice(i + 1).replace(/\./g, '');
    }
    if (k === 'tel') return s.replace(/[^\d+\s()-]+/g, '');
    return s;
  }

  document.addEventListener('input', function (e) {
    var el = e.target;
    var k = kind(el);
    if (!k || el.type === 'number') return;
    var v = el.value;
    var out = clean(v, k);
    if (out !== v) {
      var pos = el.selectionStart;
      var cut = v.length - out.length;
      el.value = out;
      try {
        if (pos !== null) el.setSelectionRange(Math.max(0, pos - cut), Math.max(0, pos - cut));
      } catch (err) {}
      el.classList.add('num-fixed');
      setTimeout(function () { el.classList.remove('num-fixed'); }, 500);
    }
  }, true);

  document.addEventListener('paste', function (e) {
    var el = e.target;
    var k = kind(el);
    if (!k || !e.clipboardData || el.type === 'number' || el.maxLength === 1) return;
    var text = e.clipboardData.getData('text');
    var out = clean(text, k);
    if (out === text) return;
    e.preventDefault();
    var a = el.selectionStart || 0;
    var b = el.selectionEnd || a;
    el.value = el.value.slice(0, a) + out + el.value.slice(b);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, true);

  document.addEventListener('blur', function (e) {
    var el = e.target;
    if (!el || el.tagName !== 'INPUT' || !(el.type === 'number' || el.hasAttribute('data-num'))) return;
    if (el.value === '') return;
    var n = Number(latin(el.value));
    if (!isFinite(n)) {
      el.value = '';
      return;
    }
    var min = el.getAttribute('min');
    var max = el.getAttribute('max');
    if (min !== null && min !== '' && n < Number(min)) n = Number(min);
    if (max !== null && max !== '' && n > Number(max)) n = Number(max);
    if (el.getAttribute('data-num') !== 'decimal' && (!el.step || el.step === '1')) n = Math.round(n);
    el.value = String(n);
  }, true);

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function localNow(addMin) {
    var d = new Date(Date.now() + (addMin || 0) * 60000);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  document.addEventListener('focusin', function (e) {
    var el = e.target;
    if (!el || el.tagName !== 'INPUT') return;
    if (el.type === 'datetime-local' && !el.hasAttribute('data-any') && !el.min) el.min = localNow(2);
    if (el.type === 'date' && el.hasAttribute('data-future') && !el.min) el.min = localNow(1440).slice(0, 10);
  });

  var bar = null;
  var barTimer = null;
  var barValue = 0;
  var active = 0;
  function paintBar() {
    if (!bar) return;
    bar.style.transform = 'scaleX(' + barValue + ')';
  }
  function start() {
    active++;
    if (!document.body) return;
    if (!bar) {
      bar = document.createElement('div');
      bar.className = 'pop-bar';
      bar.setAttribute('aria-hidden', 'true');
      document.body.appendChild(bar);
    }
    if (barTimer) return;
    bar.classList.add('on');
    barValue = 0.08;
    paintBar();
    barTimer = setInterval(function () {
      barValue = Math.min(0.94, barValue + (0.95 - barValue) * 0.06);
      paintBar();
    }, 250);
  }
  function done() {
    active = Math.max(0, active - 1);
    if (active || !bar) return;
    clearInterval(barTimer);
    barTimer = null;
    barValue = 1;
    paintBar();
    setTimeout(function () {
      if (active || !bar) return;
      bar.classList.remove('on');
      setTimeout(function () {
        if (!active && bar) {
          barValue = 0;
          paintBar();
        }
      }, 300);
    }, 220);
  }

  var lastBtn = null;
  var lastAt = 0;
  function remember(b) {
    if (!b) return;
    lastBtn = b;
    lastAt = Date.now();
  }
  document.addEventListener('click', function (e) {
    var b = e.target && e.target.closest ? e.target.closest('button, .btn, [type=submit]') : null;
    remember(b);
  }, true);
  document.addEventListener('submit', function (e) {
    remember(e.submitter || (e.target && e.target.querySelector('[type=submit]')));
  }, true);

  var held = [];
  var sweepTimer = null;
  function sweep() {
    held.slice().forEach(function (x) {
      if (!x.isConnected || !x.disabled) busy(x, false);
    });
    if (!held.length) {
      clearInterval(sweepTimer);
      sweepTimer = null;
    }
  }
  function busy(b, on) {
    var i = held.indexOf(b);
    if (on) {
      if (i >= 0) return;
      held.push(b);
      b.classList.add('is-busy');
      b.setAttribute('aria-busy', 'true');
      start();
      if (!sweepTimer) sweepTimer = setInterval(sweep, 800);
    } else if (i >= 0) {
      held.splice(i, 1);
      b.classList.remove('is-busy');
      b.removeAttribute('aria-busy');
      done();
    }
  }

  function watch() {
    if (!window.MutationObserver || !document.body) return;
    new MutationObserver(function (list) {
      list.forEach(function (m) {
        var b = m.target;
        if (!b || !b.classList || b.hasAttribute('data-nobusy')) return;
        if (b.disabled) {
          if (b === lastBtn && Date.now() - lastAt < 1500) busy(b, true);
        } else busy(b, false);
      });
    }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['disabled'] });
  }
  if (document.body) watch();
  else document.addEventListener('DOMContentLoaded', watch);

  window.POPBusy = Object.freeze({ start: start, done: done, button: busy, latin: latin });
})();
