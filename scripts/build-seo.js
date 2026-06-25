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
  chatgpt: {
    path: '/chatgpt',
    label: 'ChatGPT Ads',
    defaultTab: 'all',
    folder: 'ChatGPT Ads',
    tabs: [
      { key: 'all',      label: 'All',          folder: '' },
      { key: 'playbook', label: 'The Playbook', folder: 'Playbook' },
      { key: 'formulas', label: 'Formulas',     folder: 'Formulas' },
      { key: 'setup',    label: 'The Setup',    folder: 'Setup' },
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

// ----- sitemap.xml (with image extension) -----
// In addition to <loc>/<lastmod>/<priority>, each per-ad URL now carries an
// <image:image> block so Google Image search indexes all 540+ creative
// assets. The image extension namespace is declared on the root <urlset>.

// Helper to build the full image URL for an ad — mirrors the JSON API path
// resolver below so we never get out of sync.
function imageUrlFor(ad) {
  const cfg = PLATFORMS[ad.platform || 'google'];
  const catFolder = (cfg.tabs.find(t => t.key === ad.category) || {}).folder || '';
  // Path segments may contain spaces (e.g. "LinkedIn Ads") — encode each one.
  const segs = ['/images', cfg.folder, catFolder, ad.image].filter(Boolean);
  return BASE_URL + segs.map(s => encodeURIComponent(s)).join('/').replace('%2F', '/');
}

// Index each ad by its URL so we can attach image data when emitting the URL block.
const adImageByUrl = new Map();
for (const ad of ads) {
  const url = BASE_URL + PLATFORMS[ad.platform || 'google'].path + '/' + ad.category + '-' + ad.id;
  const cfg = PLATFORMS[ad.platform || 'google'];
  const catLabel = (cfg.tabs.find(t => t.key === ad.category) || {}).label || ad.category;
  adImageByUrl.set(url, {
    loc: imageUrlFor(ad),
    title: `${ad.title} — ${catLabel} ${cfg.label} example`,
    caption: ad.formula || `${ad.title}: a ${catLabel.toLowerCase()} ${cfg.label.toLowerCase()} example from the Revenu Ad Library.`,
  });
}

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

// XML-escape special characters in <image:title>/<image:caption> values so
// e.g. an ampersand or quote in an ad copy line doesn't break the sitemap.
function xmlEscape(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

const today = new Date().toISOString().slice(0, 10);
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${[...urls].sort().map(url => {
  let priority = '0.6';
  if (url === BASE_URL + '/') priority = '1.0';
  else if (Object.values(PLATFORMS).some(p => url === BASE_URL + p.path)) priority = '0.9';
  else if (!/-\d+$/.test(url)) priority = '0.8';
  const img = adImageByUrl.get(url);
  const imageBlock = img
    ? `\n    <image:image>\n` +
      `      <image:loc>${xmlEscape(img.loc)}</image:loc>\n` +
      `      <image:title>${xmlEscape(img.title)}</image:title>\n` +
      `      <image:caption>${xmlEscape(img.caption)}</image:caption>\n` +
      `    </image:image>`
    : '';
  return `  <url>\n    <loc>${url}</loc>\n    <lastmod>${today}</lastmod>\n    <priority>${priority}</priority>${imageBlock}\n  </url>`;
}).join('\n')}
</urlset>
`;
fs.writeFileSync(path.join(REPO_ROOT, 'sitemap.xml'), sitemap);
console.log(`✓ sitemap.xml — ${urls.size} URLs, ${adImageByUrl.size} with image:image`);

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

// ---------- Library info-tip content per platform (mirrored from app.js) ----------
// Pre-rendered HTML for each library page carries its platform's tooltip so
// Google indexes the right keywords on the right URL. JS swaps content on
// runtime platform switches, but the static HTML matters for crawl-time.
const PLATFORM_TIPS = {
  linkedin: {
    title: 'About this LinkedIn Ads library',
    items: [
      { icon: 'rect:3 3 7 7 1|rect:14 3 7 7 1|rect:3 14 7 7 1|rect:14 14 7 7 1',
        label: '200+ LinkedIn ad examples',
        blurb: 'real B2B SaaS LinkedIn ads, sortable by intent and formula.' },
      { icon: 'M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z',
        label: 'Conversation, Convo, Problem, Product, Gated',
        blurb: 'every LinkedIn ad format we use, with proven creative examples.' },
      { icon: 'polygon:5 3 19 12 5 21 5 3',
        label: 'LinkedIn animated ads',
        blurb: 'dynamic creative templates and motion design patterns that get attention.' },
      { icon: 'polyline:23 6 13.5 15.5 8.5 10.5 1 18|polyline:17 6 23 6 23 12',
        label: 'Conversion-tested copy',
        blurb: 'headline patterns and CTAs from campaigns that actually drove demos.' },
    ],
  },
  google: {
    title: 'About this Google Ads library',
    items: [
      { icon: 'circle:11 11 8|m21 21-4.35-4.35',
        label: '150+ Google Ads examples',
        blurb: 'real B2B SaaS Google Ads, every keyword intent covered.' },
      { icon: 'circle:12 12 10|circle:12 12 6|circle:12 12 2',
        label: 'Brand, Non-Brand, Competitor',
        blurb: 'Google Ads formulas for every funnel stage, from category to brand to competitor capture.' },
      { icon: 'polyline:4 7 4 4 20 4 20 7|line:9 20 15 20|line:12 4 12 20',
        label: 'Headline patterns that convert',
        blurb: 'responsive search ad copy frameworks pulled from high-CTR campaigns.' },
      { icon: 'M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z|M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z',
        label: 'Playbook insights',
        blurb: 'campaign structure, bidding, match types, and what actually moves CPL.' },
    ],
  },
  landing: {
    title: 'About this Landing Pages library',
    items: [
      { icon: 'rect:3 3 18 18 2 2|line:3 9 21 9',
        label: '120+ landing page examples',
        blurb: 'real B2B SaaS landing page templates ready to inspire your next test.' },
      { icon: 'line:12 3 12 21|polyline:6 9 12 3 18 9',
        label: 'Above the Fold patterns',
        blurb: 'hero sections, headlines, and form layouts proven to convert.' },
      { icon: 'rect:3 3 7 7 1|rect:14 3 7 7 1|rect:3 14 7 7 1|rect:14 14 7 7 1',
        label: 'Reusable conversion Blocks',
        blurb: 'testimonials, features, comparisons, logos, and proof sections.' },
      { icon: 'rect:3 3 18 18 2 2|circle:8.5 8.5 1.5|polyline:21 15 16 10 5 21',
        label: 'Product Visuals and screenshots',
        blurb: 'mockups, devices, and product hero treatments that sell the experience.' },
    ],
  },
  chatgpt: {
    title: 'About this ChatGPT Ads library',
    items: [
      { icon: 'M12 3l1.9 4.7 4.6.5-3.5 3.1 1 4.6L12 13.8 7.9 16l1-4.6L5.5 8.2l4.6-.5L12 3z',
        label: '38 ChatGPT ad examples',
        blurb: 'the first curated library of ChatGPT advertising for B2B SaaS.' },
      { icon: 'M10 2v7.5a3 3 0 0 1-.6 1.8l-5.4 7.2A2 2 0 0 0 5.6 22h12.8a2 2 0 0 0 1.6-3.5l-5.4-7.2a3 3 0 0 1-.6-1.8V2|line:8 2 16 2',
        label: 'Ad Formulas',
        blurb: 'short, punchy templates that work inside ChatGPT search results.' },
      { icon: 'M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z|M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z',
        label: 'The Playbook',
        blurb: 'how ChatGPT advertising actually works: placement, copy, and headlines.' },
      { icon: 'circle:12 12 3|M12 2v3|M12 19v3|M4.93 4.93l2.12 2.12|M16.95 16.95l2.12 2.12|M2 12h3|M19 12h3|M4.93 19.07l2.12-2.12|M16.95 7.05l2.12-2.12',
        label: 'The Setup',
        blurb: 'full ChatGPT campaign and conversion tracking walkthrough.' },
    ],
  },
};
function renderTipIcon(spec) {
  // Mirror of _renderTipIcon in app.js — supports rect/circle/polygon/polyline/line/path.
  const parts = String(spec).split('|').map(token => {
    if (token.startsWith('rect:')) {
      const v = token.slice(5).split(/\s+/).map(Number);
      const [x, y, w, h, rx = 0, ry = 0] = v;
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" ry="${ry}"/>`;
    }
    if (token.startsWith('circle:')) {
      const [cx, cy, r] = token.slice(7).split(/\s+/).map(Number);
      return `<circle cx="${cx}" cy="${cy}" r="${r}"/>`;
    }
    if (token.startsWith('polygon:'))  return `<polygon points="${token.slice(8)}"/>`;
    if (token.startsWith('polyline:')) return `<polyline points="${token.slice(9)}"/>`;
    if (token.startsWith('line:')) {
      const [x1, y1, x2, y2] = token.slice(5).split(/\s+/).map(Number);
      return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
    }
    return `<path d="${token}"/>`;
  }).join('');
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${parts}</svg>`;
}
function buildLibraryTipFor(platform) {
  const tip = PLATFORM_TIPS[platform];
  if (!tip) return null;
  const itemsHtml = tip.items.map(item =>
    `<li>${renderTipIcon(item.icon)}<span><strong>${esc(item.label)}</strong>${esc(item.blurb)}</span></li>`
  ).join('');
  return { title: tip.title, itemsHtml };
}

function buildPageHtml({ title, description, canonical, ogImage, jsonLd, activePlatform }) {
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
  // Swap the library info-tip content to the active platform's keywords so
  // each pre-rendered URL ships SEO-relevant copy that matches its meta.
  const tip = activePlatform && activePlatform !== 'saved' ? buildLibraryTipFor(activePlatform) : null;
  if (tip) {
    html = html.replace(
      /(<p class="info-tip-title" id="library-info-title">)([\s\S]*?)(<\/p>)/,
      `$1${esc(tip.title)}$3`
    );
    html = html.replace(
      /(<ul class="info-tip-list" id="library-info-list">)([\s\S]*?)(<\/ul>)/,
      `$1${tip.itemsHtml}$3`
    );
  }
  // Inject is-active on the right header pill so it's highlighted from the
  // very first paint. Avoids the "wrong pill briefly active" flash that
  // happens when the static template carries a hard-coded is-active class.
  if (activePlatform) {
    html = html.replace(
      new RegExp(`(<a [^>]*?class="platform-pill(?:\\s+platform-pill-saved)?)(")(\\s+[^>]*?data-platform="${activePlatform}")`),
      '$1 is-active$2$3'
    );
  }
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
// Saved view (/saved). User-specific content, so JSON-LD is intentionally null.
{
  const canonical = BASE_URL + '/saved';
  const title = 'Saved | Revenu Ad Library';
  const description = 'Your saved ads from across the Revenu Ad Library — every Google, LinkedIn, and Landing Page example you have favorited, in one place.';
  writePage('/saved', buildPageHtml({ title, description, canonical, jsonLd: {}, activePlatform: 'saved' }));
  pagesWritten++;
}
// Per-platform OG preview images. These sit alongside the default og-image.png
// (which is now homepage-only) and are picked up by social link unfurlers
// (LinkedIn, Slack, X, FB) when sharing a library URL.
const PLATFORM_OG_IMAGE = {
  linkedin: '/og/linkedin-ads.png',
  google:   '/og/google-ads.png',
  landing:  '/og/landing-pages.png',
  chatgpt:  '/og/chatgpt.png',
};
// Platform-level pages (/google-ads, /linkedin-ads, /landing-pages, /chatgpt)
for (const [platform, cfg] of Object.entries(PLATFORMS)) {
  const canonical = BASE_URL + cfg.path;
  const title = `${cfg.label} Library | Revenu`;
  const description = `A free library of high-performing ${cfg.label} examples for B2B SaaS. Browse curated, real-world templates categorized by formula.`;
  const ogImage = BASE_URL + (PLATFORM_OG_IMAGE[platform] || '/og-image.png');
  const jsonLd = buildJsonLdFor({ platform, category: null, ad: null, canonical });
  writePage(cfg.path, buildPageHtml({ title, description, canonical, ogImage, jsonLd, activePlatform: platform }));
  pagesWritten++;
}
// Category pages — inherit the platform's OG image so shares of /chatgpt/playbook,
// /linkedin-ads/conversion, etc. show the correct library cover, not the LinkedIn default.
for (const [platform, cats] of Object.entries(categoriesByPlatform)) {
  const cfg = PLATFORMS[platform];
  const ogImage = BASE_URL + (PLATFORM_OG_IMAGE[platform] || '/og-image.png');
  // explicit /all
  {
    const canonical = BASE_URL + cfg.path + '/all';
    const title = `All ${cfg.label} examples | Revenu`;
    const description = `Every ${cfg.label} example in the Revenu Ad Library — all categories, all formulas.`;
    const jsonLd = buildJsonLdFor({ platform, category: 'all', ad: null, canonical });
    writePage(cfg.path + '/all', buildPageHtml({ title, description, canonical, ogImage, jsonLd, activePlatform: platform }));
    pagesWritten++;
  }
  for (const cat of cats) {
    if (cat === cfg.defaultTab) continue;
    const catLabel = (cfg.tabs.find(t => t.key === cat) || {}).label || cat;
    const canonical = BASE_URL + cfg.path + '/' + cat;
    const title = `${catLabel} — ${cfg.label} examples | Revenu`;
    const description = `${catLabel} ${cfg.label} examples from the Revenu Ad Library — proven B2B SaaS templates categorized by formula.`;
    const jsonLd = buildJsonLdFor({ platform, category: cat, ad: null, canonical });
    writePage(cfg.path + '/' + cat, buildPageHtml({ title, description, canonical, ogImage, jsonLd, activePlatform: platform }));
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
  writePage(urlPath, buildPageHtml({ title, description, canonical, ogImage, jsonLd, activePlatform: platform }));
  pagesWritten++;
}
console.log(`✓ Pre-rendered HTML — ${pagesWritten} pages`);

console.log('\nAll SEO/LLM files regenerated.');
