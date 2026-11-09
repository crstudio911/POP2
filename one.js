(function () {
  var bar = document.getElementById('bar');

  function onScroll() {
    bar.classList.toggle('solid', window.scrollY > 12);
  }

  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  function stored() {
    var key = (window.POP && window.POP.storageKey) || 'pop_s';
    var raw = null;
    try {
      raw = window.localStorage.getItem(key) || window.sessionStorage.getItem(key);
    } catch (e) {
      return null;
    }
    if (!raw) return null;
    try {
      var s = JSON.parse(raw);
      return s && typeof s.t === 'string' && Number(s.e) > Date.now() ? s : null;
    } catch (e) {
      return null;
    }
  }

  if (stored()) {
    ['enter', 'enter-hero', 'enter-band'].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.href = 'main/main.html';
      el.textContent = 'افتح POP';
    });
  }
})();
