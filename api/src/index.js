/* The build list's backend: one Worker and one small SQL table.
 *
 * The planner is a static site, so it cannot hold a credential — anything
 * shipped in assets/app.js is readable by everyone who loads the page. This
 * Worker is where the credential lives instead: the site POSTs here, this
 * decides what is allowed, and nothing the browser holds can write to the
 * database directly.
 *
 * Everything is anonymous by design; that is the whole point of it, and it is
 * also what makes abuse cheap, so three things stand in for a login:
 *
 *   - a voter fingerprint (address + user agent, salted and hashed) that the
 *     vote table's primary key dedupes on, so one visitor is one vote,
 *   - a per-fingerprint daily cap on publishing,
 *   - Turnstile, if a secret is configured. It is optional so the list can go
 *     up without it and gain it the day it is actually needed.
 *
 * None of that is unbeatable. It does not need to be: the cost of a spammed
 * fan planner is a maintainer hiding a row, which is why ADMIN_TOKEN exists.
 *
 * Whoever publishes a build can also take it down again, which needs some proof
 * of authorship in a system with no accounts. Publishing therefore mints a
 * random delete key, returns it exactly once, and keeps only its hash — so the
 * database cannot hand out the ability to delete, and neither can a leaked
 * backup. The planner stores the key against the build; that is the whole
 * mechanism, and it is why losing your site data costs you the ability to
 * delete your own build. ADMIN_TOKEN is the backstop for that too.
 *
 * Bindings — see wrangler.toml:
 *   DB                 D1 database
 *   ALLOWED_ORIGINS    comma-separated site origins that may POST
 *   VOTE_SALT          secret; changing it resets every dedupe, not the votes
 *   ADMIN_TOKEN        secret; bearer token for hiding and unhiding rows
 *   TURNSTILE_SECRET   secret; optional, enables the Turnstile check
 */

const LIMITS = { name: 80, author: 40, notes: 600, code: 4000 };
const PER_DAY = 5;          // builds one fingerprint may publish in 24 hours
const PAGE = 200;           // most builds ever returned at once

/* The planner's encoder emits node ids, tree keys and digits joined by these
   separators and nothing else. It is a sanity check rather than a security
   boundary: assets/app.js ignores ids it does not know and clamps every level
   it does, so the worst a hostile code can describe is a build that was always
   reachable by clicking. */
const CODE_RE = /^1;[A-Za-z0-9;=,.\-]{0,4000}$/;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = corsFor(request, env);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    try {
      const res = await route(request, env, url);
      for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
      return res;
    } catch (err) {
      // A stack trace is for the tail, not for the page.
      console.error(err && err.stack || String(err));
      return json({ error: 'Something went wrong at our end.' }, 500, cors);
    }
  }
};

async function route(request, env, url) {
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const m = /^\/builds\/(\d+)(\/vote|\/report)?$/.exec(path);

  if (path === '/builds' && request.method === 'GET') return listBuilds(env, url);
  if (path === '/builds' && request.method === 'POST') return postBuild(request, env);
  if (m && m[2] === '/vote' && request.method === 'POST') return postVote(request, env, +m[1]);
  if (m && m[2] === '/vote' && request.method === 'DELETE') return deleteVote(request, env, +m[1]);
  if (m && m[2] === '/report' && request.method === 'POST') return postReport(request, env, +m[1]);
  if (m && !m[2] && request.method === 'DELETE') return remove(request, env, +m[1]);
  if (m && !m[2] && request.method === 'PATCH') return setHidden(request, env, +m[1], 0);
  if (path === '/admin/reported' && request.method === 'GET') return reported(request, env);

  return json({ error: 'Not found' }, 404);
}

/* ------------------------------------------------------------------ reading */

/* Votes are counted from the vote rows rather than kept in a column on the
   build. A denormalised counter is one failed write away from disagreeing with
   the thing it counts, and at this size counting is free. */
const SELECT = `
  SELECT b.id, b.name, b.author, b.notes, b.code, b.created,
         (SELECT COUNT(*) FROM votes v WHERE v.build_id = b.id) AS votes
  FROM builds b WHERE b.hidden = 0`;

async function listBuilds(env, url) {
  const sort = url.searchParams.get('sort') === 'new'
    ? 'b.created DESC'
    : 'votes DESC, b.created DESC';
  const limit = Math.min(PAGE, Math.max(1, +url.searchParams.get('limit') || PAGE));
  const { results } = await env.DB.prepare(SELECT + ` ORDER BY ${sort} LIMIT ?`).bind(limit).all();
  return json({ builds: results || [] });
}

