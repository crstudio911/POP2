(function () {
  function hasRepeat(p) {
    var s = p.toLowerCase();
    if (/(.)\1\1/.test(s)) return true;
    for (var i = 0; i + 3 <= s.length; i++) {
      if (s.indexOf(s.substr(i, 3), i + 1) >= 0) return true;
    }
    return false;
  }

  function passwordProblems(p, personal) {
    var out = [];
    p = String(p || '');
    if (p.length < 8 || p.length > 64) out.push('len');
    if (!/^[\x21-\x7E]*$/.test(p) || !p) out.push('ascii');
    if ((p.match(/[A-Z]/g) || []).length < 2) out.push('upper');
    if (!/[0-9]/.test(p)) out.push('digit');
    if (!/[^A-Za-z0-9]/.test(p)) out.push('special');
    var low = p.toLowerCase();
    var hitPersonal = (personal || []).some(function (w) {
      var v = String(w || '').toLowerCase();
      return v.length >= 3 && low.indexOf(v) >= 0;
    });
    if (!p || hasRepeat(p) || hitPersonal) out.push('repeat');
    return out;
  }

  window.POP_RULES = Object.freeze({ passwordProblems: passwordProblems, all: ['len', 'upper', 'digit', 'special', 'ascii', 'repeat'] });
})();
