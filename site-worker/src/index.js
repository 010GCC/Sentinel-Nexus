// soluniplabs.com site worker
// Serves the static site (env.ASSETS) and same-origin API routes:
//   GET  /api/lookup?ip=   -> ipinfo-proxy (service binding IPINFO)
//   POST /api/batch        -> ipinfo-proxy /batch
//   POST /api/subscribe    -> HubSpot Forms submission (needs HUBSPOT_PORTAL_ID + HUBSPOT_FORM_ID vars)
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

async function subscribe(req, env) {
  const d = await req.json().catch(() => null);
  if (!d) return json({ error: "Bad request" }, 400);
  const email = String(d.email || "").trim().slice(0, 254);
  const company = String(d.company || "").trim().slice(0, 200);
  const jobtitle = String(d.jobtitle || "").trim().slice(0, 200);
  if (!EMAIL.test(email)) return json({ error: "Please enter a valid email" }, 400);
  if (!company) return json({ error: "Please enter your company" }, 400);
  if (!env.HUBSPOT_PORTAL_ID || !env.HUBSPOT_FORM_ID) return json({ error: "Signups aren't switched on yet" }, 503);

  const fields = [
    { objectTypeId: "0-1", name: "email", value: email },
    { objectTypeId: "0-1", name: "company", value: company },
  ];
  if (jobtitle) fields.push({ objectTypeId: "0-1", name: "jobtitle", value: jobtitle });

  const page = String(d.page || "https://soluniplabs.com/");
  const body = {
    fields,
    context: {
      pageUri: page.startsWith("https://") ? page.slice(0, 500) : "https://soluniplabs.com/",
      pageName: "SolunIP Labs - " + String(d.source || "site").slice(0, 40),
      ipAddress: req.headers.get("CF-Connecting-IP") || undefined,
    },
  };
  if (env.HUBSPOT_CONSENT_TEXT) {
    body.legalConsentOptions = {
      consent: {
        consentToProcess: true,
        text: env.HUBSPOT_CONSENT_TEXT,
        communications: env.HUBSPOT_SUBSCRIPTION_TYPE_ID && d.optin === "yes"
          ? [{ value: true, subscriptionTypeId: Number(env.HUBSPOT_SUBSCRIPTION_TYPE_ID), text: "Send me occasional lead validation tips" }]
          : [],
      },
    };
  }
  const r = await fetch(
    `https://api.hsforms.com/submissions/v3/integration/submit/${env.HUBSPOT_PORTAL_ID}/${env.HUBSPOT_FORM_ID}`,
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }
  );
  if (!r.ok) {
    const t = await r.text();
    console.log("hubspot error", r.status, t.slice(0, 500));
    return json({ error: "Couldn't save your signup right now" }, 502);
  }
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
      if (url.pathname === "/api/subscribe" && req.method === "POST") return await subscribe(req, env);
      if (url.pathname === "/api/health") return json({ ok: true, lookup: Boolean(env.IPINFO), signups: Boolean(env.HUBSPOT_PORTAL_ID && env.HUBSPOT_FORM_ID) });
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
  const cache = ext === "html" ? "public, max-age=0, must-revalidate" : "public, max-age=3600";
  return new Response(req.method === "HEAD" ? null : body, { status, headers: { "content-type": TYPES[ext] || "application/octet-stream", "cache-control": cache } });
}
