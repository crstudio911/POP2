(function () {
  var KEY = 'pop_lang';
  var CACHE = 'pop_tr_';
  var API = 'https://translate.googleapis.com/translate_a/t?client=gtx&sl=ar&tl=';
  var AR = /[\u0600-\u06FF]/;
  var ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];
  var SKIP = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEXTAREA: 1, CODE: 1, PRE: 1 };
  var RTL = { ar: 1, fa: 1, ur: 1, he: 1, ps: 1, ku: 0 };
  var CYR = { ru: 1, uk: 1, bg: 1, sr: 1, kk: 1, el: 1 };
  var LATIN = { en: 1, fr: 1, es: 1, de: 1, it: 1, pt: 1, tr: 1, id: 1, ms: 1, nl: 1, pl: 1, ro: 1, sv: 1, no: 1, da: 1, fi: 1, cs: 1, hu: 1, vi: 1, sw: 1, ha: 1, tl: 1, az: 1, uz: 1, sq: 1, bs: 1, hr: 1, sk: 1, so: 1, ku: 1, ca: 1, et: 1, lv: 1, lt: 1, sl: 1, af: 1, ga: 1, cy: 1, is: 1, mt: 1, yo: 1, zu: 1, ig: 1 };
  var LANGS = [
    ['ar', 'العربية'], ['en', 'English'], ['fr', 'Français'], ['es', 'Español'], ['de', 'Deutsch'],
    ['it', 'Italiano'], ['pt', 'Português'], ['ru', 'Русский'], ['tr', 'Türkçe'], ['fa', 'فارسی'],
    ['ur', 'اردو'], ['hi', 'हिन्दी'], ['bn', 'বাংলা'], ['id', 'Bahasa Indonesia'], ['ms', 'Bahasa Melayu'],
    ['zh-CN', '简体中文'], ['zh-TW', '繁體中文'], ['ja', '日本語'], ['ko', '한국어'], ['nl', 'Nederlands'],
    ['pl', 'Polski'], ['uk', 'Українська'], ['ro', 'Română'], ['el', 'Ελληνικά'], ['sv', 'Svenska'],
    ['no', 'Norsk'], ['da', 'Dansk'], ['fi', 'Suomi'], ['cs', 'Čeština'], ['hu', 'Magyar'],
    ['he', 'עברית'], ['th', 'ไทย'], ['vi', 'Tiếng Việt'], ['sw', 'Kiswahili'], ['ha', 'Hausa'],
    ['am', 'አማርኛ'], ['tl', 'Filipino'], ['az', 'Azərbaycan dili'], ['kk', 'Қазақ тілі'], ['uz', 'Oʻzbekcha'],
    ['sq', 'Shqip'], ['bs', 'Bosanski'], ['sr', 'Српски'], ['hr', 'Hrvatski'], ['bg', 'Български'],
    ['sk', 'Slovenčina'], ['so', 'Soomaali'], ['ps', 'پښتو'], ['ku', 'Kurdî'], ['ca', 'Català'],
    ['et', 'Eesti'], ['lv', 'Latviešu'], ['lt', 'Lietuvių'], ['sl', 'Slovenščina'], ['af', 'Afrikaans'],
    ['ta', 'தமிழ்'], ['te', 'తెలుగు'], ['mr', 'मराठी'], ['gu', 'ગુજરાતી'], ['pa', 'ਪੰਜਾਬੀ'],
    ['ml', 'മലയാളം'], ['kn', 'ಕನ್ನಡ'], ['ne', 'नेपाली'], ['si', 'සිංහල'], ['km', 'ខ្មែរ'],
    ['my', 'မြန်မာ'], ['ka', 'ქართული'], ['hy', 'Հայերեն'], ['mn', 'Монгол'], ['yo', 'Yorùbá'],
    ['zu', 'isiZulu'], ['ig', 'Igbo'], ['ga', 'Gaeilge'], ['is', 'Íslenska'], ['mt', 'Malti']
  ];

  var lang = 'ar';
  try {
    lang = localStorage.getItem(KEY) || 'ar';
  } catch (e) {}
  if (!LANGS.some(function (l) { return l[0] === lang; })) lang = 'ar';

  var root = document.documentElement;
  var active = lang !== 'ar';
  var script = lang === 'ar' || RTL[lang] ? 'arabic' : LATIN[lang] ? 'latin' : CYR[lang] ? 'cyrillic' : 'other';
  root.setAttribute('data-script', script);
  if (active) {
    root.lang = lang;
    root.dir = RTL[lang] ? 'rtl' : 'ltr';
    root.classList.add('i18n-wait');
    if (script === 'latin' || script === 'cyrillic') {
      var f = document.createElement('link');
      f.rel = 'stylesheet';
      f.href = script === 'latin'
        ? 'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,500;12..96,600;12..96,700;12..96,800&display=swap'
        : 'https://fonts.googleapis.com/css2?family=Onest:wght@400;500;600;700;800&display=swap';
      document.head.appendChild(f);
    }
  }

  var cache = {};
  if (active) {
    try {
      cache = JSON.parse(localStorage.getItem(CACHE + lang) || '{}') || {};
    } catch (e) {
      cache = {};
    }
  }

  var texts = new WeakMap();
  var attrs = new WeakMap();
  var waiting = {};
  var queue = [];
  var timer = 0;
  var inflight = 0;
  var saveTimer = 0;
  var revealed = false;

  function reveal() {
    if (revealed) return;
    revealed = true;
    root.classList.remove('i18n-wait');
  }

  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      var keys = Object.keys(cache);
      if (keys.length > 3000) {
        var keep = {};
        keys.slice(-2000).forEach(function (k) { keep[k] = cache[k]; });
        cache = keep;
      }
      try {
        localStorage.setItem(CACHE + lang, JSON.stringify(cache));
      } catch (e) {}
    }, 600);
  }

  function want(text, cb) {
    if (Object.prototype.hasOwnProperty.call(cache, text)) {
      cb(cache[text]);
      return;
    }
    if (waiting[text]) {
      waiting[text].push(cb);
      return;
    }
    waiting[text] = [cb];
    queue.push(text);
    clearTimeout(timer);
    timer = setTimeout(flush, 40);
  }

  function flush() {
    while (queue.length) {
      var batch = [];
      var size = 0;
      while (queue.length && batch.length < 60 && size + queue[0].length < 3800) {
        size += queue[0].length;
        batch.push(queue.shift());
      }
      if (!batch.length) batch.push(queue.shift());
      send(batch, 0);
    }
  }

  function send(batch, tries) {
    inflight++;
    var body = batch.map(function (t) { return 'q=' + encodeURIComponent(t); }).join('&');
    fetch(API + encodeURIComponent(lang), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: body,
      credentials: 'omit',
      cache: 'force-cache'
    })
      .then(function (r) {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then(function (out) {
        if (!Array.isArray(out)) out = [out];
        batch.forEach(function (src, i) {
          var t = out[i];
          if (Array.isArray(t)) t = t[0];
          if (typeof t !== 'string' || !t) t = src;
          cache[src] = t;
          var cbs = waiting[src] || [];
          delete waiting[src];
          cbs.forEach(function (cb) { cb(t); });
        });
        save();
      })
      .catch(function () {
        if (tries < 2) {
          setTimeout(function () { send(batch, tries + 1); }, 1500 * (tries + 1));
        } else {
          batch.forEach(function (src) { delete waiting[src]; });
        }
      })
      .then(function () {
        inflight--;
        if (!inflight && !queue.length) reveal();
      });
  }

  function blocked(el) {
    for (var n = el; n && n.nodeType === 1; n = n.parentNode) {
      if (SKIP[n.tagName]) return true;
      if (n.getAttribute('translate') === 'no' || n.classList.contains('notranslate')) return true;
    }
    return false;
  }

  function split(v) {
    var m = /^(\s*)([\s\S]*?)(\s*)$/.exec(v);
    return m;
  }

  function doText(node) {
    var v = node.nodeValue;
    var rec = texts.get(node);
    if (rec && (v === rec.out || v === rec.src)) return;
    if (!v || !AR.test(v)) return;
    if (!node.parentNode || blocked(node.parentNode)) return;
    var m = split(v);
    rec = { src: v, out: null };
    texts.set(node, rec);
    want(m[2], function (t) {
      if (node.nodeValue !== rec.src) return;
      rec.out = m[1] + t + m[3];
      node.nodeValue = rec.out;
    });
  }

  function doAttr(el, name) {
    var v = el.getAttribute(name);
    var map = attrs.get(el);
    if (!map) {
      map = {};
      attrs.set(el, map);
    }
    var rec = map[name];
    if (rec && (v === rec.out || v === rec.src)) return;
    if (!v || !AR.test(v) || el.getAttribute('translate') === 'no' || (el.parentNode && el.parentNode.nodeType === 1 && blocked(el.parentNode))) return;
    rec = { src: v, out: null };
    map[name] = rec;
    want(v.trim(), function (t) {
      if (el.getAttribute(name) !== rec.src) return;
      rec.out = t;
      el.setAttribute(name, t);
    });
  }

  function scan(node) {
    if (node.nodeType === 3) {
      doText(node);
      return;
    }
    if (node.nodeType !== 1) return;
    if (SKIP[node.tagName] && node.tagName !== 'TEXTAREA') return;
    ATTRS.forEach(function (a) {
      if (node.hasAttribute(a)) doAttr(node, a);
    });
    var walker = document.createTreeWalker(node, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    var n;
    while ((n = walker.nextNode())) {
      if (n.nodeType === 3) doText(n);
      else ATTRS.forEach(function (a) {
        if (n.hasAttribute(a)) doAttr(n, a);
      });
    }
  }

  var titleSrc = '';
  function doTitle() {
    var t = document.title;
    if (!AR.test(t) || t === titleSrc) return;
    var src = t;
    want(src, function (out) {
      if (document.title === src) {
        titleSrc = out;
        document.title = out;
      }
    });
  }

  function start() {
    mountPicker();
    if (!active) return;
    scan(document.body);
    doTitle();
    if (!queue.length && !inflight && !Object.keys(waiting).length) reveal();
    setTimeout(reveal, 2600);
    new MutationObserver(function (list) {
      list.forEach(function (m) {
        if (m.type === 'characterData') doText(m.target);
        else if (m.type === 'attributes') doAttr(m.target, m.attributeName);
        else m.addedNodes.forEach(scan);
      });
    }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    var t = document.querySelector('title');
    if (t) new MutationObserver(doTitle).observe(t, { childList: true, characterData: true, subtree: true });
  }

  var GLOBE = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3Z"/></svg>';

  function nameOf(code) {
    for (var i = 0; i < LANGS.length; i++) if (LANGS[i][0] === code) return LANGS[i][1];
    return code;
  }

  function choose(code) {
    try {
      if (code === 'ar') localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, code);
    } catch (e) {}
    window.location.reload();
  }

  function buildPicker(slot, floating) {
    var wrap = document.createElement('div');
    wrap.className = 'lang' + (floating ? ' lang-float' : '');
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'lang-btn';
    btn.setAttribute('aria-haspopup', 'dialog');
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-label', 'تغيير اللغة');
    btn.innerHTML = GLOBE + '<span translate="no">' + nameOf(lang) + '</span>';
    var panel = document.createElement('div');
    panel.className = 'lang-panel';
    panel.hidden = true;
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'اختر اللغة');
    var head = document.createElement('p');
    head.className = 'lang-head';
    head.textContent = 'اختر لغة الموقع';
    var search = document.createElement('input');
    search.type = 'search';
    search.className = 'lang-search';
    search.placeholder = 'ابحث عن لغة';
    search.setAttribute('aria-label', 'ابحث عن لغة');
    var list = document.createElement('div');
    list.className = 'lang-list';
    list.setAttribute('translate', 'no');
    LANGS.forEach(function (l) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'lang-item' + (l[0] === lang ? ' on' : '');
      b.setAttribute('lang', l[0]);
      b.dataset.code = l[0];
      b.innerHTML = '<span></span><small></small>';
      b.firstChild.textContent = l[1];
      b.lastChild.textContent = l[0].toUpperCase();
      b.addEventListener('click', function () {
        if (l[0] !== lang) choose(l[0]);
        else close();
      });
      list.appendChild(b);
    });
    search.addEventListener('input', function () {
      var q = search.value.trim().toLowerCase();
      Array.prototype.forEach.call(list.children, function (b) {
        b.hidden = q && b.textContent.toLowerCase().indexOf(q) < 0;
      });
    });
    panel.appendChild(head);
    panel.appendChild(search);
    panel.appendChild(list);
    function open() {
      panel.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
      search.value = '';
      search.dispatchEvent(new Event('input'));
      setTimeout(function () { search.focus(); }, 30);
    }
    function close() {
      panel.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
    }
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (panel.hidden) open();
      else close();
    });
    panel.addEventListener('click', function (e) { e.stopPropagation(); });
    document.addEventListener('click', close);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !panel.hidden) {
        close();
        btn.focus();
      }
    });
    wrap.appendChild(btn);
    wrap.appendChild(panel);
    slot.appendChild(wrap);
  }

  function mountPicker() {
    var slots = document.querySelectorAll('[data-lang-slot]');
    if (slots.length) Array.prototype.forEach.call(slots, function (s) { buildPicker(s, false); });
    else buildPicker(document.body, true);
  }

  window.POPLang = Object.freeze({ current: lang, active: active });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
