(function () {
  var A = window.POPAuth;
  var LOGIN = '../../login/log.html';
  var $ = function (id) { return document.getElementById(id); };
  var result = [];

  if (!A.read()) {
    A.clear();
    window.location.replace(LOGIN);
    return;
  }

  function show() {
    $('gate').hidden = true;
    $('top').hidden = false;
    $('view').hidden = false;
  }

  A.access('clean', { login: LOGIN, home: '../../main/main.html' }, show);

  document.getElementById('result').addEventListener('focus', function () { this.select(); });

  function norm(raw, cc) {
    var d = raw.replace(/[^\d+]/g, '');
    if (d.indexOf('+') === 0) d = d.slice(1);
    else if (d.indexOf('00') === 0) d = d.slice(2);
    else if (d.charAt(0) === '0' && cc) d = cc + d.slice(1);
    else if (cc && d.length <= 10 && d.indexOf(cc) !== 0) d = cc + d;
    d = d.replace(/\D/g, '');
    if (d.length < 8 || d.length > 15) return '';
    return d;
  }

  function chip(text, kind) {
    var s = document.createElement('span');
    if (kind) s.className = kind;
    s.textContent = text;
    $('stats').appendChild(s);
  }

  function arabicDigits(s) {
    return s.replace(/[\u0660-\u0669]/g, function (c) { return String(c.charCodeAt(0) - 0x660); })
      .replace(/[\u06F0-\u06F9]/g, function (c) { return String(c.charCodeAt(0) - 0x6F0); });
  }

  function run() {
    var cc = $('cc').value.replace(/\D/g, '').slice(0, 4);
    var text = arabicDigits($('src').value);
    var found = text.match(/\+?\d[\d\s\-().]{5,22}\d/g) || [];
    var seen = {};
    var dupes = 0;
    var bad = 0;
    result = [];
    found.forEach(function (f) {
      var n = norm(f, cc);
      if (!n) {
        bad++;
        return;
      }
      if (seen[n]) {
        dupes++;
        return;
      }
      seen[n] = 1;
      result.push(n);
    });
    var plus = $('fmt').value === 'plus';
    $('result').value = result.map(function (n) { return plus ? '+' + n : n; }).join('\n');
    $('stats').textContent = '';
    chip(result.length + ' رقم صالح');
    if (dupes) chip(dupes + ' رقم مكرر حُذف', 'warn');
    if (bad) chip(bad + ' رقم غير صالح', 'bad');
    $('out-card').hidden = false;
    $('state').textContent = result.length ? '' : 'لم يُعثر على أرقام صالحة في النص.';
  }

  $('run').addEventListener('click', run);
  $('fmt').addEventListener('change', function () { if (!$('out-card').hidden) run(); });
  $('reset').addEventListener('click', function () {
    $('src').value = '';
    $('out-card').hidden = true;
    result = [];
  });
  $('copy').addEventListener('click', function () {
    if (!result.length) return;
    navigator.clipboard.writeText($('result').value).then(
      function () { $('state').textContent = 'نُسخت القائمة. يمكنك لصقها في مرسل واتساب.'; },
      function () { $('result').select(); $('state').textContent = 'تعذّر النسخ التلقائي، يرجى النسخ يدويًا.'; }
    );
  });
  $('csv').addEventListener('click', function () {
    if (!result.length) return;
    var plus = $('fmt').value === 'plus';
    var body = 'phone\n' + result.map(function (n) { return plus ? '+' + n : n; }).join('\n');
    var url = URL.createObjectURL(new Blob(['\ufeff' + body], { type: 'text/csv;charset=utf-8' }));
    var a = document.createElement('a');
    a.href = url;
    a.download = 'pop-numbers.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  });

  document.getElementById('out').addEventListener('click', function () {
    var s = A.read();
    var go = function () { A.clear(); window.location.replace(LOGIN); };
    if (!s) return go();
    A.call('/api/session/end', s.t).then(go, go);
  });
})();
