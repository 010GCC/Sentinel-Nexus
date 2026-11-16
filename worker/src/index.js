// SolunIP Labs IP lookup proxy (replaces ipinfo-proxy and solunip-api-proxy)
// GET  /?ip=8.8.8.8          single lookup (same contract the app uses today)
// POST /batch  {"ips":[...]} up to 100 lookups in one call
// The IPinfo token stays server side as the IPINFO_TOKEN secret.

const ALLOWED_ORIGINS = [
  "https://soluniplabs.com",
  "https://www.soluniplabs.com",
];
const MAX_BATCH = 100;
const CACHE_TTL = 60 * 60 * 24; // IP data changes slowly; cache a day

function corsHeaders(origin) {
  const allowed =
    ALLOWED_ORIGINS.includes(origin) || /\.pages\.dev$/.test(new URL(origin || "http://x").hostname);
  return {
    "Access-Control-Allow-Origin": allowed ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...corsHeaders(origin) },
  });
}

const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
const IPV6 = /^[0-9a-f:]+$/i;

function isPublicIp(ip) {
  if (IPV4.test(ip)) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 10 || a === 127 || a === 0 || a >= 224) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT
    return true;
  }
  if (IPV6.test(ip) && ip.includes(":")) {
    const l = ip.toLowerCase();
    return !(l === "::1" || l === "::" || l.startsWith("fe80") || l.startsWith("fc") || l.startsWith("fd"));
  }
  return false;
}

async function lookup(ip, env, ctx) {
  ip = String(ip || "").trim();
  if (!isPublicIp(ip)) return { ip, error: "invalid or private IP" };

  const cache = caches.default;
  const key = new Request(`https://cache.solunip/ip/${ip}`);
  const hit = await cache.match(key);
  if (hit) return hit.json();

  if (!env.IPINFO_TOKEN) return { ip, error: "server missing IPINFO_TOKEN secret" };

  const r = await fetch(`https://ipinfo.io/${encodeURIComponent(ip)}/json`, {
    headers: { Authorization: `Bearer ${env.IPINFO_TOKEN}`, Accept: "application/json" },
  });
  let data;
  try {
    data = await r.json();
  } catch {
    data = { ip, error: `upstream returned non-JSON (HTTP ${r.status})` };
  }
  if (!r.ok) {
    return { ip, error: data?.error?.message || data?.error || `upstream HTTP ${r.status}`, status: r.status };
  }
  ctx.waitUntil(
    cache.put(key, new Response(JSON.stringify(data), {
      headers: { "content-type": "application/json", "Cache-Control": `max-age=${CACHE_TTL}` },
    }))
  );
  return data;
}

export default {
  async fetch(req, env, ctx) {
    const origin = req.headers.get("Origin") || "";
    const url = new URL(req.url);

    if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(origin) });

    // Optional rate limit binding (see wrangler.toml); skipped if not configured
    if (env.RATE_LIMITER) {
      const who = req.headers.get("CF-Connecting-IP") || "unknown";
      const { success } = await env.RATE_LIMITER.limit({ key: who });
      if (!success) return json({ error: "rate limited, try again in a minute" }, 429, origin);
    }

    try {
      if (req.method === "GET" && url.pathname === "/health") {
        return json({ ok: true, token: Boolean(env.IPINFO_TOKEN) }, 200, origin);
      }

      if (req.method === "GET") {
        const ip = url.searchParams.get("ip");
        if (!ip) return json({ error: "missing ip parameter" }, 400, origin);
        const data = await lookup(ip, env, ctx);
        return json(data, data.error ? data.status || 400 : 200, origin);
      }

      if (req.method === "POST" && url.pathname === "/batch") {
        const body = await req.json().catch(() => null);
        const ips = Array.isArray(body?.ips) ? body.ips.slice(0, MAX_BATCH) : null;
        if (!ips || !ips.length) return json({ error: "body must be {\"ips\": [...]}" }, 400, origin);
        const results = await Promise.all(ips.map((ip) => lookup(ip, env, ctx)));
        return json({ results }, 200, origin);
      }

      return json({ error: "not found" }, 404, origin);
    } catch (err) {
      return json({ error: err.message || "internal error" }, 500, origin);
    }
  },
};
