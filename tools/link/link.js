(function () {
  var A = window.POPAuth;
  var LOGIN = '../../login/log.html';
  var $ = function (id) { return document.getElementById(id); };

  if (!A.read()) {
    A.clear();
    window.location.replace(LOGIN);
    return;
  }

  A.access('link', { login: LOGIN, home: '../../main/main.html' }, function () {
    $('gate').hidden = true;
    $('top').hidden = false;
    $('view').hidden = false;
  });

  function digits(v) {
    return v.replace(/[\u0660-\u0669]/g, function (c) { return String(c.charCodeAt(0) - 0x660); }).replace(/\D/g, '');
  }

  function build() {
    var cc = digits($('cc').value).slice(0, 4);
    var p = digits($('phone').value);
    if (p.indexOf('00') === 0) p = p.slice(2);
    else if (cc && p.indexOf(cc) !== 0) p = cc + p.replace(/^0+/, '');
    var full = p;
    if (!$('phone').value.trim()) {
      $('out-card').hidden = true;
      $('state').textContent = '';
      return;
    }
    if (full.length < 8 || full.length > 15) {
      $('out-card').hidden = true;
      $('state').textContent = 'يرجى إدخال رقم صحيح.';
      return;
    }
    var msg = $('msg').value.trim();
    var url = 'https://wa.me/' + full + (msg ? '?text=' + encodeURIComponent(msg) : '');
    $('result').value = url;
    $('open').href = url;
    $('out-card').hidden = false;
    $('state').textContent = '';
  }

  ['cc', 'phone', 'msg'].forEach(function (id) { $(id).addEventListener('input', build); });
  $('result').addEventListener('focus', function () { this.select(); });
  $('copy').addEventListener('click', function () {
    navigator.clipboard.writeText($('result').value).then(
      function () { $('state').textContent = 'نُسخ الرابط.'; },
      function () { $('result').select(); $('state').textContent = 'تعذّر النسخ التلقائي، يرجى النسخ يدويًا.'; }
    );
  });

  document.getElementById('out').addEventListener('click', function () {
    var s = A.read();
    var go = function () { A.clear(); window.location.replace(LOGIN); };
    if (!s) return go();
    A.call('/api/session/end', s.t).then(go, go);
  });
})();
