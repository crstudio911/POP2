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
  var statusEl = $('status');
  var codeBox = $('code');
  var digits = Array.prototype.slice.call(codeBox.querySelectorAll('input'));
  var rulesList = $('rules');
  var meterBar = $('meter-bar');

  var pending = null;
  var timer = null;

  var MESSAGES = {
    invalid_email: 'اكتب إيميل صحيح.',
    invalid_name: 'اكتب الاسم الأول واسم العيلة بشكل صحيح (حرفين على الأقل).',
    weak_password: 'كلمة السر مش مطابقة للقواعد.',
    mismatch: 'كلمتين السر مش زي بعض.',
    invalid_login: 'الإيميل أو كلمة السر غلط.',
    invalid_code: 'الكود غلط أو انتهت صلاحيته.',
    invalid_request: 'راجع البيانات اللي كتبتها وجرب تاني.',
    exists: 'الإيميل ده عليه حساب بالفعل. سجل دخول بدل كده.',
    rate: 'محاولات كتير. استنى كام دقيقة وجرب تاني.',
    locked: 'كود غلط كذا مرة. اطلب كود جديد.',
    unavailable: 'POP مش متاح دلوقتي. جرب كمان شوية.',
    network: 'مش قادرين نوصل لـ POP. اتأكد من النت وجرب تاني.'
  };

  function say(text, ok) {
    statusEl.textContent = text || '';
    statusEl.classList.toggle('ok', !!ok);
  }

  function post(path, body, token) {
    var headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = 'Bearer ' + token;
    return fetch(API + path, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(body || {}),
      cache: 'no-store',
      credentials: 'omit'
    })
      .then(function (res) {
        return res.json().catch(function () {
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
    say('المتصفح منع حفظ الجلسة. فعّل التخزين وجرب تاني.');
    return false;
  }

  function validEmail(v) {
    return v.length <= 254 && /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/.test(v);
  }

  function cleanName(v) {
    return v.trim().replace(/\s+/g, ' ');
  }

  function show(which) {
    formLogin.hidden = which !== 'login';
    formRegister.hidden = which !== 'register';
    formCode.hidden = which !== 'code';
    tabs.hidden = which === 'code';
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
      btn.setAttribute('aria-label', showIt ? 'إخفاء كلمة السر' : 'إظهار كلمة السر');
    });
  });

  function personal() {
    return [$('reg-email').value.trim().split('@')[0], cleanName($('reg-first').value), cleanName($('reg-last').value)];
  }

  function paintRules() {
    var value = $('reg-pass').value;
    var bad = RULES.passwordProblems(value, personal());
    Array.prototype.forEach.call(rulesList.querySelectorAll('li'), function (li) {
      li.classList.toggle('pass', !!value && bad.indexOf(li.getAttribute('data-rule')) < 0);
    });
    var score = value ? RULES.all.length - bad.length : 0;
    meterBar.style.width = (score / RULES.all.length) * 100 + '%';
    meterBar.className = score === RULES.all.length ? 'strong' : score >= 4 ? 'mid' : 'weak';
    return bad;
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
      say('اكتب كلمة السر.');
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
      body: { firstName: first, lastName: last, email: email, password: pass }
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
    resend.textContent = 'ابعت الكود تاني (' + left + ')';
    clearInterval(timer);
    timer = setInterval(function () {
      left -= 1;
      if (left <= 0) {
        clearInterval(timer);
        timer = null;
        resend.disabled = false;
        resend.textContent = 'ابعت الكود تاني';
      } else {
        resend.textContent = 'ابعت الكود تاني (' + left + ')';
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
      say('اكتب الـ 6 أرقام كلهم.');
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

  $('resend').addEventListener('click', function () {
    var resend = $('resend');
    resend.disabled = true;
    clearDigits();
    sendRegister().then(function (ok) {
      if (ok) {
        say('بعتنالك كود جديد.', true);
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
      var text = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '');
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

  if (window.location.hash === '#register') show('register');

  var existing = readSession();
  if (existing) {
    post('/api/session/check', {}, existing.t).then(function (r) {
      if (r.ok) window.location.replace(HOME);
      else if (r.error === 'invalid_session') clearSession();
    });
  }
})();
