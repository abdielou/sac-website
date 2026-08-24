# Brief: investigate the Vercel firewall on sac-website

Hand this to whoever (or whatever) has access to the Vercel dashboard.

## The symptom

Every non-browser HTTP client gets `HTTP 429` with header
`X-Vercel-Mitigated: challenge`, on all three hosts, including `/sitemap.xml`
and `/feed.xml`. A real Chromium browser is not challenged. Reproduced
2026-08-23 and 2026-08-24 with curl and Node HTTP clients.

The site owner believes they enabled "some sort of AI guard".

## The question that actually matters

**Is real Googlebot being challenged?**

This cannot be answered from outside the account, and specifically **cannot** be
answered by sending a fake Googlebot User-Agent. Vercel verifies bots by reverse
DNS lookup, so a spoofed UA from an arbitrary IP *correctly* fails verification
and gets challenged. A 429 in that test is expected and proves nothing.

Only two sources can settle it:

1. Vercel **Firewall logs**, filtered to the Googlebot user agent, showing
   whether those requests were `allowed` or `challenged` / `denied`.
2. Google Search Console **URL Inspection → Test Live URL**, which originates
   from real Google infrastructure.

## What to check, in order

| # | Where | What to report |
|---|---|---|
| 1 | Firewall → **Attack Challenge Mode** | On or off. This challenges *everything* unverified and is the most likely cause of a site-wide 429. |
| 2 | Firewall → **Bot Protection / BotID** | Enabled? In which mode? Which paths? |
| 3 | Firewall → managed rulesets, especially an **AI bots** ruleset | Enabled? Set to block or challenge? Which bots does it name? |
| 4 | Firewall → **custom rules** | Any rule matching all paths, or matching on user agent, or rate limiting. Quote each rule's condition and action. |
| 5 | Firewall → **verified bot allowlist / "Allow verified bots"** | Is it on? This is what exempts Googlebot from Attack Challenge Mode. |
| 6 | Firewall → **logs**, last 7 days | Filter for Googlebot, Bingbot. Report the action taken on those requests. This is the decisive evidence. |
| 7 | Project → Domains | Confirm `www.sociedadastronomia.com` is the production domain, and whether `sac-website.vercel.app` still serves traffic. |

## The distinction that matters

These are two different things and should not be conflated:

- **Blocking AI crawlers** (GPTBot, ClaudeBot, PerplexityBot, CCBot, Bytespider).
  A legitimate choice. It does **not** affect Google Search rankings. The
  tradeoff is that the site stops being quotable by AI assistants.
- **Challenging all unverified traffic** (Attack Challenge Mode). This *can*
  catch search crawlers if the verified-bot exemption is off, and would be
  catastrophic for search visibility.

If the owner wanted the first and got the second, that is the bug.

## Desired end state

- Googlebot and Bingbot reach every public URL with a `200`, including
  `/sitemap.xml`, `/robots.txt` and `/feed.xml`.
- If AI-crawler blocking is genuinely wanted, keep it, but scope it to those
  specific user agents rather than challenging everything.
- If Attack Challenge Mode is needed at all, scope it to `/api/`, `/admin` and
  `/member` rather than `/`.

## Do not change without asking

The site owner has not yet decided whether they *want* AI crawlers blocked.
Report findings first. The only change that is unambiguously correct is
ensuring verified search engine crawlers are exempt.
