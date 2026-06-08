/**
 * Auth + profile + favorites + admin endpoints for the Revenu Ad Library.
 *
 * GET actions:
 *  - ?action=authurl         redirect to LinkedIn's consent screen
 *  - ?action=me              who's signed in? { user, favoritesCount, usersCount }
 *  - ?action=getfavs         the signed-in user's favorites list
 *  - ?action=signout         clear the session cookie
 *  - ?action=admin           full user list (admins only)
 *  - ?action=authdiag        health probe for the sign-in stack
 *
 * POST actions:
 *  - { action: "savefavs", favorites: [...] }   persist the user's favorites
 *  - { action: "deleteaccount" }                wipe the signed-in user
 *  - { action: "admindelete", sub: "..." }      admins delete any user
 *
 * The session cookie is set by /api/linkedin-callback. It's a signed HMAC
 * (`lib_session`) that lives in HttpOnly storage — page JS can never read it.
 */
const LIB = require("./_lib.js");

module.exports = async (req, res) => {
  const id = process.env.LINKEDIN_CLIENT_ID;
  if (!id) { res.status(500).json({ error: "LINKEDIN_CLIENT_ID not set in Vercel env." }); return; }

  /* ---------- POST actions ---------- */
  if (req.method === "POST") {
    let body = req.body;
    if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) { body = {}; } }
    body = body || {};

    /* Persist the signed-in user's favorites. The whole array is replaced
       every time (write-through from the client's toggleFavorite). */
    if (body.action === "savefavs") {
      const sub = LIB.readSession(req);
      if (!sub) { res.status(401).json({ error: "Not signed in." }); return; }
      const favs = Array.isArray(body.favorites) ? body.favorites.map(String).slice(0, 10000) : null;
      if (!favs) { res.status(400).json({ error: "Missing favorites array." }); return; }
      try {
        await LIB.kvSetJSON("favs:" + sub, { favorites: favs, updatedAt: new Date().toISOString() });
        res.status(200).json({ ok: true, count: favs.length });
      } catch (e) { res.status(500).json({ error: String(e.message || e) }); }
      return;
    }

    /* Delete the signed-in user: record + favorites + membership. Clears
       the session cookie. */
    if (body.action === "deleteaccount") {
      const sub = LIB.readSession(req);
      if (!sub) { res.status(401).json({ error: "Not signed in." }); return; }
      try {
        await LIB.kv(["DEL", "user:" + sub, "favs:" + sub]);
        await LIB.kv(["SREM", "users", sub]);
      } catch (e) { res.status(500).json({ error: String(e.message || e) }); return; }
      res.setHeader("Set-Cookie", LIB.clearSessionCookie());
      res.status(200).json({ ok: true });
      return;
    }

    /* Admin: delete another user entirely. Email allowlist via ADMIN_EMAILS env. */
    if (body.action === "admindelete") {
      const ADMINS = (process.env.ADMIN_EMAILS || "joe@revenuagency.io,ukjosephhill@gmail.com").toLowerCase().split(/[,\s]+/).filter(Boolean);
      const sub = LIB.readSession(req);
      if (!sub) { res.status(401).json({ error: "Not signed in." }); return; }
      let me = null;
      try { me = await LIB.kvGetJSON("user:" + sub); } catch (e) {}
      if (!me || !ADMINS.includes(String(me.email || "").toLowerCase())) { res.status(403).json({ error: "Not authorized." }); return; }
      const target = String(body.sub || "").trim();
      if (!target) { res.status(400).json({ error: "Missing user id." }); return; }
      try {
        await LIB.kv(["DEL", "user:" + target, "favs:" + target]);
        await LIB.kv(["SREM", "users", target]);
        res.status(200).json({ ok: true });
      } catch (e) { res.status(500).json({ error: String(e.message || e) }); }
      return;
    }

    res.status(400).json({ error: "Unknown POST action. Use savefavs | deleteaccount | admindelete." });
    return;
  }

  /* ---------- GET actions ---------- */
  const q = req.query || {};
  const action = q.action || "";
  const origin = "https://" + (req.headers["x-forwarded-host"] || req.headers.host);
  const redirect = origin + "/api/linkedin-callback";

  if (action === "authurl") {
    /* OIDC scopes only — we don't need ad API access, just identity. */
    const scopes = process.env.LINKEDIN_SCOPES || "openid profile email";
    const state = Math.random().toString(36).slice(2) + Date.now().toString(36);
    res.setHeader("Set-Cookie", `li_state=${state}; Path=/api; HttpOnly; Secure; SameSite=Lax; Max-Age=600`);
    const u = "https://www.linkedin.com/oauth/v2/authorization" +
      "?response_type=code&client_id=" + encodeURIComponent(id) +
      "&redirect_uri=" + encodeURIComponent(redirect) +
      "&state=" + state +
      "&scope=" + encodeURIComponent(scopes);
    res.writeHead(302, { Location: u });
    res.end();
    return;
  }

  if (action === "me") {
    /* Who's signed in? Touches lastActiveAt at most once per hour. */
    const sub = LIB.readSession(req);
    if (!sub) { res.status(200).json({ user: null }); return; }
    try {
      const u = await LIB.kvGetJSON("user:" + sub);
      if (!u) { res.setHeader("Set-Cookie", LIB.clearSessionCookie()); res.status(200).json({ user: null }); return; }
      if (!u.lastActiveAt || Date.now() - Date.parse(u.lastActiveAt) > 3600e3) {
        u.lastActiveAt = new Date().toISOString();
        await LIB.kvSetJSON("user:" + sub, u);
      }
      let usersCount = null;
      try { usersCount = await LIB.kv(["SCARD", "users"]); } catch (e) {}
      let favorites = [];
      try { const fb = await LIB.kvGetJSON("favs:" + sub); if (fb && Array.isArray(fb.favorites)) favorites = fb.favorites; } catch (e) {}
      res.status(200).json({
        user: { sub: u.sub, firstName: u.firstName, lastName: u.lastName, email: u.email, picture: u.picture, createdAt: u.createdAt },
        favorites,
        usersCount,
      });
    } catch (e) { res.status(200).json({ user: null, error: String(e.message || e) }); }
    return;
  }

  if (action === "getfavs") {
    /* Standalone read of just the favorites — used by background re-syncs. */
    const sub = LIB.readSession(req);
    if (!sub) { res.status(401).json({ error: "Not signed in." }); return; }
    try {
      const fb = await LIB.kvGetJSON("favs:" + sub);
      res.status(200).json({ favorites: (fb && Array.isArray(fb.favorites)) ? fb.favorites : [], updatedAt: (fb && fb.updatedAt) || null });
    } catch (e) { res.status(500).json({ error: String(e.message || e) }); }
    return;
  }

  if (action === "signout") {
    res.setHeader("Set-Cookie", LIB.clearSessionCookie());
    res.status(200).json({ ok: true });
    return;
  }

  if (action === "admin") {
    /* Full user list — restricted to ADMIN_EMAILS. Returns every user with
       name, email, picture, signup date, last-active, and favorites count. */
    const ADMINS = (process.env.ADMIN_EMAILS || "joe@revenuagency.io,ukjosephhill@gmail.com").toLowerCase().split(/[,\s]+/).filter(Boolean);
    const sub = LIB.readSession(req);
    if (!sub) { res.status(401).json({ error: "Not signed in." }); return; }
    let me = null;
    try { me = await LIB.kvGetJSON("user:" + sub); } catch (e) {}
    if (!me || !ADMINS.includes(String(me.email || "").toLowerCase())) {
      res.status(403).json({ error: "Not authorized." }); return;
    }
    try {
      const ids = (await LIB.kv(["SMEMBERS", "users"])) || [];
      const users = [];
      for (let i = 0; i < ids.length; i += 50) {
        const chunk = ids.slice(i, i + 50);
        const userVals = await LIB.kv(["MGET", ...chunk.map((s) => "user:" + s)]);
        const favVals = await LIB.kv(["MGET", ...chunk.map((s) => "favs:" + s)]);
        (userVals || []).forEach((raw, i2) => {
          if (!raw) return;
          try {
            const u = JSON.parse(raw);
            let favCount = 0;
            try { const fb = favVals && favVals[i2] ? JSON.parse(favVals[i2]) : null; if (fb && Array.isArray(fb.favorites)) favCount = fb.favorites.length; } catch (e) {}
            users.push({
              sub: u.sub,
              firstName: u.firstName,
              lastName: u.lastName,
              email: u.email,
              picture: u.picture,
              createdAt: u.createdAt,
              lastActiveAt: u.lastActiveAt,
              favoritesCount: favCount,
            });
          } catch (e) {}
        });
      }
      users.sort((a, b) => Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0));
      res.status(200).json({ count: users.length, users });
    } catch (e) { res.status(500).json({ error: String(e.message || e) }); }
    return;
  }

  if (action === "authdiag") {
    /* Health check — useful when something's not working. */
    const out = { dbConfigured: LIB.kvReady(), dbOk: false, session: !!LIB.readSession(req) };
    if (out.dbConfigured) { try { out.dbOk = (await LIB.kv(["PING"])) === "PONG"; } catch (e) { out.dbError = String(e.message || e).slice(0, 140); } }
    res.status(200).json(out);
    return;
  }

  res.status(400).json({ error: "Unknown action. Use authurl | me | getfavs | signout | admin." });
};
