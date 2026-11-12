(function () {
  var A = window.POPAuth;
  var LOGIN = '../../login/log.html';
  var $ = function (id) { return document.getElementById(id); };


  A.guest({ login: LOGIN });
  $('gate').hidden = true;
  $('top').hidden = false;
  $('view').hidden = false;
  var out = $('out');
  if (out) out.addEventListener('click', function () {
    var s0 = A.read();
    var done = function () { A.clear(); window.location.replace(LOGIN); };
    if (s0) A.call('/api/session/end', s0.t).then(done, done);
    else done();
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

})();
