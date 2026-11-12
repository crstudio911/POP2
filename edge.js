const SCAN_RE = /(^|\/)(\.env|\.git|\.svn|\.hg|\.htaccess|\.htpasswd|\.ds_store|\.aws|\.ssh|id_rsa|wp-admin|wp-login\.php|wp-content|wp-includes|xmlrpc\.php|phpmyadmin|pma|myadmin|adminer\.php|admin\.php|config\.(php|json|ya?ml|inc)|server-status|cgi-bin|vendor\/|composer\.(json|lock)|package(-lock)?\.json|backup\.(zip|sql|tar|gz)|dump\.sql|db\.sql|shell\.php|eval-stdin\.php|actuator|telescope|_ignition|boaform|HNAP1)/i;
const PASS_HEADERS = ['content-type', 'authorization', 'x-wa-ticket', 'x-api-key', 'x-pop-device', 'user-agent', 'accept', 'origin'];
const MAX_BODY = 4500000;
const UPSTREAM_TIMEOUT = 120000;
const PAGE_CSP = "default-src 'none'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' https://translate.googleapis.com; manifest-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'; upgrade-insecure-requests";
const SECURITY = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload'
};
const GO_RE = /^\/([A-Za-z0-9][A-Za-z0-9-]{1,30}[A-Za-z0-9])\/?$/;
const RESERVED = { api: 1, v1: 1, v2: 1, go: 1, '404': 1, img: 1, login: 1, main: 1, plans: 1, tools: 1, panel: 1, panal: 1, admin: 1, index: 1, www: 1, static: 1, assets: 1, app: 1, help: 1, about: 1, terms: 1, privacy: 1, pop: 1, mc: 1, short: 1, link: 1, links: 1, favicon: 1, robots: 1, sitemap: 1, 'well-known': 1 };
const SEEN = new Map();
const EDGE_BUCKETS = new Map();
const EDGE_LIMITS = { site: [300, 6], api: [400, 12] };

function list(v) {
  return String(v || '')
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

function json(status, body, extra) {
  const h = new Headers(Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-POP-Time': String(Date.now()) }, SECURITY, extra || {}));
  return new Response(status === 204 ? null : JSON.stringify(body), { status, headers: h });
}

function secure(res, isHtml) {
  const out = new Response(res.body, res);
  Object.keys(SECURITY).forEach((k) => out.headers.set(k, SECURITY[k]));
  const type = out.headers.get('Content-Type') || '';
  if (isHtml || type.includes('text/html')) {
    out.headers.set('Content-Security-Policy', PAGE_CSP);
    out.headers.set('Cache-Control', 'no-cache');
  }
  out.headers.delete('Server');
  return out;
}

function tzOffset(tz, at) {
  try {
    const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const p = {};
    f.formatToParts(new Date(at)).forEach((x) => {
      p[x.type] = x.value;
    });
    const asUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour) % 24, Number(p.minute), Number(p.second));
    return Math.round((asUtc - Math.floor(at / 1000) * 1000) / 60000);
  } catch (e) {
    return null;
  }
}

function timeInfo(request, env) {
  if (request.method !== 'GET') return json(405, { ok: false, error: 'method' });
  const now = Date.now();
  const tz = (request.cf && typeof request.cf.timezone === 'string' && request.cf.timezone) || '';
  const offset = tz ? tzOffset(tz, now) : null;
  return json(200, { ok: true, now, tz, offset, check: String(env.TZ_CHECK || 'on') !== 'off', skew: Math.max(30, Number(env.TIME_SKEW) || 120) });
}

function edgeTake(key, cap, rate) {
  const now = Date.now();
  let b = EDGE_BUCKETS.get(key);
  if (!b) {
    if (EDGE_BUCKETS.size > 50000) EDGE_BUCKETS.clear();
    b = { t: cap, at: now };
    EDGE_BUCKETS.set(key, b);
  }
  b.t = Math.min(cap, b.t + ((now - b.at) / 1000) * rate);
  b.at = now;
  if (b.t >= 1) {
    b.t -= 1;
    return 0;
  }
  return Math.ceil(((1 - b.t) / rate) * 1000);
}

