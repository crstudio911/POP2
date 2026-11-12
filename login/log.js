(function () {
  var cfg = window.POP || {};
  var RULES = window.POP_RULES;
  var API = String(cfg.api || '').replace(/\/+$/, '');
  var KEY = cfg.storageKey || 'pop_s';
  var HOME = '../main/main.html';
  var COOLDOWN = 60;
  var NAME_RE = /^[A-Za-z\u0600-\u06FF][A-Za-z\u0600-\u06FF '\-]{1,39}$/;

  function $(id) {
    return document.getElementById(id);
  }

  var tabLogin = $('tab-login');
  var tabRegister = $('tab-register');
  var tabs = $('tabs');
  var formLogin = $('form-login');
  var formRegister = $('form-register');
  var formCode = $('form-code');
  var formF1 = $('form-f1');
  var formF2 = $('form-f2');
  var formF3 = $('form-f3');
  var DOMAINS = ['gmail.com', 'googlemail.com', 'hotmail.com', 'hotmail.co.uk', 'hotmail.fr', 'outlook.com', 'outlook.sa', 'outlook.fr', 'live.com', 'msn.com', 'yahoo.com', 'yahoo.co.uk', 'yahoo.fr', 'ymail.com', 'icloud.com', 'me.com', 'mac.com', 'aol.com', 'proton.me', 'protonmail.com', 'zoho.com', 'yandex.com', 'gmx.com'];
  var forgot = null;
  var statusEl = $('status');
  var codeBox = $('code');
  var digits = Array.prototype.slice.call(codeBox.querySelectorAll('input'));
  var rulesList = $('rules');
  var meterBar = $('meter-bar');

  var pending = null;
  var timer = null;
  var LANG = (window.POPLang && window.POPLang.current) || 'ar';
  var latin = window.POPBusy ? window.POPBusy.latin : function (v) { return String(v); };

  var MESSAGES = {
    invalid_email: 'يرجى إدخال بريد إلكتروني صحيح.',
    email_domain: 'يُقبل التسجيل ببريد من مزوّدي البريد العالميين فقط، مثل Gmail وOutlook وHotmail وYahoo وiCloud.',
    invalid_answers: 'الإجابات غير كافية للتحقق من ملكية الحساب. راجع إجاباتك وحاول مرة أخرى.',
    invalid_name: 'يرجى إدخال الاسم الأول واسم العائلة بشكل صحيح (حرفان على الأقل).',
    weak_password: 'كلمة المرور لا تستوفي الشروط المطلوبة.',
    mismatch: 'كلمتا المرور غير متطابقتين.',
    invalid_login: 'البريد الإلكتروني أو كلمة المرور غير صحيحة.',
    invalid_code: 'الرمز غير صحيح أو انتهت صلاحيته.',
    invalid_request: 'يرجى مراجعة البيانات المدخلة والمحاولة مرة أخرى.',
    exists: 'يوجد حساب مسجّل بهذا البريد الإلكتروني. يرجى تسجيل الدخول.',
    rate: 'محاولات كثيرة. يرجى الانتظار بضع دقائق ثم المحاولة مرة أخرى.',
    locked: 'محاولات غير صحيحة كثيرة. لحماية الحساب، يرجى المحاولة بعد ساعة.',
    unavailable: 'الخدمة غير متاحة حاليًا. يرجى المحاولة بعد قليل.',
    network: 'تعذّر الاتصال. يرجى التحقق من اتصالك بالإنترنت والمحاولة مرة أخرى.'
  };

  function say(text, ok) {
    statusEl.textContent = text || '';
    statusEl.classList.toggle('ok', !!ok);
  }

  function post(path, body, token) {
    var G = window.POPGuard;
    var headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = 'Bearer ' + token;
    var req = G
      ? G.whenClear().then(function () {
          return G.send(path, body, headers);
        })
      : fetch(API + path, { method: 'POST', headers: headers, body: JSON.stringify(body || {}), cache: 'no-store', credentials: 'omit' });
    return req
      .then(function (res) {
        return res.json().then(function (j) {
          if (j && j.error === 'banned' && G) {
            G.banned(j);
            return new Promise(function () {});
          }
          return j;
        }, function () {
          return { ok: false, error: 'unavailable' };
        });
      })
      .catch(function () {
        return { ok: false, error: 'network' };
      });
  }

  function saveSession(token, expires, keep) {
    try {
      window.localStorage.removeItem(KEY);
      window.sessionStorage.removeItem(KEY);
      var store = keep ? window.localStorage : window.sessionStorage;
      store.setItem(KEY, JSON.stringify({ t: token, e: expires }));
      return true;
    } catch (e) {
      return false;
    }
  }

  function readSession() {
    try {
      var raw = window.localStorage.getItem(KEY) || window.sessionStorage.getItem(KEY);
      var s = raw ? JSON.parse(raw) : null;
      return s && typeof s.t === 'string' && Number(s.e) > Date.now() ? s : null;
    } catch (e) {
      return null;
    }
  }

  function clearSession() {
    try {
      window.localStorage.removeItem(KEY);
      window.sessionStorage.removeItem(KEY);
    } catch (e) {}
  }

  function finish(r) {
    if (saveSession(r.token, r.expires, r.remember === true)) {
      say('تم تسجيل الدخول.', true);
      window.location.replace(HOME);
      return true;
    }
    say('تعذّر حفظ الجلسة في المتصفح. يرجى السماح بالتخزين والمحاولة مرة أخرى.');
    return false;
  }

  function validEmail(v) {
    return v.length <= 254 && /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/.test(v);
  }

  function cleanName(v) {
    return v.trim().replace(/\s+/g, ' ');
  }

  function domainOk(email) {
    return DOMAINS.indexOf(String(email.split('@')[1] || '').toLowerCase()) >= 0;
  }

  post('/api/config', {}).then(function (r) {
    if (r && r.ok && Array.isArray(r.domains) && r.domains.length) DOMAINS = r.domains;
  });

  function show(which) {
    formLogin.hidden = which !== 'login';
    formRegister.hidden = which !== 'register';
    formCode.hidden = which !== 'code';
    formF1.hidden = which !== 'f1';
    formF2.hidden = which !== 'f2';
    formF3.hidden = which !== 'f3';
    tabs.hidden = which === 'code' || which.charAt(0) === 'f';
    tabLogin.setAttribute('aria-selected', String(which === 'login'));
    tabRegister.setAttribute('aria-selected', String(which === 'register'));
    if (which !== 'code') clearInterval(timer);
    say('');
  }

  tabLogin.addEventListener('click', function () {
    show('login');
    $('login-email').focus();
  });

  tabRegister.addEventListener('click', function () {
    show('register');
    $('reg-first').focus();
  });

  Array.prototype.forEach.call(document.querySelectorAll('.eye'), function (btn) {
    btn.addEventListener('click', function () {
      var input = $(btn.getAttribute('data-for'));
      var showIt = input.type === 'password';
      input.type = showIt ? 'text' : 'password';
      btn.classList.toggle('on', showIt);
      btn.setAttribute('aria-label', showIt ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور');
    });
  });

  function personal() {
    return [$('reg-email').value.trim().split('@')[0], cleanName($('reg-first').value), cleanName($('reg-last').value)];
  }

  function paintList(value, who, list, bar) {
    var bad = RULES.passwordProblems(value, who);
    Array.prototype.forEach.call(list.querySelectorAll('li'), function (li) {
      li.classList.toggle('pass', !!value && bad.indexOf(li.getAttribute('data-rule')) < 0);
    });
    var score = value ? RULES.all.length - bad.length : 0;
    bar.style.width = (score / RULES.all.length) * 100 + '%';
    bar.className = score === RULES.all.length ? 'strong' : score >= 4 ? 'mid' : 'weak';
    return bad;
  }

  function paintRules() {
    return paintList($('reg-pass').value, personal(), rulesList, meterBar);
  }

  function personal2() {
    return forgot ? [forgot.email.split('@')[0], forgot.firstName, forgot.lastName] : [];
  }

  function paintRules2() {
    return paintList($('f-pass').value, personal2(), $('rules2'), $('meter-bar2'));
  }

  ['reg-pass', 'reg-email', 'reg-first', 'reg-last'].forEach(function (id) {
    $(id).addEventListener('input', paintRules);
  });

  formLogin.addEventListener('submit', function (e) {
    e.preventDefault();
    var email = $('login-email').value.trim().toLowerCase();
    var password = $('login-pass').value;
    if (!validEmail(email)) {
      say(MESSAGES.invalid_email);
      $('login-email').focus();
      return;
    }
    if (!password) {
      say('يرجى إدخال كلمة المرور.');
      $('login-pass').focus();
      return;
    }
    var btn = $('login-btn');
    btn.disabled = true;
    say('');
    post('/api/auth/login', { email: email, password: password, remember: $('login-remember').checked }).then(function (r) {
      if (r.ok && r.token && finish(r)) return;
      if (!r.ok) say(MESSAGES[r.error] || MESSAGES.unavailable);
      btn.disabled = false;
    });
  });

  function sendRegister() {
    return post('/api/auth/register', pending.body).then(function (r) {
      if (r.ok) return true;
      if (r.error === 'weak_password') paintRules();
      say(MESSAGES[r.error] || MESSAGES.unavailable);
      return false;
    });
  }

  formRegister.addEventListener('submit', function (e) {
    e.preventDefault();
    var first = cleanName($('reg-first').value);
    var last = cleanName($('reg-last').value);
    var email = $('reg-email').value.trim().toLowerCase();
    var pass = $('reg-pass').value;
    if (!NAME_RE.test(first) || !NAME_RE.test(last)) {
      say(MESSAGES.invalid_name);
      $(NAME_RE.test(first) ? 'reg-last' : 'reg-first').focus();
      return;
    }
    if (!validEmail(email)) {
      say(MESSAGES.invalid_email);
      $('reg-email').focus();
      return;
    }
    if (!domainOk(email)) {
      say(MESSAGES.email_domain);
      $('reg-email').focus();
      return;
    }
    if (paintRules().length) {
      say(MESSAGES.weak_password);
      $('reg-pass').focus();
      return;
    }
    if (pass !== $('reg-pass2').value) {
      say(MESSAGES.mismatch);
      $('reg-pass2').focus();
      return;
    }
    pending = {
      email: email,
      remember: $('reg-remember').checked,
      body: { firstName: first, lastName: last, email: email, password: pass, lang: LANG }
    };
    var btn = $('reg-btn');
    btn.disabled = true;
    say('');
    sendRegister().then(function (ok) {
      btn.disabled = false;
      if (ok) showCode();
    });
  });

  function startCooldown() {
    var left = COOLDOWN;
    var resend = $('resend');
    resend.disabled = true;
    resend.textContent = 'إعادة إرسال الرمز (' + left + ')';
    clearInterval(timer);
    timer = setInterval(function () {
      left -= 1;
      if (left <= 0) {
        clearInterval(timer);
        timer = null;
        resend.disabled = false;
        resend.textContent = 'إعادة إرسال الرمز';
      } else {
        resend.textContent = 'إعادة إرسال الرمز (' + left + ')';
      }
    }, 1000);
  }

  function showCode() {
    show('code');
    $('who').textContent = pending.email;
    clearDigits();
    digits[0].focus();
    startCooldown();
  }

  function clearDigits() {
    codeBox.classList.remove('bad');
    digits.forEach(function (d) {
      d.value = '';
    });
  }

  function codeValue() {
    return digits
      .map(function (d) {
        return d.value;
      })
      .join('');
  }

  formCode.addEventListener('submit', function (e) {
    e.preventDefault();
    var code = codeValue();
    if (!/^\d{6}$/.test(code)) {
      codeBox.classList.add('bad');
      say('يرجى إدخال الأرقام الستة كاملة.');
      return;
    }
    var btn = $('verify');
    btn.disabled = true;
    say('');
    post('/api/auth/verify', { email: pending.email, code: code, remember: pending.remember }).then(function (r) {
      if (r.ok && r.token) {
        pending = null;
        if (finish(r)) return;
      } else {
        codeBox.classList.add('bad');
        say(MESSAGES[r.error] || MESSAGES.unavailable);
        if (r.error === 'locked') clearDigits();
      }
      btn.disabled = false;
    });
  });

  function readClip(done) {
    if (!navigator.clipboard || !navigator.clipboard.readText) {
      done('');
      return;
    }
    navigator.clipboard.readText().then(function (t) {
      var m = latin(t || '').match(/\d[\d\s-]{4,10}\d/);
      done(m ? m[0].replace(/\D/g, '').slice(0, 6) : '');
    }, function () {
      done('');
    });
  }

  $('paste-code').addEventListener('click', function () {
    readClip(function (code) {
      if (code.length === 6) {
        fill(code, 0);
        return;
      }
      digits[0].focus();
      say('انسخ الرمز من البريد ثم اضغط مطولًا على أول خانة واختر لصق.');
    });
  });

  $('paste-f').addEventListener('click', function () {
    readClip(function (code) {
      if (code.length === 6) {
        $('f-code').value = code;
        $('f-pass').focus();
        return;
      }
      $('f-code').focus();
      say('انسخ الرمز من البريد ثم اضغط مطولًا على الخانة واختر لصق.');
    });
  });

  $('resend').addEventListener('click', function () {
    var resend = $('resend');
    if (!pending || !pending.body) {
      show('register');
      say('أدخل بياناتك مرة أخرى لإرسال رمز جديد.');
      return;
    }
    resend.disabled = true;
    clearDigits();
    sendRegister().then(function (ok) {
      if (ok) {
        say('أرسلنا إليك رمزًا جديدًا.', true);
        startCooldown();
        digits[0].focus();
      } else if (!timer) {
        resend.disabled = false;
      }
    });
  });

  $('back').addEventListener('click', function () {
    show('register');
    $('reg-email').focus();
  });

  digits.forEach(function (input, i) {
    input.addEventListener('input', function () {
      var v = input.value.replace(/\D/g, '');
      if (v.length > 1) {
        fill(v, i);
        return;
      }
      input.value = v;
      codeBox.classList.remove('bad');
      if (v && i < digits.length - 1) digits[i + 1].focus();
      if (codeValue().length === 6) formCode.requestSubmit();
    });

    input.addEventListener('keydown', function (e) {
      if (e.key === 'Backspace' && !input.value && i > 0) {
        digits[i - 1].focus();
        digits[i - 1].value = '';
      } else if (e.key === 'ArrowLeft' && i > 0) {
        digits[i - 1].focus();
      } else if (e.key === 'ArrowRight' && i < digits.length - 1) {
        digits[i + 1].focus();
      }
    });

    input.addEventListener('paste', function (e) {
      var text = latin((e.clipboardData || window.clipboardData).getData('text')).replace(/\D/g, '');
      if (!text) return;
      e.preventDefault();
      fill(text, i);
    });

    input.addEventListener('focus', function () {
      input.select();
    });
  });

  function fill(text, start) {
    var chars = text.slice(0, digits.length - start).split('');
    chars.forEach(function (c, k) {
      digits[start + k].value = c;
    });
    var next = Math.min(start + chars.length, digits.length - 1);
    digits[next].focus();
    codeBox.classList.remove('bad');
    if (codeValue().length === 6) formCode.requestSubmit();
  }

  var MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
  MONTHS.forEach(function (m, i) {
    var o = document.createElement('option');
    o.value = String(i + 1);
    o.textContent = m;
    $('q-month').appendChild(o);
  });
  for (var y = new Date().getFullYear(); y >= 2024; y--) {
    var o = document.createElement('option');
    o.value = String(y);
    o.textContent = String(y);
    $('q-year').appendChild(o);
  }

  $('forgot').addEventListener('click', function () {
    show('f1');
    var e = $('login-email').value.trim();
    if (e) $('f-email').value = e;
    $('f-email').focus();
  });

  Array.prototype.forEach.call(document.querySelectorAll('[data-back-login]'), function (b) {
    b.addEventListener('click', function () {
      forgot = null;
      show('login');
      $('login-email').focus();
    });
  });

  formF1.addEventListener('submit', function (e) {
    e.preventDefault();
    var email = $('f-email').value.trim().toLowerCase();
    if (!validEmail(email)) {
      say(MESSAGES.invalid_email);
      $('f-email').focus();
      return;
    }
    forgot = { email: email, firstName: '', lastName: '' };
    $('f-who').textContent = email;
    ['q-first', 'q-last'].forEach(function (id) { $(id).value = ''; });
    ['q-month', 'q-year', 'q-plan'].forEach(function (id) { $(id).value = ''; });
    show('f2');
    $('q-first').focus();
  });

  formF2.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!forgot) return show('f1');
    var answers = {
      firstName: cleanName($('q-first').value),
      lastName: cleanName($('q-last').value),
      month: $('q-month').value,
      year: $('q-year').value,
      plan: $('q-plan').value
    };
    var filled = Object.keys(answers).filter(function (k) { return answers[k]; }).length;
    if (filled < 4) {
      say('يرجى الإجابة عن أربعة أسئلة على الأقل.');
      return;
    }
    var btn = $('f2-btn');
    btn.disabled = true;
    say('');
    post('/api/auth/forgot', { email: forgot.email, answers: answers, lang: LANG }).then(function (r) {
      btn.disabled = false;
      if (!r.ok) {
        say(MESSAGES[r.error] || MESSAGES.unavailable);
        return;
      }
      forgot.firstName = answers.firstName;
      forgot.lastName = answers.lastName;
      $('f-who2').textContent = forgot.email;
      $('f-min').textContent = String(r.minutes || 10);
      $('f-code').value = '';
      $('f-pass').value = '';
      $('f-pass2').value = '';
      paintRules2();
      show('f3');
      say('أرسلنا رمز الاستعادة إلى بريدك الإلكتروني.', true);
      $('f-code').focus();
    });
  });

  $('f-pass').addEventListener('input', paintRules2);
  $('f-code').addEventListener('input', function () {
    this.value = this.value.replace(/\D/g, '').slice(0, 6);
  });

  formF3.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!forgot) return show('f1');
    var code = $('f-code').value;
    var pass = $('f-pass').value;
    if (!/^\d{6}$/.test(code)) {
      say('يرجى إدخال رمز الاستعادة المكوّن من 6 أرقام.');
      $('f-code').focus();
      return;
    }
    if (paintRules2().length) {
      say(MESSAGES.weak_password);
      $('f-pass').focus();
      return;
    }
    if (pass !== $('f-pass2').value) {
      say(MESSAGES.mismatch);
      $('f-pass2').focus();
      return;
    }
    var btn = $('f3-btn');
    btn.disabled = true;
    say('');
    post('/api/auth/reset', { email: forgot.email, code: code, password: pass, firstName: forgot.firstName, lastName: forgot.lastName }).then(function (r) {
      btn.disabled = false;
      if (!r.ok) {
        if (r.error === 'weak_password') paintRules2();
        say(MESSAGES[r.error] || MESSAGES.unavailable);
        if (r.error === 'locked') show('f1');
        return;
      }
      var email = forgot.email;
      forgot = null;
      clearSession();
      show('login');
      $('login-email').value = email;
      $('login-pass').value = '';
      say('تم تغيير كلمة المرور بنجاح، وحُذفت القديمة نهائيًا. سجّل الدخول الآن بكلمة المرور الجديدة.', true);
      $('login-pass').focus();
    });
  });

  function fromLink() {
    var h = window.location.hash.slice(1);
    var m = /^(verify|reset)=(\d{6})&e=([^&]+)$/.exec(h);
    if (!m) return false;
    var email = '';
    try {
      email = decodeURIComponent(m[3]).trim().toLowerCase();
    } catch (e) {}
    try {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    } catch (e) {}
    if (!validEmail(email)) return false;
    if (m[1] === 'verify') {
      pending = { email: email, remember: false, body: null };
      show('code');
      $('who').textContent = email;
      clearDigits();
      $('resend').disabled = false;
      fill(m[2], 0);
      return true;
    }
    forgot = { email: email, firstName: '', lastName: '' };
    show('f3');
    $('f-who2').textContent = email;
    $('f-code').value = m[2];
    paintRules2();
    say('كتبنا رمز الاستعادة تلقائيًا. اختر كلمة المرور الجديدة.', true);
    $('f-pass').focus();
    return true;
  }

  var linked = fromLink();
  if (!linked && window.location.hash === '#register') show('register');
  if (!linked && window.location.hash === '#forgot') show('f1');

  var existing = linked ? null : readSession();
  if (existing) {
    post('/api/session/check', {}, existing.t).then(function (r) {
      if (r.ok) window.location.replace(HOME);
      else if (r.error === 'invalid_session') clearSession();
    });
  }
})();
