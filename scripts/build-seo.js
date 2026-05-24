#!/usr/bin/env node
/**
 * Regenerates SEO + LLM-friendly files from ads.js
 *
 *   sitemap.xml         — every URL on the site (root, platforms, categories, individual ads)
 *   api/ads.json        — full library as JSON
 *   api/library.md      — full library as a crawlable markdown index
 *   llms.txt            — short site summary (https://llmstxt.org standard)
 *   llms-full.txt       — every ad in plain text for LLM indexing
 *
 * Run after editing ads.js:
 *   node scripts/build-seo.js
 */

const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://library.revenuagency.io';
const REPO_ROOT = path.join(__dirname, '..');

// Mirror app.js' platform config (kept in sync manually — verify on changes).
const PLATFORMS = {
  google: {
    path: '/google-ads',
    label: 'Google Ads',
    defaultTab: 'non-brand',
    folder: 'Google Ads',
    tabs: [
      { key: 'all',         label: 'All',          folder: '' },
      { key: 'brand',       label: 'Brand',        folder: 'Brand' },
      { key: 'non-brand',   label: 'Non Brand',    folder: 'Non Brand' },
      { key: 'competitor',  label: 'Competitor',   folder: 'Competitor' },
      { key: 'playbook',    label: 'The Playbook', folder: 'The Playbook' },
    ],
  },
  linkedin: {
    path: '/linkedin-ads',
    label: 'LinkedIn Ads',
    defaultTab: 'problem',
    folder: 'LinkedIn Ads',
    tabs: [
      { key: 'all',           label: 'All',           folder: '' },
      { key: 'problem',       label: 'Problem',       folder: 'Problem' },
      { key: 'product',       label: 'Product',       folder: 'Product' },
      { key: 'conversion',    label: 'Conversion',    folder: 'Conversion' },
      { key: 'convo-ads',     label: 'Convo Ads',     folder: 'Convo Ads' },
      { key: 'gated-content', label: 'Gated Content', folder: 'Gated Content' },
      { key: 'playbook',      label: 'The Playbook',  folder: 'The Playbook' },
      { key: 'animations',    label: 'Animations',    folder: 'Animations' },
    ],
  },
  landing: {
    path: '/landing-pages',
    label: 'Landing Pages',
    defaultTab: 'above-the-fold',
    folder: 'Landing Pages',
    tabs: [
      { key: 'all',              label: 'All',              folder: '' },
      { key: 'above-the-fold',   label: 'Above the Fold',   folder: 'Above the Fold' },
      { key: 'blocks',           label: 'Blocks',           folder: 'Blocks' },
      { key: 'product-visuals',  label: 'Product Visuals',  folder: 'Product Visuals' },
    ],
  },
};

// Load ads.js by faking `window` then evaluating the file in this scope.
global.window = {};
const adsSource = fs.readFileSync(path.join(REPO_ROOT, 'ads.js'), 'utf8');
// eslint-disable-next-line no-eval
eval(adsSource);
const ads = global.window.ADS;
if (!Array.isArray(ads)) { console.error('ads.js did not set window.ADS'); process.exit(1); }

// Assign per-category IDs the same way app.js does at runtime.
const idCounters = {};
for (const ad of ads) {
  const p = ad.platform || 'google';
  const k = `${p}|${ad.category}`;
  idCounters[k] = (idCounters[k] || 0) + 1;
  ad.id = idCounters[k];
}

// Tabs that actually have content in this build (so we don't list empty pages)
const categoriesByPlatform = {};
for (const ad of ads) {
  const p = ad.platform || 'google';
  if (!categoriesByPlatform[p]) categoriesByPlatform[p] = new Set();
  categoriesByPlatform[p].add(ad.category);
}

// ----- sitemap.xml -----
const urls = new Set();
urls.add(BASE_URL + '/');
for (const platform of Object.keys(PLATFORMS)) {
  urls.add(BASE_URL + PLATFORMS[platform].path);
}
for (const [platform, cats] of Object.entries(categoriesByPlatform)) {
  // /platform/all
  urls.add(BASE_URL + PLATFORMS[platform].path + '/all');
  for (const cat of cats) {
    if (cat === PLATFORMS[platform].defaultTab) continue; // default lives at /platform
    urls.add(BASE_URL + PLATFORMS[platform].path + '/' + cat);
  }
}
for (const ad of ads) {
  const p = ad.platform || 'google';
  urls.add(BASE_URL + PLATFORMS[p].path + '/' + ad.category + '-' + ad.id);
}