async function one(env, id) {
  return env.DB.prepare(SELECT + ' AND b.id = ?').bind(id).first();
}

/* ------------------------------------------------------------------ writing */

async function postBuild(request, env) {
  if (!originAllowed(request, env)) return json({ error: 'Not allowed from here.' }, 403);

  const body = await readJson(request);
  if (!body) return json({ error: 'Send JSON.' }, 400);

  const gate = await turnstile(env, body.token, request);
  if (gate) return json({ error: gate }, 403);

  const name = clean(body.name, LIMITS.name);
  const author = clean(body.author, LIMITS.author);
  const notes = clean(body.notes, LIMITS.notes);
  const code = String(body.code || '').replace(/\s+/g, '');

  if (!name) return json({ error: 'Give the build a name.' }, 400);
  if (!CODE_RE.test(code)) return json({ error: 'That is not a build code.' }, 400);

  // The same build twice is nearly always a double submit or a second tab, so
  // hand back the one that is already there rather than splitting its votes.
  const twin = await env.DB.prepare(SELECT + ' AND b.code = ? LIMIT 1').bind(code).first();
  if (twin) return json({ build: twin, existing: true });

  const who = await fingerprint(request, env);
  const since = new Date(Date.now() - 864e5).toISOString();
  const recent = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM builds WHERE author_key = ? AND created > ?').bind(who, since).first();
  if (recent && recent.n >= PER_DAY) {
    return json({ error: `That is ${PER_DAY} builds today — try again tomorrow.` }, 429);
  }

  const created = new Date().toISOString();
  const key = newKey();
  const row = await env.DB.prepare(
    `INSERT INTO builds (name, author, notes, code, created, author_key, owner_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`
  ).bind(name, author, notes, code, created, who, await sha256(key)).first();

  // The only time this key is ever readable. It is not in the list, it is not
  // in the row, and there is no endpoint that will tell anyone what it was.
  return json({ build: await one(env, row.id), key: key }, 201);
}

/* Taking a build down. Either the key that publishing handed out, or the admin
   token — and nothing else, including the fingerprint that published it, which
   drifts with an address and would hand a build to whoever inherits one. */
async function remove(request, env, id) {
  const build = await one(env, id);
  if (!build) return json({ error: 'No such build.' }, 404);

  if (!admin(request, env)) {
    if (!originAllowed(request, env)) return json({ error: 'Not allowed from here.' }, 403);
    const key = request.headers.get('X-Build-Key') || '';
    const row = await env.DB.prepare('SELECT owner_hash FROM builds WHERE id = ?').bind(id).first();
    const want = row && row.owner_hash;
    if (!key || !want || !timingSafe(await sha256(key), want)) {
      return json({ error: 'That build is not yours to remove.' }, 403);
    }
  }

  // Hidden, not deleted: a mis-click costs one PATCH to undo, and the votes
  // stay attached to what they were cast for.
  await env.DB.prepare('UPDATE builds SET hidden = 1 WHERE id = ?').bind(id).run();
  return json({ id: id, hidden: true });
}

async function postVote(request, env, id) {
  if (!originAllowed(request, env)) return json({ error: 'Not allowed from here.' }, 403);

  const build = await one(env, id);
  if (!build) return json({ error: 'No such build.' }, 404);

  const who = await fingerprint(request, env);
  // The primary key does the deduping, so a double click is a no-op rather
  // than a race to read-then-write.
  const r = await env.DB.prepare(
    `INSERT INTO votes (build_id, voter, created) VALUES (?, ?, ?)
     ON CONFLICT (build_id, voter) DO NOTHING`
  ).bind(id, who, new Date().toISOString()).run();

  const already = !r.meta.changes;
  return json({ id: id, votes: build.votes + (already ? 0 : 1), already: already });
}

/* Changing your mind is the same act as casting the vote, so it costs the same:
   one row, removed by the fingerprint that wrote it. `absent` says the server
   holds no vote from this voter — which is the honest answer both to a second
   click on an un-vote and to a fingerprint that has since drifted, and either
   way leaves the caller free to vote again. */
