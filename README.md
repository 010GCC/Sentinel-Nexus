# SolunIP Labs

Free IP enrichment and lead validation for marketing ops teams. Upload a CSV of form submissions (or paste IPs) and get location, network type, an email-to-company match score, and an A/B/C lead grade for every row.

Live: https://soluniplabs.com · Tool: https://soluniplabs.com/app/ · Docs: https://soluniplabs.com/docs/

## How it's built

Everything runs on Cloudflare (DNS, hosting, and API):

```
Browser ──► soluniplabs-site (Worker)
              ├─ static pages (site/)
              ├─ /api/lookup, /api/batch ──► ipinfo-proxy (Worker, service binding) ──► IPinfo API
              └─ /api/contact ──► KV (contact form messages) + email copy via Cloudflare Email Routing
```

- **The visitor's CSV never leaves the browser.** Parsing and scoring happen client-side (`site/app/`). Only IP addresses are sent for lookup.
- **ipinfo-proxy** holds the IPinfo token as the `IPINFO_TOKEN` secret. It accepts requests only from soluniplabs.com, rejects private IPs, caches results for 24 hours, and allows 60 requests per minute per visitor.

## Repo layout

| Path | What it is |
|------|------------|
| `site/` | Static site: landing page, `/app/` tool, `/docs/`, `/privacy/`, `/terms/`, 404 |
| `site/app/scoring.js` | Email-to-company matching, network classification, lead grading (pure functions) |
| `site/app/app.js` | Tool UI: CSV parsing, column detection, batching, table, export |
| `site-worker/` | `soluniplabs-site` Worker: serves the site, same-origin API, redirects from the old Hostinger URLs |
| `worker/` | `ipinfo-proxy` Worker |
| `tests/` | Scoring tests (`npm test`) |

## Develop

```bash
npm test                          # scoring unit tests (Node 20+)
npx wrangler dev -c site-worker/wrangler.toml
```

## Deploy

**The site deploys itself.** Every push to `main` that changes `site/` or `site-worker/` starts a
Cloudflare Workers Build for `soluniplabs-site`:

1. Runs the scoring tests (`npm run build` in `site-worker/`). A failing test stops the deploy.
2. Runs `npx wrangler deploy`, which uploads the worker and every file in `site/` together.

Build logs: Cloudflare dashboard > Workers & Pages > soluniplabs-site > Deployments.

The lookup proxy is deployed by hand when it changes:

```bash
npx wrangler deploy -c worker/wrangler.toml
```

Secrets and settings live in Cloudflare, not in this repo:

- `IPINFO_TOKEN` (secret, on `ipinfo-proxy`)
- `NOTIFY_TO` (variable, on `soluniplabs-site`): the inbox that receives contact form copies. `keep_vars = true` stops deploys from removing it.
- KV namespace `soluniplabs-messages` (contact form messages, kept 12 months). The older `soluniplabs-site` namespace is only a fallback now.

## License

MIT
