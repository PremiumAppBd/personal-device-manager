# Cost on Cloudflare

For a few personal test devices, PDM runs on Cloudflare's **free** tier. You
should confirm current numbers on Cloudflare's pricing page, as limits change.

## Free for Phase 1 (what this repo uses)

| Component | Free allowance (approx) |
| --- | --- |
| Workers (the API) | ~100,000 requests/day |
| D1 (database) | ~5 GB storage; millions of row reads/day |
| Pages (dashboard hosting) | free static hosting |
| Cloudflare Access (login) | Zero Trust free: up to 50 users |
| `workers.dev` subdomain | free |

A handful of devices reporting status every 15 minutes is far below these
limits, so expect no bill.

## What would cost money (not used here)

- **Workers Paid ($5/month)** if you exceed the free request limit, or need
  features tied to the paid plan.
- **Durable Objects / Realtime TURN** — only relevant to live video signaling,
  which this project does not implement.
- **R2 storage** beyond ~10 GB/month — only relevant to media storage, which
  this project does not implement.
- **A custom domain** — free DNS if you already own a domain; otherwise the
  domain registration fee.

## Safety

This repo never provisions paid resources or deploys on its own. Nothing is
live until you personally run `wrangler deploy` (or the deploy script and
confirm the prompt).
