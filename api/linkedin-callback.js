/**
 * LinkedIn OAuth callback for the Revenu Ad Library.
 * Exchanges the authorization code for an access token, fetches the user's
 * OIDC profile, upserts them in Redis, and sets a signed session cookie.
 *
 * Setup (one-time):
 *  - LinkedIn app -> Auth -> add redirect: https://library.revenuagency.io/api/linkedin-callback
 *  - Vercel env vars: LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET, SESSION_SECRET
 *  - Vercel Upstash Redis integration (injects UPSTASH_REDIS_REST_URL/TOKEN)
 */
function cookieVal(req, name) {
  const c = req.headers.cookie || "";
  const m = c.match(new RegExp("(?:^|;\\s*)" + name + "=([^;]+)"));
  return m ? decodeURIComponent(m[1]) : null;
}

module.exports = async (req, res) => {
  const id = process.env.LINKEDIN_CLIENT_ID;
  const secret = process.env.LINKEDIN_CLIENT_SECRET;
  if (!id || !secret) { res.status(500).send("LINKEDIN_CLIENT_ID / LINKEDIN_CLIENT_SECRET not set in Vercel env."); return; }

  const q = req.query || {};
  if (q.error) { res.writeHead(302, { Location: "/?linkedin=error&reason=" + encodeURIComponent(q.error_description || q.error) }); res.end(); return; }
  if (!q.code) { res.status(400).send("Missing code."); return; }

  // CSRF check: state must match the cookie we set when starting the flow.
  const expected = cookieVal(req, "li_state");
  if (!expected || q.state !== expected) { res.status(400).send("State mismatch — start the sign-in flow again."); return; }

  const origin = "https://" + (req.headers["x-forwarded-host"] || req.headers.host);
  const redirect = origin + "/api/linkedin-callback";

  try {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code: q.code,
      redirect_uri: redirect,
      client_id: id,
      client_secret: secret,
    });
    const r = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    const j = await r.json();
    if (!j.access_token) { res.status(502).send("Token exchange failed: " + (j.error_description || JSON.stringify(j))); return; }

    /* Sign-in: fetch the OIDC userinfo and upsert the user record. The library
       only needs identification — no LinkedIn ads/API surface — so we don't
       persist the access token at all. The signed session cookie identifies
       the user across requests. */
    const { kvReady, kv, kvGetJSON, kvSetJSON, makeSession, sessionCookie } = require("./_lib.js");

    const ur = await fetch("https://api.linkedin.com/v2/userinfo", { headers: { authorization: "Bearer " + j.access_token } });
    const u = await ur.json();
    const cookies = [`li_state=; Path=/api; HttpOnly; Secure; SameSite=Lax; Max-Age=0`];
    let signin = "ok", why = "";
    try {
      if (!ur.ok || !u.sub) throw new Error("userinfo " + ur.status);
      if (!kvReady()) throw new Error("database not configured");
      const now = new Date().toISOString();
      const existing = (await kvGetJSON("user:" + u.sub)) || {};
      await kvSetJSON("user:" + u.sub, {
        sub: u.sub,
        firstName: u.given_name || existing.firstName || "",
        lastName: u.family_name || existing.lastName || "",
        email: u.email || existing.email || "",
        picture: u.picture || existing.picture || "",
        createdAt: existing.createdAt || now,
        lastActiveAt: now,
      });
      await kv(["SADD", "users", u.sub]);
      cookies.push(sessionCookie(makeSession(u.sub, 90), 90 * 86400));
    } catch (e) {
      signin = "failed";
      why = String((e && e.message) || e).slice(0, 140);
    }

    res.setHeader("Set-Cookie", cookies);
    res.writeHead(302, { Location: "/?linkedin=ok" + (signin === "failed" ? "&signin=failed&why=" + encodeURIComponent(why) : "") });
    res.end();
  } catch (err) {
    res.status(502).send("OAuth error: " + String((err && err.message) || err));
  }
};
