# Revenu Ad Library

A free, public library of 500+ high-performing B2B SaaS ad examples and landing-page templates, organised by formula.

Live at **[library.revenuagency.io](https://library.revenuagency.io)**.

## What's inside

Three libraries, each broken down by category:

- **LinkedIn Ads** — Problem · Product · Conversion · Convo Ads · Gated Content · Animations · The Playbook
- **Google Ads** — Brand · Non Brand · Competitor · The Playbook
- **Landing Pages** — Above the Fold · Blocks · Product Visuals

Every ad has its own shareable URL (e.g. `/linkedin-ads/problem-1`) and opens in an in-page lightbox with prev/next, swipe, drag, favorites, search, and shuffle. There's a password gate (`fox`) at the root URL; deep-link URLs are public.

## Local preview

Double-click `index.html`. The site uses a conditional `<base href="/">` so it works both in the browser via `file://` and on the live server — no terminal or local server needed.

## Add an ad

1. Drop the source file into the right folder, e.g. `images/LinkedIn Ads/Problem/My New Ad.webp`.
2. Convert to WebP if it isn't already (the runtime expects `.webp`).
3. Open `ads.js` and add an entry following the existing pattern:
   ```js
   {
     image: "My New Ad.webp",
     title: "Branded Notes",
     formula: "",
     tag: "Problem",
     category: "problem",
     platform: "linkedin"
   }
   ```
4. Run `node scripts/build-seo.js` to regenerate `sitemap.xml`, `api/ads.json`, the LLM-friendly files, and all 520+ pre-rendered HTML pages.
5. Commit and push — Vercel auto-deploys.

## Files at a glance

```
ad-library/
├── index.html              # SPA shell (root URL)
├── 404.html                # Vercel 404
├── styles.css
├── app.js                  # All runtime JS (no framework)
├── ads.js                  # The data — window.ADS = [...]
├── vercel.json             # Rewrites to per-URL HTML files
├── sitemap.xml             # Generated
├── robots.txt              # Allows all crawlers including AI bots
├── llms.txt / llms-full.txt# Generated — LLM-friendly site summaries
├── api/
│   ├── ads.json            # Generated — machine-readable library
│   └── library.md          # Generated — markdown index
├── google-ads.html, linkedin-ads.html, landing-pages.html  # Pre-rendered platform pages
├── google-ads/, linkedin-ads/, landing-pages/              # Pre-rendered per-category and per-ad
├── images/                 # WebP assets, organised by platform → category
├── favicon/
├── scripts/
│   ├── build-seo.js        # Regenerate SEO + LLM + pre-rendered HTML
│   └── build-og-images.py  # (Optional) Per-ad 1200×630 OG card composer
└── BUILD-NOTES.md          # Full architectural reference — read this for anything non-trivial
```

## Full reference

For the deep dive — data model, URL routing, every feature, build pipeline, maintenance recipes, architectural decisions and rationale — see **[BUILD-NOTES.md](./BUILD-NOTES.md)**.

## Deploy

Push to GitHub → Vercel auto-builds → `library.revenuagency.io` updates within ~30 seconds. No build step at runtime; pre-rendered HTML and SEO files are generated locally via `node scripts/build-seo.js` before committing.
