// soluniplabs.com site worker
// Serves the static site (from the SITE KV namespace) and same-origin API routes:
//   GET  /api/lookup?ip=   -> ipinfo-proxy (service binding IPINFO)
//   POST /api/batch        -> ipinfo-proxy /batch
//   POST /api/contact      -> saves the contact form message to the MESSAGES KV namespace
// Old Hostinger URLs are redirected to their new homes.

const REDIRECTS = {
  "/privacy_policy.html": "/privacy/",
  "/privacy.html": "/privacy/",
  "/terms_of_use.html": "/terms/",
  "/terms.html": "/terms/",
  "/wiki-home.html": "/docs/",
  "/docs.html": "/docs/",
  "/documentation": "/docs/",
  "/app/index.html": "/app/",
  "/index.html": "/",
};

const SECURITY_HEADERS = {
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; " +
    "connect-src 'self' https://ipinfo-proxy.gclark523.workers.dev; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "geolocation=(), camera=(), microphone=()",
  "Strict-Transport-Security": "max-age=31536000",
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
}

function withHeaders(res) {
  const r = new Response(res.body, res);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) r.headers.set(k, v);
  return r;
}

async function proxy(env, req, path) {
  if (!env.IPINFO) return json({ error: "lookup service not bound" }, 500);
  const headers = new Headers({ "content-type": "application/json" });
  const ip = req.headers.get("CF-Connecting-IP");
  if (ip) headers.set("CF-Connecting-IP", ip);
  const init = { method: req.method, headers };
  if (req.method === "POST") init.body = await req.text();
  const r = await env.IPINFO.fetch(new Request("https://ipinfo-proxy.internal" + path, init));
  return new Response(r.body, { status: r.status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
}

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,}$/i;
const clean = (v, max) => String(v || "").replace(/[\u0000-\u0008\u000b-\u001f]/g, "").trim().slice(0, max);

const isFormPost = (req) => (req.headers.get("content-type") || "").includes("application/x-www-form-urlencoded");

// Contact form: each message is saved to the MESSAGES KV namespace for 12 months
async function contact(req, env) {
  const d = isFormPost(req) ? Object.fromEntries(await req.formData()) : await req.json().catch(() => null);
  if (!d) return json({ error: "Bad request" }, 400);
  if (d.website) return json({ ok: true }); // hidden field only bots fill in
  const name = clean(d.name, 120);
  const email = clean(d.email, 254);
  const company = clean(d.company, 200);
  const message = clean(d.message, 4000);
  if (!name) return json({ error: "Please enter your name" }, 400);
  if (!EMAIL.test(email)) return json({ error: "Please enter a valid email" }, 400);
  if (message.length < 5) return json({ error: "Please enter a message" }, 400);
  if (!env.MESSAGES) return json({ error: "The contact form isn't switched on yet" }, 503);
  if (env.CONTACT_LIMITER) {
    const { success } = await env.CONTACT_LIMITER.limit({ key: req.headers.get("CF-Connecting-IP") || "unknown" });
    if (!success) return json({ error: "Too many messages, please try again in a minute" }, 429);
  }
  const received = new Date().toISOString();
  const key = "msg:" + received + ":" + crypto.randomUUID().slice(0, 8);
  await env.MESSAGES.put(key, JSON.stringify({ received, name, email, company, message, source: clean(d.source, 40) }), {
    expirationTtl: 60 * 60 * 24 * 365,
    metadata: { name, email },
  });
  return json({ ok: true });
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    if (url.hostname === "www.soluniplabs.com") {
      url.hostname = "soluniplabs.com";
      return Response.redirect(url.toString(), 301);
    }
    const to = REDIRECTS[url.pathname];
    if (to) return Response.redirect(new URL(to, url).toString(), 301);

    try {
      if (url.pathname === "/api/lookup" && req.method === "GET") return await proxy(env, req, "/?ip=" + encodeURIComponent(url.searchParams.get("ip") || ""));
      if (url.pathname === "/api/batch" && req.method === "POST") return await proxy(env, req, "/batch");
      if (url.pathname === "/api/contact" && req.method === "POST") {
        const r = await contact(req, env);
        // Plain form post (script not loaded): send the visitor back to the page with a status flag
        return isFormPost(req) ? Response.redirect(new URL(r.ok ? "/?sent=1#contact" : "/?sent=0#contact", url).toString(), 303) : r;
      }
      if (url.pathname === "/api/health") return json({ ok: true, lookup: Boolean(env.IPINFO), contact: Boolean(env.MESSAGES) });
      if (url.pathname.startsWith("/api/")) return json({ error: "not found" }, 404);
    } catch (e) {
      return json({ error: e.message || "internal error" }, 500);
    }

    return withHeaders(env.ASSETS ? await env.ASSETS.fetch(req) : await serveFromKV(req, url, env));
  },
};

// Fallback static serving from a KV namespace (SITE), keyed by path like "/app/index.html"
const TYPES = { html: "text/html; charset=utf-8", js: "text/javascript; charset=utf-8", css: "text/css; charset=utf-8", svg: "image/svg+xml", png: "image/png", jpg: "image/jpeg", xml: "application/xml", txt: "text/plain; charset=utf-8", json: "application/json" };
async function serveFromKV(req, url, env) {
  if (req.method !== "GET" && req.method !== "HEAD") return new Response("Method not allowed", { status: 405 });
  let p = decodeURIComponent(url.pathname);
  if (p.includes("..")) return new Response("Bad request", { status: 400 });
  let key = p.endsWith("/") ? p + "index.html" : p;
  let body = await env.SITE.get(key, "arrayBuffer");
  if (!body && !p.endsWith("/") && !/\.[a-z0-9]+$/i.test(p) && (await env.SITE.get(p + "/index.html", "arrayBuffer"))) {
    return Response.redirect(new URL(p + "/" + url.search, url).toString(), 301);
  }
  let status = 200;
  if (!body) { key = "/404.html"; body = await env.SITE.get(key, "arrayBuffer"); status = 404; }
  const ext = key.split(".").pop();
  const cache = ext === "html" ? "public, max-age=0, must-revalidate" : "public, max-age=300";
  return new Response(req.method === "HEAD" ? null : body, { status, headers: { "content-type": TYPES[ext] || "application/octet-stream", "cache-control": cache } });
}
