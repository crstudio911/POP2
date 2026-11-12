(function () {
  var $ = function (id) { return document.getElementById(id); };
  var G = window.POPGuard;
  var API = String((window.POP && window.POP.api) || '').replace(/\/+$/, '');
  var q = new URLSearchParams(window.location.search);
  var from = q.get('from') || '';
  var target = '../main/main.html';
  if (/^\/(?!\/)[A-Za-z0-9._~\-\/]*(\?[A-Za-z0-9._~\-=&%+]*)?$/.test(from) && from.indexOf('/404/') < 0) target = from;
  var info = null;
  var leaving = false;
  $('yr').textContent = String(new Date().getFullYear());

  function fmt(ms, tz) {
    var o = { hour: 'numeric', minute: '2-digit', second: '2-digit', day: 'numeric', month: 'short' };
    if (tz) o.timeZone = tz;
    try {
      return new Intl.DateTimeFormat('ar-EG', o).format(new Date(ms));
    } catch (e) {
      return new Date(ms).toLocaleString();
    }
  }

  function zoneName(offset) {
    var sign = offset >= 0 ? '+' : '-';
    var a = Math.abs(offset);
    return 'UTC' + sign + Math.floor(a / 60) + (a % 60 ? ':' + ('0' + (a % 60)).slice(-2) : '');
  }

  function paint() {
    $('dev-time').textContent = fmt(Date.now());
    $('dev-zone').textContent = zoneName(-new Date().getTimezoneOffset());
    if (info) {
      $('real-time').textContent = fmt(G.now(), info.tz || undefined);
      $('real-zone').textContent = [info.tz && info.tz !== 'UTC' ? info.tz : '', typeof info.offset === 'number' ? zoneName(info.offset) : ''].filter(Boolean).join(' ');
    }
  }

  function check(manual) {
    if (leaving) return;
    var t0 = performance.now();
    $('state-text').textContent = 'جارٍ التحقق من وقت جهازك...';
    fetch(API + '/api/time', { cache: 'no-store', credentials: 'omit' })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j || !j.ok) throw new Error('x');
        var rtt = performance.now() - t0;
        G.sync(j.now, rtt);
        info = j;
        var skew = Math.abs(Date.now() - (j.now + rtt / 2));
        var tzBad = j.check && typeof j.offset === 'number' && j.offset !== -new Date().getTimezoneOffset();
        var clockBad = skew > (Number(j.skew) || 120) * 1000;
        paint();
        if (!clockBad && !tzBad) {
          leaving = true;
          $('state').classList.add('ok');
          $('state-text').textContent = 'أصبح وقت جهازك مضبوطًا، جارٍ إعادتك...';
          setTimeout(function () { window.location.replace(target); }, 900);
          return;
        }
        $('text').textContent = clockBad
          ? 'الساعة على جهازك تختلف عن الوقت الصحيح. يعتمد POP على الوقت الصحيح لحماية حسابك وحساب فترات الانتظار بدقة، يرجى ضبط التاريخ والوقت ثم المتابعة.'
          : 'المنطقة الزمنية على جهازك لا تطابق المكان الذي تتصل منه. يرجى ضبط المنطقة الزمنية تلقائيًا أو اختيار منطقتك الصحيحة ثم المتابعة.';
        $('state-text').textContent = manual ? 'ما زال وقت الجهاز غير مضبوط. راجع الخطوات بالأسفل.' : 'نتحقق من وقت جهازك تلقائيًا كل بضع ثوانٍ...';
      })
      .catch(function () {
        $('state-text').textContent = 'تعذّر التحقق الآن. تأكّد من اتصالك بالإنترنت.';
      });
  }

  $('retry').addEventListener('click', function () { check(true); });
  setInterval(paint, 1000);
  setInterval(function () { check(false); }, 5000);
  paint();
  check(false);
})();