async function deleteVote(request, env, id) {
  if (!originAllowed(request, env)) return json({ error: 'Not allowed from here.' }, 403);

  const build = await one(env, id);
  if (!build) return json({ error: 'No such build.' }, 404);

  const who = await fingerprint(request, env);
  const r = await env.DB.prepare(
    'DELETE FROM votes WHERE build_id = ? AND voter = ?'
  ).bind(id, who).run();

  const absent = !r.meta.changes;
  return json({ id: id, votes: build.votes - (absent ? 0 : 1), absent: absent });
}

/* A report is not moderation, it is a flag for a human: the row keeps serving
   until someone with the token looks at it. */
async function postReport(request, env, id) {
  if (!originAllowed(request, env)) return json({ error: 'Not allowed from here.' }, 403);
  const who = await fingerprint(request, env);
  await env.DB.prepare(
    `INSERT INTO reports (build_id, reporter, created) VALUES (?, ?, ?)
     ON CONFLICT (build_id, reporter) DO NOTHING`
  ).bind(id, who, new Date().toISOString()).run();
  return json({ ok: true });
}

/* ----------------------------------------------------------------- moderation */

function admin(request, env) {
  const want = env.ADMIN_TOKEN;
  const got = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  return !!want && timingSafe(got, want);
}

async function setHidden(request, env, id, hidden) {
  if (!admin(request, env)) return json({ error: 'No.' }, 401);
  await env.DB.prepare('UPDATE builds SET hidden = ? WHERE id = ?').bind(hidden, id).run();
  return json({ id: id, hidden: !!hidden });
}

async function reported(request, env) {
  if (!admin(request, env)) return json({ error: 'No.' }, 401);
  const { results } = await env.DB.prepare(
    `SELECT b.id, b.name, b.author, b.hidden,
            (SELECT COUNT(*) FROM reports r WHERE r.build_id = b.id) AS reports
     FROM builds b
     WHERE (SELECT COUNT(*) FROM reports r WHERE r.build_id = b.id) > 0
     ORDER BY reports DESC`).all();
  return json({ builds: results || [] });
}

/* ---------------------------------------------------------------------- bits */

function json(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, headers || {})
  });
}

async function readJson(request) {
  try { return await request.json(); } catch (e) { return null; }
}

function clean(text, limit) {
  return String(text == null ? '' : text)
    .replace(/[\x00-\x1f\x7f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, limit).trim();
}

function origins(env) {
  return String(env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
}

/* Reading is public — the list is public data and a copy of the planner run
   from a folder should still show it. Writing is held to the configured
   origins, which stops a page elsewhere from quietly posting as its visitors.
   It is a speed bump, not a wall: a request is not a browser and can claim any
   Origin it likes. The fingerprint and the caps are what actually hold. */
function corsFor(request, env) {
  const list = origins(env);
  const origin = request.headers.get('Origin') || '';
  const allow = !list.length || list.includes(origin) ? (origin || '*') : list[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Build-Key',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}

function originAllowed(request, env) {
  const list = origins(env);
  if (!list.length) return true;
  const origin = request.headers.get('Origin');
  return !origin || list.includes(origin);
}

/* Who a voter is, as far as this is willing to know: their address and user
   agent, salted and hashed, never stored in the clear and not reversible to an
   address. The user agent is in there so that an office behind one NAT is not
   one single voter; it also means a browser update reads as a new voter, which
   is the direction to err in. */
/* 24 random bytes, base64url — long enough that guessing is not a strategy and
   short enough to paste. */
function newKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sha256(text) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function fingerprint(request, env) {
  const ip = request.headers.get('CF-Connecting-IP') || '';
  const ua = request.headers.get('User-Agent') || '';
  const bytes = new TextEncoder().encode(`${env.VOTE_SALT || 'unsalted'}|${ip}|${ua}`);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join('');
}

/* Off unless a secret is configured, so the list can go up today and grow a
   CAPTCHA the day it needs one. */
async function turnstile(env, token, request) {
  if (!env.TURNSTILE_SECRET) return null;
  if (!token) return 'Complete the human check and try again.';
  const form = new FormData();
  form.append('secret', env.TURNSTILE_SECRET);
  form.append('response', token);
  form.append('remoteip', request.headers.get('CF-Connecting-IP') || '');
  const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',
    { method: 'POST', body: form });
  const out = await r.json();
  return out.success ? null : 'The human check did not pass — reload and try again.';
}

/* Compares without returning early on the first differing character. Length is
   checked first and does leak, which is why both things compared here are
   fixed-length: a SHA-256 hex digest, or a token whose length is not a secret. */
function timingSafe(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length || !a) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
