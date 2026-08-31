# SEO audit and remediation

## The audit

Run 2026-08-23 against the repository and the live site. Six parallel dimension audits
(metadata, crawlability, structured data, article on-page, performance, information
architecture), followed by an independent adversarial refutation pass on each finding.
132 raw findings, 61 survived.

| File | Contents |
|---|---|
| `2026-08-23-SEO-AUDIT.md` | Full report: verdict, findings by tier, remediation plan, content strategy, measurement |
| `sac-search-audit.html` | Source of the shareable report artifact |
| `findings-confirmed.json` | The 61 verified findings, machine readable |
| `findings-refuted.json` | The 42 refuted claims and why each failed |

Shareable report: https://claude.ai/code/artifact/21d46302-b6b7-4207-9649-75406f159090

## The core problem

The article template is sound. Discovery and identity were broken.

Verified live on 2026-08-23, before remediation:

| Signal | State |
|---|---|
| `sitemap.xml` | 182 bytes, one `<loc>`, pointing at `sac-website.vercel.app//gallery` |
| `robots.txt` | 404 |
| `rel=canonical` | absent site-wide |
| `og:url` and JSON-LD `url` | `https://sac-website.vercel.app//blog/...` |
| `feed.xml` | 77 items, every link malformed the same way |

## Still owned by a human

These cannot be fixed in the repository:

1. **Vercel firewall.** Every non-browser client gets HTTP 429 with
   `X-Vercel-Mitigated: challenge`, including `/sitemap.xml` and `/feed.xml`.
   Confirm in Search Console (URL Inspection, Test Live URL) that Googlebot is exempt.
   If it is not, disable Attack Challenge Mode or scope it to `/api/`, `/admin`, `/member`.
2. **Search Console.** Add a domain property for `sociedadastronomia.com`, and a temporary
   URL-prefix property for `sac-website.vercel.app` to watch the duplicate host disappear.
3. **Sitemap submission.** Submit only after the new `app/sitemap.js` is deployed.

## Refuted, do not re-raise

Relative `publisher.logo.url`, missing `mainEntityOfPage`, the 110-character headline
limit, `NewsArticle` over `Article`, the 1200px schema image threshold, heading-hierarchy
skips, multiple `h1`, `WebSite` with `SearchAction`, `site.webmanifest` contents, and
`lang="en"` on the Pages-Router surface. All obsolete guidance or not search related.
See `findings-refuted.json` for the reasoning on each.
