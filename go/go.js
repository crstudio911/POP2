(function () {
  var $ = function (id) { return document.getElementById(id); };
  var q = new URLSearchParams(window.location.search);
  var kind = q.get('k') || 'missing';
  var alias = String(q.get('a') || '').toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/.test(alias)) alias = '';
  var LOCK = '<svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="10.5" width="16" height="10" rx="2.5"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3M12 15v2"/></svg>';
  var CLOCK = '<svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
  var PAGES = {
    missing: ['هذا الرابط غير موجود', 'ربما كُتب الرابط بشكل خاطئ، أو حذفه صاحبه، أو أُوقف لمخالفته شروط الاستخدام.', 'gone'],
    expired: ['انتهت صلاحية هذا الرابط', 'حدّد صاحب الرابط مدة لصلاحيته وقد انتهت. تواصل معه إن كنت تحتاج إلى الرابط الجديد.', 'gone', CLOCK],
    paused: ['هذا الرابط متوقف مؤقتًا', 'أوقف صاحب الرابط عمله مؤقتًا. حاول مرة أخرى لاحقًا.', 'lock', CLOCK],
    lock: ['هذا الرابط محمي بكلمة سر', 'اكتب كلمة السر التي أرسلها لك صاحب الرابط لفتحه.', 'lock', LOCK],
    busy: ['طلبات كثيرة في وقت قصير', 'انتظر بضع ثوانٍ ثم افتح الرابط مرة أخرى.', 'lock', CLOCK],
    blocked: ['تعذّر فتح الرابط من هذا الجهاز', 'أُوقف الوصول مؤقتًا من هذا الجهاز أو الشبكة لأسباب أمنية.', 'gone', LOCK],
    down: ['تعذّر فتح الرابط الآن', 'الخدمة غير متاحة مؤقتًا. حاول بعد قليل.', 'lock', CLOCK]
  };
  var p = PAGES[kind] || PAGES.missing;
  if (kind === 'lock' && !alias) p = PAGES.missing;
  $('title').textContent = p[0];
  $('text').textContent = p[1];
  $('icon').className = 'er-icon ' + p[2];
  if (p[3]) $('icon').innerHTML = p[3];
  document.title = p[0] + ' - POP';
  $('yr').textContent = String(new Date().getFullYear());

  if ((kind === 'busy' || kind === 'down') && alias) {
    var again = document.createElement('a');
    again.className = 'btn';
    again.href = '/' + alias;
    again.textContent = 'إعادة المحاولة';
    $('actions').insertBefore(again, $('actions').firstChild);
  }
  if (kind !== 'lock' || !alias) return;

  $('form').hidden = false;
  $('pass').focus();
  var ERR = {
    wrong_password: 'كلمة السر غير صحيحة.',
    locked: 'محاولات كثيرة خاطئة. انتظر 15 دقيقة ثم حاول مرة أخرى.',
    rate: 'طلبات كثيرة في وقت قصير. انتظر قليلًا.',
    expired: PAGES.expired[0] + '.',
    paused: PAGES.paused[0] + '.',
    not_found: PAGES.missing[0] + '.',
    banned: PAGES.blocked[0] + '.'
  };
  var busy = false;
  $('form').addEventListener('submit', function (ev) {
    ev.preventDefault();
    if (busy) return;
    var pass = $('pass').value;
    if (!pass) { $('msg').textContent = 'اكتب كلمة السر أولًا.'; return; }
    busy = true;
    $('open').disabled = true;
    $('msg').textContent = 'جارٍ التحقق...';
    fetch('/api/go/unlock', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ alias: alias, password: pass }), cache: 'no-store', credentials: 'omit' })
      .then(function (res) { return res.json().catch(function () { return { ok: false }; }); })
      .then(function (r) {
        if (r && r.ok && /^https?:\/\//i.test(String(r.url || ''))) {
          $('msg').textContent = 'جارٍ فتح الرابط...';
          window.location.replace(r.url);
          return;
        }
        busy = false;
        $('open').disabled = false;
        $('pass').value = '';
        $('msg').textContent = ERR[r && r.error] || 'تعذّر فتح الرابط الآن. حاول بعد قليل.';
      }, function () {
        busy = false;
        $('open').disabled = false;
        $('msg').textContent = 'تعذّر الاتصال. تحقّق من الإنترنت.';
      });
  });
})();
