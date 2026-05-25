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
  linkedin: {
    path: '/linkedin-ads',
    label: 'LinkedIn Ads',
    defaultTab: 'all',
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
  google: {
    path: '/google-ads',
    label: 'Google Ads',
    defaultTab: 'all',
    folder: 'Google Ads',
    tabs: [
      { key: 'all',         label: 'All',          folder: '' },
      { key: 'brand',       label: 'Brand',        folder: 'Brand' },
      { key: 'non-brand',   label: 'Non Brand',    folder: 'Non Brand' },
      { key: 'competitor',  label: 'Competitor',   folder: 'Competitor' },
      { key: 'playbook',    label: 'The Playbook', folder: 'The Playbook' },
    ],
  },
  landing: {
    path: '/landing-pages',
    label: 'Landing Pages',
    defaultTab: 'all',
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

// ----- Pre-rendered HTML files per URL --------------------------------
// Strategy: use index.html as a template and only rewrite the head's
// meta tags + JSON-LD per URL. Body + scripts stay identical so the SPA
// hydrates exactly the same way it did before.
const indexTemplate = fs.readFileSync(path.join(REPO_ROOT, 'index.html'), 'utf8');

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function imagePathFor(ad) {
  const cfg = PLATFORMS[ad.platform || 'google'];
  const tab = cfg.tabs.find(t => t.key === ad.category);
  const tabFolder = tab ? tab.folder : '';
  return `images/${cfg.folder}/${tabFolder}/${ad.image}`;
}

function buildBreadcrumbs(platform, category, ad) {
  const cfg = PLATFORMS[platform];
  const list = [
    { name: 'Revenu Ad Library', item: BASE_URL + '/' },
    { name: cfg.label, item: BASE_URL + cfg.path }
  ];
  if (category && category !== cfg.defaultTab) {
    const catLabel = (cfg.tabs.find(t => t.key === category) || {}).label || category;
    if (ad) {
      list.push({ name: catLabel, item: BASE_URL + cfg.path + '/' + category });
      list.push({ name: ad.title, item: BASE_URL + cfg.path + '/' + ad.category + '-' + ad.id });
    } else {
      list.push({ name: catLabel, item: BASE_URL + cfg.path + '/' + category });
    }
  }
  return list;
}

function buildJsonLdFor({ platform, category, ad, canonical }) {
  const cfg = PLATFORMS[platform];
  const breadcrumb = {
    '@type': 'BreadcrumbList',
    itemListElement: buildBreadcrumbs(platform, category, ad).map((b, i) => ({
      '@type': 'ListItem', position: i + 1, name: b.name, item: b.item
    }))
  };
  if (ad) {
    const catLabel = (cfg.tabs.find(t => t.key === ad.category) || {}).label || ad.category;
    return {
      '@context': 'https://schema.org',
      '@type': 'ImageObject',
      '@id': canonical,
      name: ad.title,
      caption: ad.title + (ad.formula ? ' — ' + ad.formula : ''),
      description: `${ad.title}: a ${catLabel.toLowerCase()} ${cfg.label.toLowerCase()} example curated in the Revenu Ad Library.`,
      contentUrl: BASE_URL + '/' + imagePathFor(ad),
      keywords: [cfg.label, catLabel, ad.title, ad.formula, ad.tag, 'B2B SaaS', 'ad example'].filter(Boolean).join(', '),
      isPartOf: { '@id': BASE_URL + '/#website' },
      breadcrumb
    };
  }
  const name = category
    ? `${(cfg.tabs.find(t => t.key === category) || {}).label || category} — ${cfg.label}`
    : `${cfg.label} Library`;
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': canonical,
    name,
    description: `Curated collection of ${cfg.label.toLowerCase()} examples for B2B SaaS marketing.`,
    isPartOf: { '@id': BASE_URL + '/#website' },
    breadcrumb
  };
}

function buildPageHtml({ title, description, canonical, ogImage, jsonLd }) {
  let html = indexTemplate;
  html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`);
  html = html.replace(/(<meta name="description" content=")[\s\S]*?(")/, `$1${esc(description)}$2`);
  html = html.replace(/(<link rel="canonical"[^>]*href=")[\s\S]*?(")/, `$1${canonical}$2`);
  html = html.replace(/(<meta property="og:title" content=")[\s\S]*?(")/, `$1${esc(title)}$2`);
  html = html.replace(/(<meta property="og:description" content=")[\s\S]*?(")/, `$1${esc(description)}$2`);
  html = html.replace(/(<meta property="og:url" content=")[\s\S]*?(")/, `$1${canonical}$2`);
  if (ogImage) {
    html = html.replace(/(<meta property="og:image" content=")[\s\S]*?(")/g, `$1${ogImage}$2`);
    html = html.replace(/(<meta name="twitter:image" content=")[\s\S]*?(")/g, `$1${ogImage}$2`);
  }
  html = html.replace(/(<meta name="twitter:title" content=")[\s\S]*?(")/, `$1${esc(title)}$2`);
  html = html.replace(/(<meta name="twitter:description" content=")[\s\S]*?(")/, `$1${esc(description)}$2`);
  html = html.replace(
    /(<script type="application\/ld\+json" id="page-jsonld">)([\s\S]*?)(<\/script>)/,
    `$1${JSON.stringify(jsonLd)}$3`
  );
  return html;
}

function writePage(urlPath, html) {
  // urlPath like "/linkedin-ads" -> "linkedin-ads.html"
  // urlPath like "/linkedin-ads/problem-3" -> "linkedin-ads/problem-3.html"
  const clean = urlPath.replace(/^\/+/, '').replace(/\/+$/, '');
  if (!clean) return; // root is index.html — left alone
  const filePath = path.join(REPO_ROOT, clean + '.html');
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, html);
}

let pagesWritten = 0;
// Platform-level pages (/google-ads, /linkedin-ads, /landing-pages)
for (const [platform, cfg] of Object.entries(PLATFORMS)) {
  const canonical = BASE_URL + cfg.path;
  const title = `${cfg.label} Library | Revenu`;
  const description = `A free library of high-performing ${cfg.label} examples for B2B SaaS. Browse curated, real-world templates categorized by formula.`;
  const jsonLd = buildJsonLdFor({ platform, category: null, ad: null, canonical });
  writePage(cfg.path, buildPageHtml({ title, description, canonical, jsonLd }));
  pagesWritten++;
}
// Category pages
for (const [platform, cats] of Object.entries(categoriesByPlatform)) {
  const cfg = PLATFORMS[platform];
  // explicit /all
  {
    const canonical = BASE_URL + cfg.path + '/all';
    const title = `All ${cfg.label} examples | Revenu`;
    const description = `Every ${cfg.label} example in the Revenu Ad Library — all categories, all formulas.`;
    const jsonLd = buildJsonLdFor({ platform, category: 'all', ad: null, canonical });
    writePage(cfg.path + '/all', buildPageHtml({ title, description, canonical, jsonLd }));
    pagesWritten++;
  }
  for (const cat of cats) {
    if (cat === cfg.defaultTab) continue;
    const catLabel = (cfg.tabs.find(t => t.key === cat) || {}).label || cat;
    const canonical = BASE_URL + cfg.path + '/' + cat;
    const title = `${catLabel} — ${cfg.label} examples | Revenu`;
    const description = `${catLabel} ${cfg.label} examples from the Revenu Ad Library — proven B2B SaaS templates categorized by formula.`;
    const jsonLd = buildJsonLdFor({ platform, category: cat, ad: null, canonical });
    writePage(cfg.path + '/' + cat, buildPageHtml({ title, description, canonical, jsonLd }));
    pagesWritten++;
  }
}
// Individual ad pages
for (const ad of ads) {
  const platform = ad.platform || 'google';
  const cfg = PLATFORMS[platform];
  const catLabel = (cfg.tabs.find(t => t.key === ad.category) || {}).label || ad.category;
  const urlPath = cfg.path + '/' + ad.category + '-' + ad.id;
  const canonical = BASE_URL + urlPath;
  const title = `${ad.title} — ${catLabel} ${cfg.label} example | Revenu`;
  const description = `${ad.title}${ad.formula ? ' — ' + ad.formula : ''} — a real ${catLabel} ${cfg.label} example from the Revenu Ad Library, a curated collection of high-performing B2B SaaS ad and landing page templates.`;
  const ogImage = BASE_URL + '/' + imagePathFor(ad); // ad's own image as fallback OG
  const jsonLd = buildJsonLdFor({ platform, category: ad.category, ad, canonical });
  writePage(urlPath, buildPageHtml({ title, description, canonical, ogImage, jsonLd }));
  pagesWritten++;
}
console.log(`✓ Pre-rendered HTML — ${pagesWritten} pages`);

console.log('\nAll SEO/LLM files regenerated.');
