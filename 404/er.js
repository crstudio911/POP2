(function () {
  (function lockZoom() {
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
  })();
  var $ = function (id) { return document.getElementById(id); };
  var q = new URLSearchParams(window.location.search);
  var kind = q.get('k') === 'server' ? 'server' : q.get('k') === 'offline' ? 'offline' : q.get('k') === 'missing' ? 'missing' : 'net';
  var from = q.get('from') || '';
  var target = '../main/main.html';
  if (/^\/(?!\/)[A-Za-z0-9._~\-\/]*(\?[A-Za-z0-9._~\-=&%+]*)?$/.test(from) && from.indexOf('/404/') < 0) target = from;
  var leaving = false;

  $('yr').textContent = String(new Date().getFullYear());

  var TEXT = {
    offline: ['انقطع الاتصال بالإنترنت', 'يبدو أن جهازك غير متصل بالإنترنت الآن. تحقّق من الشبكة، وسنعيدك تلقائيًا إلى الصفحة التي كنت فيها فور عودة الاتصال.'],
    net: ['تعذّر الوصول إلى خدمات POP', 'لم نتمكّن من الاتصال بخوادم POP. قد يكون الاتصال ضعيفًا أو متقطعًا. سنحاول مجددًا تلقائيًا، ويمكنك إعادة المحاولة يدويًا.'],
    server: ['الخدمة غير متاحة مؤقتًا', 'تواجه خدمات POP ضغطًا أو صيانة قصيرة الآن. بياناتك محفوظة، ويمكنك إعادة المحاولة بعد لحظات.'],
    missing: ['الصفحة غير موجودة', 'الرابط الذي فتحته غير صحيح أو لم يعد متاحًا. يمكنك العودة إلى الصفحة الرئيسية أو لوحة الأدوات.']
  };
  $('title').textContent = TEXT[kind][0];
  $('text').textContent = TEXT[kind][1];
  document.title = TEXT[kind][0] + ' - POP';
  if (kind === 'server') $('icon').classList.add('server');

  function back() {
    if (leaving) return;
    leaving = true;
    $('state').classList.add('ok');
    $('state-text').textContent = 'عاد الاتصال، جارٍ إعادتك...';
    setTimeout(function () { window.location.replace(target); }, 900);
  }

  function probe() {
    if (leaving || kind === 'missing') return;
    if (navigator.onLine === false) {
      $('state-text').textContent = 'في انتظار عودة الاتصال...';
      return;
    }
    $('state-text').textContent = 'جارٍ التحقق من الاتصال...';
    fetch('../config.js?r=' + Date.now(), { cache: 'no-store', credentials: 'omit' }).then(function (r) {
      if (r.ok && kind !== 'server') back();
      else if (r.ok) $('state-text').textContent = 'الاتصال سليم. اضغط «إعادة المحاولة» للمتابعة.';
      else $('state-text').textContent = 'ما زال الاتصال غير مستقر...';
    }, function () {
      $('state-text').textContent = 'ما زال الاتصال غير مستقر...';
    });
  }

  if (kind === 'missing') {
    $('state').hidden = true;
    $('retry').textContent = 'الصفحة الرئيسية';
    target = '../index.html';
    var tips = document.querySelector('.er-tips');
    if (tips) tips.hidden = true;
  }

  $('retry').addEventListener('click', function () {
    if (navigator.onLine === false) {
      $('state-text').textContent = 'جهازك ما زال غير متصل بالإنترنت.';
      return;
    }
    leaving = false;
    back();
  });
  window.addEventListener('online', probe);
  setInterval(probe, 6000);
  probe();
})();