async function edgeLimit(env, ip, isV1) {
  if (!ip) return 0;
  const binding = isV1 ? env.API_LIMITER : env.SITE_LIMITER;
  if (binding && typeof binding.limit === 'function') {
    try {
      const r = await binding.limit({ key: (isV1 ? 'v1:' : 'site:') + ip });
      if (r && r.success === false) return 10000;
    } catch (e) {}
  }
  const k = Math.min(100, Math.max(0.5, Number(env.RATE_SCALE) || 1));
  const l = EDGE_LIMITS[isV1 ? 'api' : 'site'];
  return edgeTake((isV1 ? 'v1:' : 'site:') + ip, l[0] * k, l[1] * k);
}

function tooMany(wait, isV1, cors) {
  const s = Math.max(1, Math.ceil(wait / 1000));
  const body = isV1 ? { ok: false, error: { code: 'rate_limited', message: 'Too many requests. Slow down and retry later.', retry_after: s, scope: 'edge' } } : { ok: false, error: 'rate', retry: s };
  return json(429, body, Object.assign({ 'Retry-After': String(s) }, cors || {}, cors ? { 'Access-Control-Expose-Headers': 'X-POP-Time, Retry-After' } : {}));
}

function hashText(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function targets(env, ip) {
  const out = [];
  if (env.API && typeof env.API.fetch === 'function') out.push({ binding: env.API });
  const urls = list(env.UPSTREAMS).filter((u) => /^https:\/\/[A-Za-z0-9.-]+(:\d{1,5})?$/.test(u) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/.test(u));
  if (urls.length > 1) {
    const start = hashText(ip || String(Math.random())) % urls.length;
    for (let i = 0; i < urls.length; i++) out.push({ url: urls[(start + i) % urls.length] });
  } else if (urls.length) out.push({ url: urls[0] });
  return out;
}

async function upstream(env, ip, path, init) {
  const list = targets(env, ip);
  for (const t of list) {
    try {
      if (t.binding) return await t.binding.fetch(new Request('https://pop-api.internal' + path, init));
      return await fetch(t.url + path, Object.assign({}, init, { redirect: 'manual', signal: AbortSignal.timeout(UPSTREAM_TIMEOUT) }));
    } catch (e) {}
  }
  return null;
}

function edgeReady(env) {
  return typeof env.EDGE_KEY === 'string' && env.EDGE_KEY.length >= 32 && targets(env, '').length > 0;
}

async function proxy(request, env, url) {
  const path = url.pathname;
  const isV1 = path === '/v1' || path.startsWith('/v1/');
  const isAdmin = path.startsWith('/api/admin/');
  if (path === '/api/sec/edge' || path === '/api/go/open') return json(404, { ok: false, error: 'not_found' });
  const origin = request.headers.get('Origin') || '';
  const panels = list(env.PANEL_ORIGINS);
  const cors = isAdmin && panels.includes(origin) ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Expose-Headers': 'X-POP-Time', Vary: 'Origin' } : null;
  if (!edgeReady(env)) return json(503, isV1 ? { ok: false, error: { code: 'service_unavailable', message: 'The service is temporarily unavailable. Retry later.' } } : { ok: false, error: 'unavailable' }, cors);
  if (!isV1) {
    if (origin !== url.origin && !cors) return json(403, { ok: false, error: 'forbidden' });
    if (request.method === 'OPTIONS') {
      if (!cors) return json(403, { ok: false, error: 'forbidden' });
      return json(204, null, Object.assign({}, cors, { 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Max-Age': '600' }));
    }
    const site = request.headers.get('Sec-Fetch-Site');
    if (!cors && site && site !== 'same-origin') return json(403, { ok: false, error: 'forbidden' });
  } else if (request.method === 'OPTIONS') {
    return json(403, { ok: false, error: { code: 'browser_not_allowed', message: 'The API is for server-to-server use. Do not call it from a browser, where the key would be exposed.' } });
  }
  if (Number(request.headers.get('Content-Length') || 0) > MAX_BODY) return json(413, { ok: false, error: 'invalid_request' }, cors);
  const ip = request.headers.get('CF-Connecting-IP') || '';
  const wait = await edgeLimit(env, ip, isV1);
  if (wait) return tooMany(wait, isV1, cors);
  const headers = new Headers();
  PASS_HEADERS.forEach((k) => {
    const v = request.headers.get(k);
    if (v) headers.set(k, v);
  });
  headers.set('X-POP-Edge', env.EDGE_KEY);
  headers.set('X-POP-IP', ip);
  headers.set('X-POP-Country', (request.cf && request.cf.country) || '');
  headers.set('X-POP-Site', url.origin);
  let body;
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    body = await request.arrayBuffer();
    if (body.byteLength > MAX_BODY) return json(413, { ok: false, error: 'invalid_request' }, cors);
  }
  const res = await upstream(env, ip, path + url.search, { method: request.method, headers, body });
  if (!res) return json(503, isV1 ? { ok: false, error: { code: 'service_unavailable', message: 'The service is temporarily unavailable. Retry later.' } } : { ok: false, error: 'unavailable' }, cors);
  const out = new Response(res.body, res);
  Object.keys(SECURITY).forEach((k) => out.headers.set(k, SECURITY[k]));
  out.headers.set('Cache-Control', 'no-store');
  out.headers.delete('Server');
  if (!cors) {
    out.headers.delete('Access-Control-Allow-Origin');
    out.headers.delete('Access-Control-Expose-Headers');
  }
  return out;
}

async function reportScan(env, request, url) {
  const ip = request.headers.get('CF-Connecting-IP') || '';
  if (!ip || !edgeReady(env)) return;
  const now = Date.now();
  const last = SEEN.get(ip) || 0;
  if (now - last < 60000) return;
  SEEN.set(ip, now);
  if (SEEN.size > 5000) SEEN.clear();
  const headers = new Headers({ 'Content-Type': 'application/json', Origin: url.origin, 'X-POP-Edge': env.EDGE_KEY, 'X-POP-IP': ip });
  await upstream(env, ip, '/api/sec/edge', { method: 'POST', headers, body: JSON.stringify({ path: url.pathname.slice(0, 200) }) });
}

function notFound(request, env, url) {
  return new Response(null, { status: 302, headers: Object.assign({ Location: url.origin + '/404/er.html?k=missing', 'Cache-Control': 'no-store' }, SECURITY) });
}

function goPage(url, kind, alias) {
  const q = '?k=' + kind + (alias ? '&a=' + encodeURIComponent(alias) : '');
  return new Response(null, { status: 302, headers: Object.assign({ Location: url.origin + '/go/go.html' + q, 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' }, SECURITY) });
}

async function goLink(request, env, url, alias) {
  if (!edgeReady(env)) return goPage(url, 'down', '');
  const ip = request.headers.get('CF-Connecting-IP') || '';
  const wait = await edgeLimit(env, ip, false);
  if (wait) return goPage(url, 'busy', alias);
  const headers = new Headers({ 'Content-Type': 'application/json', Origin: url.origin, 'X-POP-Edge': env.EDGE_KEY, 'X-POP-IP': ip, 'X-POP-Country': (request.cf && request.cf.country) || '' });
  const ua = (request.headers.get('User-Agent') || '').slice(0, 300);
  const res = await upstream(env, ip, '/api/go/open', { method: 'POST', headers, body: JSON.stringify({ alias, ua, count: request.method === 'GET' }) });
  if (!res) return goPage(url, 'down', '');
  if (res.status === 429) return goPage(url, 'busy', alias);
  let j = null;
  try {
    j = await res.json();
  } catch (e) {}
  if (!j || !j.ok) return goPage(url, res.status === 403 ? 'blocked' : 'down', '');
  if (j.state === 'ok' && typeof j.url === 'string' && /^https?:\/\//i.test(j.url)) {
    return new Response(null, { status: 302, headers: Object.assign({}, SECURITY, { Location: j.url, 'Cache-Control': 'private, no-store, max-age=0', 'X-Robots-Tag': 'noindex', 'Referrer-Policy': 'strict-origin-when-cross-origin' }) });
  }
  const kind = { locked: 'lock', expired: 'expired', paused: 'paused' }[j.state] || 'missing';
  return goPage(url, kind, kind === 'lock' ? alias : '');
}

function decoded(path) {
  try {
    return decodeURIComponent(path);
  } catch (e) {
    return path;
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    if (path === '/api/time') return timeInfo(request, env);
    const read = request.method === 'GET' || request.method === 'HEAD';
    if ((path.startsWith('/api/') && !read) || path === '/v1' || path.startsWith('/v1/')) return proxy(request, env, url);
    if (SCAN_RE.test(decoded(path))) {
      const job = reportScan(env, request, url).catch(() => {});
      if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(job);
      return notFound(request, env, url);
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') return json(405, { ok: false, error: 'method' });
    const go = GO_RE.exec(path);
    if (go && !RESERVED[go[1].toLowerCase()]) return goLink(request, env, url, go[1].toLowerCase());
    const res = await env.ASSETS.fetch(request);
    if (res.status === 404) return notFound(request, env, url);
    return secure(res, false);
  }
};
