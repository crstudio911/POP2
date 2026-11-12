(function () {
  var A = window.POPAuth;
  var LOGIN = '../../login/log.html';
  var KINDS = [
    ['clinics', 'العيادات والأطباء'],
    ['pharmacies', 'الصيدليات'],
    ['hospitals', 'المستشفيات'],
    ['restaurants', 'المطاعم'],
    ['cafes', 'المقاهي'],
    ['gyms', 'الصالات والأندية الرياضية'],
    ['beauty', 'صالونات التجميل والحلاقة'],
    ['clothes', 'متاجر الملابس'],
    ['supermarkets', 'المتاجر الكبرى والبقالات'],
    ['electronics', 'متاجر الهواتف والإلكترونيات'],
    ['car_dealers', 'معارض السيارات ووكالاتها'],
    ['car_repair', 'ورش صيانة السيارات'],
    ['schools', 'المدارس ورياض الأطفال'],
    ['education', 'المراكز التعليمية'],
    ['hotels', 'الفنادق'],
    ['offices', 'الشركات والمكاتب'],
    ['contractors', 'شركات المقاولات'],
    ['lawyers', 'مكاتب المحاماة'],
    ['real_estate', 'المكاتب العقارية'],
    ['furniture', 'متاجر الأثاث'],
    ['shops', 'أي نشاط تجاري']
  ];
  var ERR = {
    area_not_found: 'لم يُعثر على هذه المنطقة، يرجى كتابتها بصيغة أخرى.',
    area_too_big: 'المنطقة واسعة جدًا، يرجى كتابة مدينة أو حي بدلًا من دولة.',
    maps_busy: 'خدمة الخرائط مشغولة حاليًا. يرجى المحاولة بعد بضع دقائق، أو تضييق المنطقة. لم تُحتسب هذه المحاولة من فترة الانتظار.',
    cooldown: 'أنت في فترة الانتظار الخاصة بباقتك، ويمكنك البحث مجددًا بعد انتهائها.',
    invalid_request: 'يرجى مراجعة بيانات البحث.',
    no_access: 'هذه الأداة غير متاحة في باقتك الحالية.',
    unavailable: 'تعذّر إتمام البحث الآن. يرجى المحاولة بعد قليل.',
    network: 'تعذّر الاتصال. يرجى التحقق من الإنترنت.'
  };
  var $ = function (id) { return document.getElementById(id); };
  var list = [];
  var busy = false;
  var plan = 'free';
  var limits = {};
  var nextAt = 0;
  var cdTimer = null;

  var session = A.read();
  if (!session) { leave(); return; }

  function leave() { A.clear(); window.location.replace(LOGIN); }
  function show() { $('gate').hidden = true; $('top').hidden = false; $('view').hidden = false; }

  function renderPlan() {
    $('pb-name').textContent = 'باقة ' + A.planName(plan);
    var items = [];
    items.push(Number(limits.results) > 0 ? 'النتائج في كل بحث: حتى ' + limits.results : 'النتائج في كل بحث: كل المتاح');
    items.push(Number(limits.cooldown) > 0 ? 'الانتظار بين كل بحث والتالي: ' + limits.cooldown + ' دقيقة' : 'دون فترة انتظار');
    $('pb-list').textContent = items.join(' · ');
    $('pb-up').hidden = plan === 'unlimited';
    tickCooldown();
  }

  function tickCooldown() {
    var left = nextAt - A.now();
    if (left > 0) {
      $('pb-cd').hidden = false;
      $('pb-cd-left').textContent = A.fmtLeft(left);
      $('pb-cd-at').textContent = 'عند ' + A.fmtAt(nextAt);
      if (!busy) $('go').disabled = true;
      if (!cdTimer) cdTimer = setInterval(tickCooldown, 1000);
    } else {
      $('pb-cd').hidden = true;
      if (!busy) $('go').disabled = false;
      if (cdTimer) { clearInterval(cdTimer); cdTimer = null; }
    }
  }

  A.access('leads', { login: LOGIN, home: '../../main/main.html' }, function (r) {
    plan = r.plan || 'free';
    limits = r.limits || {};
    nextAt = Number(r.nextAt) || 0;
    renderPlan();
    show();
  });
  $('out').addEventListener('click', function () { A.call('/api/session/end', session.t).then(leave, leave); });

  KINDS.forEach(function (k) {
    var o = document.createElement('option');
    o.value = k[0]; o.textContent = k[1];
    $('kind').appendChild(o);
  });

  var sayText = '';
  var started = 0;
  var clock = null;
  function say(t) { sayText = t; tick(); }
  function tick() {
    var sec = started ? Math.floor((Date.now() - started) / 1000) : 0;
    $('state').textContent = sayText + (busy && sec >= 5 ? ' (' + sec + ' ثانية)' : '');
  }

  function search(ev) {
    ev.preventDefault();
    if (busy) return;
    if (nextAt > A.now()) { say(ERR.cooldown + ' متاح عند ' + A.fmtAt(nextAt) + '.'); return; }
    var city = $('city').value.trim();
    var word = $('word').value.trim().replace(/["\\]/g, '');
    if (!city) return;
    busy = true; $('go').disabled = true;
    started = Date.now();
    clearInterval(clock);
    clock = setInterval(tick, 1000);
    say('جارٍ البحث وجمع الأماكن... قد يستغرق البحث بضع دقائق في المناطق الكبيرة، يرجى إبقاء الصفحة مفتوحة');
    A.call('/api/leads/search', session.t, { city: city, kind: $('kind').value, word: word }).then(function (r) {
      busy = false; started = 0; clearInterval(clock);
      if (!r.ok) {
        if (r.error === 'invalid_session') return leave();
        if (r.error === 'cooldown' && r.nextAt) nextAt = Number(r.nextAt) || 0;
        say(ERR[r.error] || ERR.unavailable);
        tickCooldown();
        return;
      }
      if (r.nextAt) nextAt = Number(r.nextAt) || 0;
      list = (r.items || []).map(function (x) {
        return { name: x.name || 'دون اسم', phone: x.phone, address: x.address || '', map: x.map || '' };
      });
      render();
      var msg = list.length ? 'عدد الأماكن التي لها رقم' + (r.area ? ' في ' + r.area : '') + ': ' + list.length + '.' : 'لم يُعثر على أماكن لها أرقام هنا. جرّب منطقة أوسع أو نشاطًا آخر. لم تُحتسب هذه المحاولة من فترة الانتظار.';
      if (r.capped && r.cap) msg += ' عرضنا أول ' + r.cap + ' نتيجة بحسب حد باقتك، ويمكنك الترقية للحصول على نتائج أكثر.';
      say(msg);
      tickCooldown();
    });
  }

  function render() {
    var tb = $('rows');
    tb.textContent = '';
    list.forEach(function (r) {
      var tr = document.createElement('tr');
      [r.name, '+' + r.phone, r.address || '-'].forEach(function (v) {
        var td = document.createElement('td'); td.textContent = v; tr.appendChild(td);
      });
      var td = document.createElement('td');
      if (r.map) { var a = document.createElement('a'); a.href = r.map; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = 'فتح'; td.appendChild(a); }
      tr.appendChild(td);
      tb.appendChild(tr);
    });
    $('count').textContent = list.length + ' نتيجة';
    $('res-card').hidden = !list.length;
  }

  function esc(v) { return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  $('xls').addEventListener('click', function () {
    var h = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"></head><body><table dir="rtl"><tr><th>الاسم</th><th>رقم الواتساب</th><th>العنوان</th><th>الموقع على الخريطة</th></tr>';
    list.forEach(function (r) {
      h += '<tr><td>' + esc(r.name) + '</td><td style="mso-number-format:\'\\@\'">' + r.phone + '</td><td>' + esc(r.address) + '</td><td>' + esc(r.map) + '</td></tr>';
    });
    h += '</table></body></html>';
    var url = URL.createObjectURL(new Blob(['\ufeff' + h], { type: 'application/vnd.ms-excel' }));
    var a = document.createElement('a');
    a.href = url; a.download = 'POP-leads.xls';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  });

  $('copy').addEventListener('click', function () {
    var t = list.map(function (r) { return r.phone; }).join('\n');
    navigator.clipboard.writeText(t).then(function () { say('نُسخت الأرقام. افتح أداة واتساب والصقها في خانة الأرقام.'); }, function () { say('تعذّر النسخ، يرجى تنزيل الجدول بدلًا من ذلك.'); });
  });

  $('form').addEventListener('submit', search);
})();
