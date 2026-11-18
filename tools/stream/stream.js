(function () {
  var A = window.POPAuth;
  var LOGIN = '../../login/log.html';
  var ERR = {
    invalid_url: 'الرابط غير صحيح. الصق رابط صفحة كاملًا يبدأ بـ https.',
    blocked_host: 'هذا العنوان غير مسموح به.',
    page_unreachable: 'تعذّر فتح الصفحة. تأكد من الرابط، أو أن الموقع لا يحجب الخوادم.',
    no_video: 'لم نجد فيديو قابلًا للتشغيل في هذه الصفحة. لم تُحتسب هذه المحاولة من فترة الانتظار.',
    drm_protected: 'هذا الفيديو محمي بنظام DRM ولا يمكن تشغيله أو تحميله من خلال الأداة.',
    unsupported_format: 'الصفحة تستخدم صيغة بث غير مدعومة حاليًا (DASH).',
    busy: 'الخادم مشغول الآن. جرّب بعد قليل. لم تُحتسب هذه المحاولة.',
    waking: 'الخادم يستيقظ الآن. جرّب مرة أخرى بعد لحظات.',
    timeout: 'استغرق البحث وقتًا طويلًا. جرّب مرة أخرى أو جرّب رابطًا آخر. لم تُحتسب هذه المحاولة.',
    cooldown: 'أنت في فترة الانتظار الخاصة بباقتك.',
    no_access: 'هذه الأداة غير متاحة في باقتك الحالية.',
    unavailable: 'تعذّر إتمام الاستخراج الآن. يرجى المحاولة بعد قليل.',
    rate: 'طلبات كثيرة في وقت قصير. انتظر قليلًا ثم أعد المحاولة.',
    network: 'تعذّر الاتصال. يرجى التحقق من الإنترنت.'
  };
  var KIND = { hls: 'بث HLS', mp4: 'MP4', webm: 'WebM' };
  var $ = function (id) { return document.getElementById(id); };
  var plan = 'free';
  var limits = {};
  var nextAt = 0;
  var cdTimer = null;
  var busy = false;
  var items = [];
  var current = 0;
  var canDownload = false;
  var hls = null;
  var dlCtl = null;
  var started = 0;
  var clock = null;

  var session = A.read();
  if (!session) { leave(); return; }

  function leave() { A.clear(); window.location.replace(LOGIN); }
  function show() { $('gate').hidden = true; $('top').hidden = false; $('view').hidden = false; }
  function say(t) { $('state').textContent = t || ''; }
  function pstate(t) { $('p-state').textContent = t || ''; }

  var LEVELS = { 1: 'المستوى 1: قراءة كود الصفحة', 2: 'المستوى 2: متصفح حقيقي', 3: 'المستوى 3: بحث عميق' };

  function renderPlan() {
    $('pb-name').textContent = 'باقة ' + A.planName(plan);
    var level = Number(limits.level) || 1;
    var parts = [LEVELS[level] || LEVELS[1]];
    parts.push(Number(limits.download) === 1 ? 'التحميل متاح' : 'تشغيل فقط بدون تحميل');
    parts.push(Number(limits.cooldown) > 0 ? 'الانتظار بين كل استخراج والتالي: ' + limits.cooldown + ' دقيقة' : 'دون فترة انتظار');
    $('pb-list').textContent = parts.join(' · ');
    $('pb-up').hidden = plan === 'unlimited';
    tickCooldown();
  }

  function tickCooldown() {
    var left = nextAt - A.now();
    if (left > 0) {
      $('pb-cd').hidden = false;
      if (!busy && window.POPBusy) window.POPBusy.button($('go'), false);
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

  A.access('stream', { login: LOGIN, home: '../../main/main.html' }, function (r) {
    plan = r.plan || 'free';
    limits = r.limits || {};
    nextAt = Number(r.nextAt) || 0;
    renderPlan();
    show();
  });
  $('out').addEventListener('click', function () { A.call('/api/session/end', session.t).then(leave, leave); });

  var STAGES = [
    [0, 'نقرأ الصفحة ونبحث عن الفيديو'],
    [6, 'نفحص الإطارات والمشغلات داخل الصفحة'],
    [16, 'نشغّل الصفحة في متصفح حقيقي لالتقاط الفيديو'],
    [34, 'نجرب طرقًا أعمق، لحظات ونعرض لك النتيجة'],
    [60, 'الموقع بطيء، ما زلنا نحاول']
  ];
  function tick() {
    if (!busy) return;
    var sec = started ? Math.floor((Date.now() - started) / 1000) : 0;
    var stage = STAGES[0][1];
    STAGES.forEach(function (s) { if (sec >= s[0]) stage = s[1]; });
    say(stage + '... ' + sec + ' ث');
  }

  function normalize(v) {
    v = String(v || '').trim();
    if (!v) return '';
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(v)) v = 'https://' + v;
    return v;
  }

  function find(ev) {
    ev.preventDefault();
    if (busy) return;
    if (nextAt > A.now()) { say(ERR.cooldown + ' متاح عند ' + A.fmtAt(nextAt) + '.'); return; }
    var url = normalize($('url').value);
    if (!url || !/^https?:\/\/[^\s]+\.[^\s]+/i.test(url)) { say(ERR.invalid_url); return; }
    busy = true;
    $('go').disabled = true;
    started = Date.now();
    clearInterval(clock);
    clock = setInterval(tick, 1000);
    tick();
    A.call('/api/stream/find', session.t, { url: url }).then(function (r) {
      busy = false; started = 0; clearInterval(clock);
      if (!r.ok) {
        if (r.error === 'invalid_session') return leave();
        if (r.error === 'cooldown' && r.nextAt) nextAt = Number(r.nextAt) || 0;
        say(ERR[r.error] || ERR.unavailable);
        tickCooldown();
        return;
      }
      if (r.nextAt) nextAt = Number(r.nextAt) || 0;
      items = r.items || [];
      canDownload = !!r.download;
      say('تم العثور على ' + items.length + (items.length === 1 ? ' فيديو.' : ' مصادر فيديو.'));
      $('v-title').textContent = r.title || '';
      buildSources();
      open(0);
      $('play-card').hidden = false;
      $('play-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
      tickCooldown();
    });
  }

  function buildSources() {
    var sel = $('src');
    sel.textContent = '';
    items.forEach(function (it, i) {
      var o = document.createElement('option');
      o.value = String(i);
      o.textContent = 'المصدر ' + (i + 1) + ' - ' + (KIND[it.kind] || it.kind);
      sel.appendChild(o);
    });
    $('src-wrap').hidden = items.length < 2;
  }

  function destroyHls() {
    if (hls) { try { hls.destroy(); } catch (e) {} hls = null; }
  }

  function open(i) {
    var it = items[i];
    if (!it) return;
    current = i;
    $('src').value = String(i);
    var v = $('vid');
    destroyHls();
    v.pause();
    v.removeAttribute('src');
    v.load();
    $('q-wrap').hidden = true;
    $('kind-pill').textContent = KIND[it.kind] || it.kind;
    pstate('');
    $('dl').hidden = !canDownload;
    $('dl-lock').hidden = canDownload;
    if (it.kind === 'hls') {
      if (window.Hls && window.Hls.isSupported()) {
        hls = new window.Hls({ enableWorker: false, lowLatencyMode: false, maxBufferLength: 40 });
        hls.on(window.Hls.Events.MANIFEST_PARSED, function () { fillQuality(); });
        hls.on(window.Hls.Events.ERROR, function (e, d) {
          if (d && d.fatal) fail(i);
        });
        hls.loadSource(it.src);
        hls.attachMedia(v);
      } else if (v.canPlayType('application/vnd.apple.mpegurl')) {
        v.src = it.src;
      } else {
        pstate('متصفحك لا يدعم هذا النوع من البث.');
      }
    } else {
      v.src = it.src;
    }
    v.playbackRate = Number($('speed').value) || 1;
  }

  function fail(i) {
    if (i !== current) return;
    if (current + 1 < items.length) {
      pstate('تعذّر تشغيل هذا المصدر، ننتقل إلى المصدر التالي.');
      open(current + 1);
    } else {
      pstate('تعذّر تشغيل الفيديو. قد يكون الرابط انتهى أو أن الموقع يمنع التشغيل خارجه. جرّب الاستخراج مرة أخرى.');
    }
  }

  function fillQuality() {
    var sel = $('quality');
    sel.textContent = '';
    if (!hls || (Number(limits.level) || 1) < 2 || hls.levels.length < 2) { $('q-wrap').hidden = true; return; }
    var a = document.createElement('option');
    a.value = '-1'; a.textContent = 'تلقائي';
    sel.appendChild(a);
    hls.levels.forEach(function (l, idx) {
      var o = document.createElement('option');
      o.value = String(idx);
      o.textContent = l.height ? l.height + 'p' : Math.round(l.bitrate / 1000) + 'k';
      sel.appendChild(o);
    });
    $('q-wrap').hidden = false;
  }

  $('src').addEventListener('change', function () { open(Number(this.value) || 0); });
  $('quality').addEventListener('change', function () { if (hls) hls.currentLevel = Number(this.value); });
  $('speed').addEventListener('change', function () { $('vid').playbackRate = Number(this.value) || 1; });
  $('vid').addEventListener('error', function () { if ((items[current] || {}).kind !== 'hls') fail(current); });
  $('pip').addEventListener('click', function () {
    var v = $('vid');
    if (document.pictureInPictureElement) { document.exitPictureInPicture().catch(function () {}); return; }
    if (v.requestPictureInPicture) v.requestPictureInPicture().catch(function () { pstate('تعذّر فتح النافذة الصغيرة.'); });
    else pstate('متصفحك لا يدعم النافذة الصغيرة.');
  });

  function saveBlob(blob, name) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  function progress(frac, text) {
    $('dl-prog').hidden = false;
    $('dl-fill').style.width = Math.round(Math.max(0, Math.min(1, frac)) * 100) + '%';
    $('dl-text').textContent = text;
  }

  function parseHex(s) {
    s = String(s || '').replace(/^0x/i, '');
    if (s.length % 2) s = '0' + s;
    var out = new Uint8Array(16);
    var bytes = [];
    for (var i = 0; i < s.length; i += 2) bytes.push(parseInt(s.substr(i, 2), 16));
    out.set(bytes.slice(-16), 16 - Math.min(16, bytes.length));
    return out;
  }

  function seqIv(n) {
    var iv = new Uint8Array(16);
    var v = new DataView(iv.buffer);
    v.setUint32(12, n >>> 0);
    return iv;
  }

  function getText(url, signal) {
    return fetch(url, { signal: signal, credentials: 'omit' }).then(function (r) {
      if (!r.ok) throw new Error('http');
      return r.text();
    });
  }

  function getBuf(url, signal) {
    return fetch(url, { signal: signal, credentials: 'omit' }).then(function (r) {
      if (!r.ok) throw new Error('http');
      return r.arrayBuffer();
    });
  }

  function pickVariant(text) {
    var lines = text.split(/\r?\n/);
    var list = [];
    for (var i = 0; i < lines.length; i++) {
      if (lines[i].indexOf('#EXT-X-STREAM-INF') === 0) {
        var j = i + 1;
        while (j < lines.length && (!lines[j].trim() || lines[j].charAt(0) === '#')) j++;
        var h = /RESOLUTION=\d+x(\d+)/.exec(lines[i]);
        var b = /BANDWIDTH=(\d+)/.exec(lines[i]);
        if (lines[j]) list.push({ url: lines[j].trim(), h: h ? Number(h[1]) : 0, b: b ? Number(b[1]) : 0 });
      }
    }
    if (!list.length) return null;
    var want = hls && hls.currentLevel >= 0 && hls.levels[hls.currentLevel] ? hls.levels[hls.currentLevel].height : 0;
    list.sort(function (a, b) { return b.h - a.h || b.b - a.b; });
    if (want) {
      for (var k = 0; k < list.length; k++) if (list[k].h === want) return list[k].url;
    }
    return list[0].url;
  }

  function parseMedia(text) {
    var lines = text.split(/\r?\n/);
    var segs = [];
    var map = '';
    var key = null;
    var seq = 0;
    var pending = false;
    lines.forEach(function (l) {
      l = l.trim();
      if (l.indexOf('#EXT-X-MEDIA-SEQUENCE:') === 0) seq = Number(l.split(':')[1]) || 0;
      else if (l.indexOf('#EXT-X-MAP:') === 0) { var m = /URI="([^"]+)"/.exec(l); if (m) map = m[1]; }
      else if (l.indexOf('#EXT-X-KEY:') === 0) {
        var method = (/METHOD=([A-Z0-9-]+)/.exec(l) || [])[1];
        if (method === 'AES-128') {
          var u = /URI="([^"]+)"/.exec(l);
          var iv = /IV=(0x[0-9a-fA-F]+)/.exec(l);
          key = { uri: u ? u[1] : '', iv: iv ? iv[1] : '', buf: null };
        } else if (method === 'NONE') key = null;
        else key = { bad: true };
      } else if (l.indexOf('#EXTINF') === 0) pending = true;
      else if (l && l.charAt(0) !== '#' && pending) {
        segs.push({ url: l, seq: seq++, key: key });
        pending = false;
      }
    });
    return { segs: segs, map: map };
  }

  function decrypt(buf, key, seq) {
    var iv = key.iv ? parseHex(key.iv) : seqIv(seq);
    return crypto.subtle.decrypt({ name: 'AES-CBC', iv: iv }, key.cryptoKey, buf);
  }

  function downloadHls(it) {
    var ctl = new AbortController();
    dlCtl = ctl;
    $('dl').disabled = true;
    progress(0, 'نجهز قائمة التشغيل...');
    var parts = [];
    var total = 0;
    var MAX = 1.6 * 1024 * 1024 * 1024;
    var writer = null;
    var ext = 'ts';
    var first = it.src;
    return getText(first, ctl.signal).then(function (t) {
      var v = pickVariant(t);
      return v ? getText(v, ctl.signal) : t;
    }).then(function (text) {
      var media = parseMedia(text);
      if (!media.segs.length) throw new Error('empty');
      if (media.segs.some(function (s) { return s.key && s.key.bad; })) throw new Error('drm');
      if (media.map) ext = 'mp4';
      var keys = {};
      media.segs.forEach(function (s) { if (s.key && s.key.uri) keys[s.key.uri] = null; });
      var keyList = Object.keys(keys);
      return Promise.all(keyList.map(function (u) {
        return getBuf(u, ctl.signal).then(function (b) { return crypto.subtle.importKey('raw', b, 'AES-CBC', false, ['decrypt']); }).then(function (k) { keys[u] = k; });
      })).then(function () {
        media.segs.forEach(function (s) { if (s.key && s.key.uri) s.key = { iv: s.key.iv, cryptoKey: keys[s.key.uri] }; });
        var open = window.showSaveFilePicker ? window.showSaveFilePicker({ suggestedName: 'pop-video.' + ext }).then(function (h) { return h.createWritable(); }).then(function (w) { writer = w; }, function (e) { if (e && e.name === 'AbortError') throw e; writer = null; }) : Promise.resolve();
        return open.then(function () { return media; });
      });
    }).then(function (media) {
      var segs = media.segs;
      var results = new Array(segs.length);
      var next = 0;
      var written = 0;
      var done = 0;
      var chain = Promise.resolve();
      function flush() {
        while (results[written]) {
          var data = results[written];
          results[written] = null;
          written++;
          total += data.byteLength;
          if (writer) {
            (function (d) { chain = chain.then(function () { return writer.write(d); }); })(data);
          } else {
            parts.push(data);
            if (total > MAX) throw new Error('big');
          }
        }
      }
      function fetchSeg(i) {
        var s = segs[i];
        return getBuf(s.url, ctl.signal).then(function (b) {
          return s.key && s.key.cryptoKey ? decrypt(b, s.key, s.seq) : b;
        });
      }
      function worker() {
        if (next >= segs.length || ctl.signal.aborted) return Promise.resolve();
        var i = next++;
        var tries = 0;
        function go() {
          return fetchSeg(i).catch(function (e) {
            if (ctl.signal.aborted || tries++ >= 2) throw e;
            return new Promise(function (r) { setTimeout(r, 800); }).then(go);
          });
        }
        return go().then(function (b) {
          results[i] = b;
          done++;
          flush();
          progress(done / segs.length, 'تم تحميل ' + done + ' من ' + segs.length + ' مقطعًا');
          return worker();
        });
      }
      var start = media.map ? getBuf(media.map, ctl.signal) : Promise.resolve(null);
      return start.then(function (initBuf) {
        if (initBuf) {
          if (writer) chain = chain.then(function () { return writer.write(initBuf); });
          else parts.push(initBuf);
          total += initBuf.byteLength;
        }
        var pool = [];
        for (var n = 0; n < 4; n++) pool.push(worker());
        return Promise.all(pool);
      }).then(function () { return chain; }).then(function () {
        if (writer) return writer.close();
        saveBlob(new Blob(parts, { type: ext === 'mp4' ? 'video/mp4' : 'video/mp2t' }), 'pop-video.' + ext);
      });
    }).then(function () {
      progress(1, 'اكتمل التحميل.');
    }, function (e) {
      if (writer) { try { writer.abort(); } catch (x) {} }
      var msg = ctl.signal.aborted || (e && e.name === 'AbortError') ? 'تم إيقاف التحميل.' : e && e.message === 'drm' ? 'هذا الفيديو محمي ولا يمكن تحميله.' : e && e.message === 'big' ? 'الفيديو كبير جدًا للتحميل داخل المتصفح. استخدم متصفح Chrome أو Edge على الكمبيوتر.' : 'تعذّر إكمال التحميل. جرّب مرة أخرى.';
      progress(0, msg);
    }).then(function () {
      dlCtl = null;
      $('dl').disabled = false;
    });
  }

  $('dl').addEventListener('click', function () {
    var it = items[current];
    if (!it || !canDownload || dlCtl) return;
    if (it.kind === 'hls') { downloadHls(it); return; }
    if (!it.dl) { pstate('التحميل غير متاح في باقتك.'); return; }
    var a = document.createElement('a');
    a.href = it.dl; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
  });
  $('dl-stop').addEventListener('click', function () { if (dlCtl) dlCtl.abort(); });

  $('form').addEventListener('submit', find);
})();