const today = new Date().toISOString().slice(0, 10);
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[...urls].sort().map(url => {
  let priority = '0.6';
  if (url === BASE_URL + '/') priority = '1.0';
  else if (Object.values(PLATFORMS).some(p => url === BASE_URL + p.path)) priority = '0.9';
  else if (!/-\d+$/.test(url)) priority = '0.8';
  return `  <url>\n    <loc>${url}</loc>\n    <lastmod>${today}</lastmod>\n    <priority>${priority}</priority>\n  </url>`;
}).join('\n')}
</urlset>
`;
fs.writeFileSync(path.join(REPO_ROOT, 'sitemap.xml'), sitemap);
console.log(`✓ sitemap.xml — ${urls.size} URLs`);

// ----- api/ads.json -----
fs.mkdirSync(path.join(REPO_ROOT, 'api'), { recursive: true });
fs.writeFileSync(
  path.join(REPO_ROOT, 'api', 'ads.json'),
  JSON.stringify({
    site: BASE_URL,
    generated: new Date().toISOString(),
    total: ads.length,
    platforms: Object.fromEntries(
      Object.entries(PLATFORMS).map(([k, v]) => [k, { label: v.label, path: v.path }])
    ),
    ads: ads.map(ad => ({
      platform: ad.platform || 'google',
      category: ad.category,
      id: ad.id,
      title: ad.title,
      formula: ad.formula || '',
      tag: ad.tag || '',
      image: ad.image,
      url: BASE_URL + PLATFORMS[ad.platform || 'google'].path + '/' + ad.category + '-' + ad.id,
      imageUrl: BASE_URL + '/images/' +
        PLATFORMS[ad.platform || 'google'].folder + '/' +
        (PLATFORMS[ad.platform || 'google'].tabs.find(t => t.key === ad.category)?.folder || '') + '/' +
        ad.image,
    })),
  }, null, 2)
);
console.log(`✓ api/ads.json — ${ads.length} ads`);

// ----- llms.txt (short, llmstxt.org standard) -----
const adsByPlatform = {};
for (const ad of ads) {
  const p = ad.platform || 'google';
  if (!adsByPlatform[p]) adsByPlatform[p] = [];
  adsByPlatform[p].push(ad);
}

const llmsShort = `# Revenu Ad Library

> A free library of ${ads.length}+ high-performing B2B SaaS ad and landing page examples, curated and built by Revenu Agency. Browse the actual creative — categorized by platform and formula — to learn what's working in LinkedIn ads, Google ads, and landing pages.

## Libraries

- [LinkedIn Ads](${BASE_URL}/linkedin-ads) — ${(adsByPlatform.linkedin || []).length} examples across Problem, Product, Conversion, Convo Ads, Gated Content, Animations, and Playbook insights
- [Google Ads](${BASE_URL}/google-ads) — ${(adsByPlatform.google || []).length} examples across Brand, Non Brand, Competitor, and Playbook
- [Landing Pages](${BASE_URL}/landing-pages) — ${(adsByPlatform.landing || []).length} examples across Above the Fold, Blocks, and Product Visuals

## Browsing

URL structure: \`/<platform>/<category>-<id>\` opens an individual ad in the preview lightbox.

Example: ${BASE_URL}/linkedin-ads/problem-1 opens the first LinkedIn Problem-stage ad.

## Data

- [Machine-readable ads list (JSON)](${BASE_URL}/api/ads.json)
- [Full library index (Markdown)](${BASE_URL}/api/library.md)
- [Detailed plain-text version of every ad](${BASE_URL}/llms-full.txt)

## About

Built by [Revenu Agency](https://www.revenuagency.io). Each example is a real ad or landing page section observed in the wild, recreated and categorized by its underlying formula so marketers can find proven approaches by intent.
`;
fs.writeFileSync(path.join(REPO_ROOT, 'llms.txt'), llmsShort);
console.log('✓ llms.txt');

// ----- llms-full.txt (every ad in plain text) -----
function tabLabel(platformKey, catKey) {
  return PLATFORMS[platformKey].tabs.find(t => t.key === catKey)?.label || catKey;
}

const llmsFullSections = [];
for (const [platform, platformAds] of Object.entries(adsByPlatform)) {
  const cfg = PLATFORMS[platform];
  llmsFullSections.push(`## ${cfg.label} (${platformAds.length} examples)\n`);

  const byCategory = {};
  for (const ad of platformAds) {
    if (!byCategory[ad.category]) byCategory[ad.category] = [];
    byCategory[ad.category].push(ad);
  }
  for (const [cat, catAds] of Object.entries(byCategory)) {
    llmsFullSections.push(`### ${tabLabel(platform, cat)} — ${catAds.length} examples\n`);
    for (const ad of catAds) {
      const url = BASE_URL + cfg.path + '/' + ad.category + '-' + ad.id;
      const parts = [`- **${ad.title}**`];
      if (ad.formula) parts.push(`(${ad.formula})`);
      parts.push(`— [${url}](${url})`);
      llmsFullSections.push(parts.join(' '));
    }
    llmsFullSections.push('');
  }
}

const llmsFull = `# Revenu Ad Library — Full Index

> Comprehensive list of every ad and landing page example in the Revenu Ad Library.
> Each entry includes the formula name and a direct URL to view it.

Site: ${BASE_URL}
Total entries: ${ads.length}
Generated: ${new Date().toISOString()}

${llmsFullSections.join('\n')}
`;
fs.writeFileSync(path.join(REPO_ROOT, 'llms-full.txt'), llmsFull);
console.log(`✓ llms-full.txt — ${ads.length} ads`);

// ----- api/library.md (mirror of llms-full.txt at a friendlier URL) -----
fs.writeFileSync(path.join(REPO_ROOT, 'api', 'library.md'), llmsFull);
console.log('✓ api/library.md');

console.log('\nAll SEO/LLM files regenerated.');
