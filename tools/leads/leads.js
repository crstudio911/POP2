(function () {
  var A = window.POPAuth;
  var LOGIN = '../../login/log.html';
  var OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];
  var ROUNDS = 3;
  var WAIT_MS = 240000;
  var KINDS = [
    ['عيادات ودكاترة', '["amenity"~"^(clinic|doctors|dentist)$"]'],
    ['صيدليات', '["amenity"="pharmacy"]'],
    ['مستشفيات', '["amenity"="hospital"]'],
    ['مطاعم', '["amenity"="restaurant"]'],
    ['كافيهات', '["amenity"="cafe"]'],
    ['جيم ونوادي رياضية', '["leisure"="fitness_centre"]'],
    ['صالونات وكوافير', '["shop"~"^(hairdresser|beauty)$"]'],
    ['محلات ملابس', '["shop"="clothes"]'],
    ['سوبر ماركت', '["shop"~"^(supermarket|convenience)$"]'],
    ['محلات موبايلات وإلكترونيات', '["shop"~"^(mobile_phone|electronics|computer)$"]'],
    ['معارض وتوكيلات عربيات', '["shop"="car"]'],
    ['ورش وصيانة عربيات', '["shop"="car_repair"]'],
    ['مدارس وحضانات', '["amenity"~"^(school|kindergarten)$"]'],
    ['مراكز تعليمية', '["amenity"~"^(college|language_school|training)$"]'],
    ['فنادق', '["tourism"~"^(hotel|guest_house)$"]'],
    ['شركات ومكاتب', '["office"]'],
    ['شركات مقاولات', '["craft"~"^(builder|construction)$"]'],
    ['مكاتب محاماة', '["office"="lawyer"]'],
    ['مكاتب عقارات', '["office"="estate_agent"]'],
    ['محلات أثاث', '["shop"~"^(furniture|interior_decoration)$"]'],
    ['أي نشاط تجاري', '["shop"]']
  ];
  var MAX = 2000;
  var $ = function (id) { return document.getElementById(id); };
  var list = [];
  var busy = false;

  var session = A.read();
  if (!session) { leave(); return; }

  function leave() { A.clear(); window.location.replace(LOGIN); }
  function show() { $('gate').hidden = true; $('top').hidden = false; $('view').hidden = false; }

  A.call('/api/session/check', session.t).then(function (r) {
    if (!r.ok && r.error !== 'network') { leave(); return; }
    if (r.ok) {
      var name = [r.firstName, r.lastName].filter(Boolean).join(' ');
      $('who').textContent = name ? name + ' - ' + r.email : r.email;
    }
    show();
  });
  $('out').addEventListener('click', function () { A.call('/api/session/end', session.t).then(leave, leave); });

  KINDS.forEach(function (k, i) {
    var o = document.createElement('option');
    o.value = i; o.textContent = k[0];
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
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function area(city, n) {
    n = n || 0;
    var u = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&accept-language=ar&q=' + encodeURIComponent(city);
    return fetch(u, { headers: { Accept: 'application/json' }, credentials: 'omit' }).then(function (r) {
      if (!r.ok) throw new Error('geo');
      return r.json();
    }).catch(function (e) {
      if (n < 3) return sleep(3000 * (n + 1)).then(function () { return area(city, n + 1); }).then(function (x) { return { retried: x }; });
      throw e;
    }).then(function (j) {
      if (j && j.retried) return j.retried;
      if (!j || !j[0] || !j[0].boundingbox) throw new Error('nf');
      var b = j[0].boundingbox.map(Number);
      return { s: b[0], n: b[1], w: b[2], e: b[3], name: j[0].display_name };
    });
  }

  function overpass(q, i) {
    i = i || 0;
    var ctl = window.AbortController ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, WAIT_MS) : null;
    var srv = i % OVERPASS.length;
    return fetch(OVERPASS[srv], { signal: ctl ? ctl.signal : undefined, method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, credentials: 'omit' })
      .then(function (r) { if (!r.ok) throw new Error('op'); return r.json(); })
      .then(function (j) { clearTimeout(timer); return j; }, function (e) {
        clearTimeout(timer);
        if (i + 1 < OVERPASS.length * ROUNDS) {
          say('خدمة الخرائط عليها ضغط، بنجرب سيرفر تاني... كمل استنى، البحث ممكن ياخد كام دقيقة');
          return sleep(i + 1 < OVERPASS.length ? 1500 : 8000).then(function () { return overpass(q, i + 1); });
        }
        throw e;
      });
  }

  function cleanPhone(raw) {
    var d = String(raw || '').split(/[;,\/]/)[0].replace(/[^\d+]/g, '');
    if (d.indexOf('00') === 0) d = d.slice(2);
    d = d.replace(/^\+/, '');
    if (/^01[0125]\d{8}$/.test(d)) d = '2' + d;
    if (/^05\d{8}$/.test(d)) d = '966' + d.slice(1);
    return d.length >= 8 && d.length <= 15 ? d : '';
  }

  function addr(t) {
    var parts = [t['addr:street'] && ((t['addr:housenumber'] ? t['addr:housenumber'] + ' ' : '') + t['addr:street']), t['addr:suburb'] || t['addr:district'], t['addr:city']];
    return parts.filter(Boolean).join('، ') || t['addr:full'] || '';
  }

  function search(ev) {
    ev.preventDefault();
    if (busy) return;
    var city = $('city').value.trim();
    var word = $('word').value.trim().replace(/["\\]/g, '');
    if (!city) return;
    busy = true; $('go').disabled = true;
    started = Date.now();
    clearInterval(clock);
    clock = setInterval(tick, 1000);
    say('بندور على المنطقة...');
    area(city).then(function (b) {
      if ((b.n - b.s) * (b.e - b.w) > 9) throw new Error('big');
      say('بنجمع الأماكن في ' + b.name + '... البحث بياخد وقته، سيب الصفحة مفتوحة');
      var tag = KINDS[$('kind').value][1];
      var nm = word ? '["name"~"' + word + '",i]' : '';
      var bb = '(' + b.s + ',' + b.w + ',' + b.n + ',' + b.e + ')';
      var q = '[out:json][timeout:180];(nwr' + tag + '["phone"]' + nm + bb + ';nwr' + tag + '["contact:phone"]' + nm + bb + ';nwr' + tag + '["contact:whatsapp"]' + nm + bb + ';nwr' + tag + '["contact:mobile"]' + nm + bb + ';);out center tags ' + MAX + ';';
      return overpass(q);
    }).then(function (j) {
      var seen = {};
      list = [];
      (j.elements || []).forEach(function (el) {
        var t = el.tags || {};
        var p = cleanPhone(t['contact:whatsapp'] || t['contact:mobile'] || t.phone || t['contact:phone'] || t.mobile);
        if (!p || seen[p]) return;
        seen[p] = 1;
        var lat = el.lat || (el.center && el.center.lat);
        var lon = el.lon || (el.center && el.center.lon);
        list.push({ name: t['name:ar'] || t.name || 'بدون اسم', phone: p, address: addr(t), map: lat ? 'https://www.google.com/maps?q=' + lat + ',' + lon : '' });
      });
      render();
      say(list.length ? 'لقينا ' + list.length + ' مكان ليه رقم.' : 'مالقيناش أماكن ليها أرقام هنا. جرب منطقة أكبر أو نشاط تاني.');
    }).catch(function (e) {
      var m = e && e.message;
      say(m === 'nf' ? 'مالقيناش المنطقة دي، اكتبها بشكل تاني.' : m === 'big' ? 'المنطقة كبيرة أوي، اكتب مدينة أو حي بدل دولة.' : 'جربنا كل سيرفرات الخرائط وكلها مشغولة دلوقتي. جرب تاني بعد كام دقيقة، أو صغّر المنطقة.');
    }).then(function () { busy = false; started = 0; clearInterval(clock); tick(); $('go').disabled = false; });
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
      if (r.map) { var a = document.createElement('a'); a.href = r.map; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = 'افتح'; td.appendChild(a); }
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
    navigator.clipboard.writeText(t).then(function () { say('الأرقام اتنسخت. افتح أداة الواتساب والصقها في خانة الأرقام.'); }, function () { say('ماقدرناش ننسخ، نزل الشيت بدل كده.'); });
  });

  $('form').addEventListener('submit', search);
})();
