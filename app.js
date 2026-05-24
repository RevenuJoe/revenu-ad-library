// ---------- Ad Library — gallery + lightbox ----------

// ---------- Homepage password gate ----------
// Gates only the root URL "/". Platform URLs (/google-ads, /linkedin-ads,
// /landing-pages and their /<category>-<n> children) skip the gate entirely
// so shared deep-links remain freely accessible.
const PASSWORD = 'fox';
const PASSWORD_KEY = 'ad-library-access';
let gateActive = false;
function hasUnlocked() {
  try { return localStorage.getItem(PASSWORD_KEY) === 'ok'; } catch (e) { return false; }
}
function shouldGate() {
  const path = (window.location.pathname || '/').replace(/\/+$/, '') || '/';
  if (path !== '/') return false;
  return !hasUnlocked();
}
function showGate() {
  gateActive = true;
  const gate = document.getElementById('password-gate');
  if (!gate) return;
  // Stage 1: show the library un-blurred for ~1s so the user can see what's
  // inside. Stage 2: add the .gated class which animates a CSS blur in over
  // 0.5s. Stage 3: reveal the password card with a slide-in from the left.
  // We don't auto-focus the input — the user has to tap "Enter" themselves.
  setTimeout(() => {
    document.body.classList.add('gated');
  }, 1000);
  setTimeout(() => {
    gate.hidden = false;
    // Force reflow so the .is-entering class triggers its animation cleanly
    void gate.offsetWidth;
    gate.classList.add('is-entering');
  }, 1300);
}
function hideGate() {
  gateActive = false;
  // Re-render the gallery with the pop-in animation so cards visibly arrive
  // on unlock — same animation users see when they first land on a library.
  if (typeof render === 'function') render(true);
  document.body.classList.remove('gated');
  const gate = document.getElementById('password-gate');
  if (gate) {
    gate.classList.remove('is-entering');
    gate.hidden = true;
  }
  // Sync URL to whatever platform is currently visible (user may have toggled
  // platforms while the gate was up — the URL was held at "/" until now).
  const newPath = PLATFORM_TO_PATH[activePlatform];
  if (newPath && window.location.pathname === '/' && activePlatform !== 'linkedin') {
    window.history.replaceState({}, '', newPath);
  }
}
// Wire up the password form (scripts load at body bottom, so the form exists).
(function attachGateForm() {
  const form = document.getElementById('password-form');
  if (!form) return;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const input = document.getElementById('password-input');
    const error = document.getElementById('password-error');
    const value = (input.value || '').trim().toLowerCase();
    if (value === PASSWORD.toLowerCase()) {
      try { localStorage.setItem(PASSWORD_KEY, 'ok'); } catch (err) {}
      playSuccessThenReveal();
    } else {
      if (error) error.hidden = false;
      input.value = '';
      input.focus();
    }
  });
})();

// Success animation: tick draws → "Thanks!" → "Enjoy the best libraries in
// B2B SaaS" → hold → fade out → reveal the library with the pop animation.
function playSuccessThenReveal() {
  const form = document.getElementById('password-form');
  const success = document.getElementById('password-success');
  if (!form || !success) { hideGate(); return; }

  // Step 1: hide the form, show the success card with its enter animations.
  form.hidden = true;
  success.hidden = false;
  // Forcing reflow so the .is-playing class triggers the keyframes cleanly.
  void success.offsetWidth;
  success.classList.add('is-playing');

  // Step 2: hold ~1.0s after the last text fades in, then fade the card out.
  // (tick ~0.05–0.5s, Thanks 0.55–0.95s, Message 0.85–1.25s, hold to ~2.2s)
  setTimeout(() => {
    success.classList.add('is-leaving');
  }, 2200);

  // Step 3: once the card has faded, close the gate so the library animates in.
  setTimeout(() => {
    hideGate();
    // Reset success state in case the gate is shown again later
    success.classList.remove('is-playing', 'is-leaving');
    success.hidden = true;
    form.hidden = false;
  }, 2600);
}

const gallery = document.getElementById('gallery');
const emptyState = document.getElementById('empty-state');
const tabsContainer = document.getElementById('filters');
const filterDropdown = document.getElementById('filter-dropdown');
const filterDropdownTrigger = document.getElementById('filter-dropdown-trigger');
const filterDropdownLabel = document.getElementById('filter-dropdown-label');
const filterDropdownMenu = document.getElementById('filter-dropdown-menu');
const featurePillsContainer = document.getElementById('feature-pills');
const platformPills = document.querySelectorAll('.platform-pill');
const platformDropdown = document.getElementById('platform-dropdown');
const platformDropdownTrigger = document.getElementById('platform-dropdown-trigger');
const platformDropdownLabel = document.getElementById('platform-dropdown-label');
const platformDropdownMenu = document.getElementById('platform-dropdown-menu');
const heroTitle = document.getElementById('hero-title');

const lightbox = document.getElementById('lightbox');
const lbImage = document.getElementById('lb-image');
const lbCaption = document.getElementById('lb-caption');
const lbClose = document.getElementById('lb-close');
const lbPrev = document.getElementById('lb-prev');
const lbNext = document.getElementById('lb-next');

// ---------- Platform config ----------
// Each platform has its own headline label, image folder, feature bullet
// points, tabs, and default tab. Tabs map category keys (used in ads.js) to
// the folder name on disk.
const platforms = {
  google: {
    label: 'Google Ads',
    folder: 'Google Ads',
    features: ['30+ Ad Formulas', 'Proven High CTR', 'Higher Quality Scores'],
    defaultTab: 'non-brand',
    tabs: [
      { key: 'all',         label: 'All',          folder: '' },
      { key: 'brand',       label: 'Brand',        folder: 'Brand' },
      { key: 'non-brand',   label: 'Non Brand',    folder: 'Non Brand' },
      { key: 'competitor',  label: 'Competitor',   folder: 'Competitor' },
      { key: 'playbook',    label: 'The Playbook', folder: 'The Playbook' }
    ]
  },
  linkedin: {
    label: 'LinkedIn Ads',
    folder: 'LinkedIn Ads',
    features: ['Increase Your CTR', 'Drive More Demos', 'Stop The Scroll'],
    defaultTab: 'problem',
    tabs: [
      { key: 'all',           label: 'All',           folder: '' },
      { key: 'problem',       label: 'Problem',       folder: 'Problem' },
      { key: 'product',       label: 'Product',       folder: 'Product' },
      { key: 'conversion',    label: 'Conversion',    folder: 'Conversion' },
      { key: 'convo-ads',     label: 'Convo Ads',     folder: 'Convo Ads' },
      { key: 'gated-content', label: 'Gated Content', folder: 'Gated Content' },
      { key: 'playbook',      label: 'The Playbook',  folder: 'The Playbook' },
      { key: 'animations',    label: 'Animations',    folder: 'Animations' }
    ]
  },
  landing: {
    label: 'Landing Pages',
    folder: 'Landing Pages',
    features: ['Increase Your Conversion Rate', 'Tell A Better Story', 'Beat Your Competition'],
    defaultTab: 'above-the-fold',
    tabs: [
      { key: 'all',             label: 'All',             folder: '' },
      { key: 'above-the-fold',  label: 'Above the Fold',  folder: 'Above the Fold' },
      { key: 'blocks',          label: 'Blocks',          folder: 'Blocks' },
      { key: 'conversion-path', label: 'Conversion Path', folder: 'Conversion Path' }
    ]
  }
};

// ---------- Favorites ----------
// Per-ad heart toggle, stored in localStorage. The favorites filter button on
// the desktop filter bar restricts the gallery to only favorited ads.
// The filter state is tracked PER-PLATFORM so switching libraries doesn't
// drag the toggle with you, but coming back to a library restores its state.
const FAVORITES_KEY = 'ad-library-favorites';
const favoritesModeByPlatform = { google: false, linkedin: false, landing: false };
function getFavoritesMode() { return !!favoritesModeByPlatform[activePlatform]; }
const favorites = new Set();
try {
  const raw = JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]');
  if (Array.isArray(raw)) raw.forEach(k => favorites.add(k));
} catch (e) {}
function adKey(ad) {
  return `${ad.platform || 'google'}|${ad.category}|${ad.id}`;
}
function isFavorite(ad) { return favorites.has(adKey(ad)); }
function persistFavorites() {
  try { localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favorites])); } catch (e) {}
}
function toggleFavorite(ad) {
  const k = adKey(ad);
  if (favorites.has(k)) favorites.delete(k);
  else favorites.add(k);
  persistFavorites();
}

// ---------- URL routing ----------
// Each platform has its own clean URL: /google-ads, /linkedin-ads, /landing-pages.
// Each ad has a deep-link URL: /<platform>-<id>, e.g. /linkedin-ads-5.
// Root URL "/" defaults to LinkedIn. vercel.json rewrites all of these to index.html.
const PATH_TO_PLATFORM = {
  '/google-ads': 'google',
  '/linkedin-ads': 'linkedin',
  '/landing-pages': 'landing'
};
const PLATFORM_TO_PATH = {
  google:   '/google-ads',
  linkedin: '/linkedin-ads',
  landing:  '/landing-pages'
};

function parsePath() {
  const path = (window.location.pathname || '/').replace(/\/+$/, '') || '/';
  // /platform or /platform/category[-id]
  const m = path.match(/^\/(google-ads|linkedin-ads|landing-pages)(?:\/(.+))?$/);
  if (!m) return { platform: 'linkedin', category: null, adId: null };
  const platform = PATH_TO_PLATFORM['/' + m[1]];
  if (!m[2]) return { platform, category: null, adId: null };
  // Try <category>-<id> first (greedy on the category so multi-hyphen names like
  // convo-ads-3 or above-the-fold-12 split correctly).
  const idMatch = m[2].match(/^(.+)-(\d+)$/);
  if (idMatch) {
    return { platform, category: idMatch[1], adId: parseInt(idMatch[2], 10) };
  }
  return { platform, category: m[2], adId: null };
}
function platformFromPath() { return parsePath().platform; }

// Build the URL for a given platform / category / optional ad ID.
// Drops the category when it's the platform's default (keeps /linkedin-ads clean).
function buildPath(platform, category, adId) {
  const platformPath = PLATFORM_TO_PATH[platform];
  if (adId != null) return `${platformPath}/${category}-${adId}`;
  if (!category || category === platforms[platform].defaultTab) return platformPath;
  return `${platformPath}/${category}`;
}
function adPath(ad) {
  return buildPath(ad.platform || 'google', ad.category, ad.id);
}
function findAd(platform, category, id) {
  return allAds.find(a =>
    (a.platform || 'google') === platform &&
    a.category === category &&
    a.id === id
  );
}

let allAds = [];
let visibleAds = [];
let currentIndex = 0;
let activePlatform = platformFromPath();
let activeFilter; // determined below, once allAds are loaded and we know if a deep-link ad picks a category
let isFirstRender = true;

function currentPlatform() { return platforms[activePlatform] || platforms.google; }

function findTab(platformKey, tabKey) {
  const cfg = platforms[platformKey] || platforms.google;
  return cfg.tabs.find(t => t.key === tabKey);
}

function imagePath(ad) {
  const cfg = platforms[ad.platform || 'google'] || platforms.google;
  const tab = cfg.tabs.find(t => t.key === ad.category);
  const tabFolder = tab ? tab.folder : '';
  // Relative path. On the live site the <base href="/"> tag in index.html
  // makes this resolve from the site root, so nested URLs like
  // /linkedin-ads/problem-3 still find the right images. Locally (file://),
  // <base> is skipped and the path resolves from the document's directory.
  return `images/${cfg.folder}/${tabFolder}/${ad.image}`;
}

// ---------- Column count toggle (desktop) ----------
const viewToggle = document.getElementById('view-toggle');
const COLS_KEY = 'ad-library-cols';

function setColumns(n) {
  const cols = String(n);
  gallery.classList.remove('cols-1', 'cols-2', 'cols-3');
  gallery.classList.add(`cols-${cols}`);
  viewToggle.querySelectorAll('.view-toggle-btn').forEach(b => {
    b.classList.toggle('is-active', b.dataset.cols === cols);
  });
  try { localStorage.setItem(COLS_KEY, cols); } catch (e) {}
}

// Restore saved preference. Mobile only allows 1 or 2 columns; desktop allows 1/2/3.
// First-time mobile visitors get 1-col; desktop defaults to 2-col.
const savedCols = (() => {
  try { return localStorage.getItem(COLS_KEY); } catch (e) { return null; }
})();
const _isMobileViewport = window.matchMedia('(max-width: 960px)').matches;
const _allowedCols = _isMobileViewport ? ['1', '2'] : ['1', '2', '3'];
const _useCols = (savedCols && _allowedCols.includes(savedCols))
  ? savedCols
  : (_isMobileViewport ? '1' : '2');
setColumns(_useCols);

viewToggle.querySelectorAll('.view-toggle-btn').forEach(btn => {
  btn.addEventListener('click', () => setColumns(btn.dataset.cols));
});

// ---------- Shuffle button (desktop) ----------
// Reorders the ads currently visible in the active platform + category.
// Uses Fisher–Yates and re-renders without re-filtering, so the new order
// sticks until you change platform / category or hit shuffle again.
const shuffleBtn = document.getElementById('shuffle-btn');

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

shuffleBtn.addEventListener('click', () => {
  if (visibleAds.length < 2) return;
  // Pure shuffle — priority pinning is intentionally NOT re-applied.
  // Shuffle takes priority over the curated order, so pinned ads (Question
  // Animated, the LinkedIn animations, etc.) get tossed in with everything else.
  shuffleInPlace(visibleAds);
  renderCards(true); // animate to highlight the new order
  shuffleBtn.classList.remove('is-spinning');
  void shuffleBtn.offsetWidth;
  shuffleBtn.classList.add('is-spinning');
});
shuffleBtn.addEventListener('animationend', () => {
  shuffleBtn.classList.remove('is-spinning');
});

// ---------- Favorites filter (desktop) ----------
// Toggle: when active, render() restricts visibleAds to favorited ads only.
// State is per-platform — switching libraries clears the visual filter, and
// coming back to a library restores whatever state it had.
const favoritesFilterBtn = document.getElementById('favorites-filter-btn');
function syncFavoritesButton() {
  if (!favoritesFilterBtn) return;
  const on = getFavoritesMode();
  favoritesFilterBtn.classList.toggle('is-active', on);
  favoritesFilterBtn.setAttribute('aria-pressed', String(on));
  const svg = favoritesFilterBtn.querySelector('svg');
  if (svg) svg.setAttribute('fill', on ? 'currentColor' : 'none');
}
if (favoritesFilterBtn) {
  favoritesFilterBtn.addEventListener('click', () => {
    favoritesModeByPlatform[activePlatform] = !getFavoritesMode();
    syncFavoritesButton();
    render(true);
  });
}
syncFavoritesButton();

// ---------- Search control (desktop) ----------
// Click the magnifying glass → input slides out, focuses. Press Enter →
// applies the filter and collapses back to the icon, with an accent dot
// shown on the icon while a search is active.
const searchControl = document.getElementById('search-control');
const searchBtn = document.getElementById('search-btn');
const searchInput = document.getElementById('search-input');
const searchIndicator = document.getElementById('search-indicator');
let searchQuery = '';

function openSearch() {
  if (!searchControl) return;
  searchControl.classList.add('is-open');
  searchInput.value = searchQuery; // restore current query for editing
  // Wait for the slide-out before grabbing focus so iOS-style soft-keyboards
  // (where applicable) and the visible caret line up with the open state.
  setTimeout(() => searchInput.focus(), 60);
}
function closeSearch() {
  if (!searchControl) return;
  searchControl.classList.remove('is-open');
  searchInput.blur();
}
function applySearch(rawQuery) {
  searchQuery = (rawQuery || '').trim();
  if (searchIndicator) searchIndicator.hidden = !searchQuery;
  render(true); // pop-in animation for the filtered results
}

if (searchBtn) {
  searchBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (searchControl.classList.contains('is-open')) {
      // Clicking the icon while open commits whatever's in the box
      applySearch(searchInput.value);
      closeSearch();
    } else {
      openSearch();
    }
  });
}
if (searchInput) {
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      applySearch(searchInput.value);
      closeSearch();
    } else if (e.key === 'Escape') {
      // Esc just closes without changing the active filter
      closeSearch();
    }
  });
  // Close when clicking outside (but ignore clicks on the search button itself)
  document.addEventListener('click', (e) => {
    if (!searchControl) return;
    if (!searchControl.classList.contains('is-open')) return;
    if (searchControl.contains(e.target)) return;
    closeSearch();
  });
}

// ---------- Load ads ----------
allAds = window.ADS || [];
// Assign per-category sequential IDs (1-based) so each ad has a stable deep-link URL.
// /linkedin-ads/problem-3, /google-ads/non-brand-1, /landing-pages/above-the-fold-12, etc.
const _idCounters = {};
allAds.forEach(ad => {
  const key = `${ad.platform || 'google'}|${ad.category}`;
  _idCounters[key] = (_idCounters[key] || 0) + 1;
  ad.id = _idCounters[key];
});

// If the URL points at a specific category and/or ad, start the library on that
// category so the slide-in opens against the matching tab.
const _initial = parsePath();
let _initialAd = (_initial.category && _initial.adId != null)
  ? findAd(activePlatform, _initial.category, _initial.adId)
  : null;
activeFilter = (_initialAd && _initialAd.category)
  || _initial.category
  || platforms[activePlatform].defaultTab;

// Sync the desktop platform pills to the URL-derived activePlatform
platformPills.forEach(p => p.classList.toggle('is-active', p.dataset.platform === activePlatform));
renderFeaturePills();
renderTabs();
updateHeadline();
render(true); // initial load — animate

// Deep-link: after the library is on screen, fade the backdrop in and slide
// the image in from the left. Brief delay so the user sees the library first.
if (_initialAd) {
  setTimeout(() => {
    const idx = visibleAds.indexOf(_initialAd);
    if (idx !== -1) openLightbox(idx, { slideIn: true, updateUrl: false });
  }, 400);
}

// Homepage gate — show after library renders so the blurred preview is visible.
if (shouldGate()) showGate();

// ---------- Headline + tab title ----------
function updateHeadline() {
  const cfg = currentPlatform();
  heroTitle.innerHTML = `<span class="hero-title-accent">${escapeHtml(cfg.label)}</span> Library`;
  document.title = `${cfg.label} Library | Revenu`;
}

// ---------- Feature pills (3 bullet badges) ----------
function renderFeaturePills() {
  const cfg = currentPlatform();
  featurePillsContainer.innerHTML = cfg.features.map((text, i) => `
    <div class="feature-pill"><span class="feature-pill-num">${i + 1}</span>${escapeHtml(text)}</div>
  `).join('');
}

// ---------- Category tabs (desktop) + custom dropdown (mobile) ----------
function renderTabs() {
  const cfg = currentPlatform();
  // Desktop tabs
  tabsContainer.innerHTML = cfg.tabs.map(t => `
    <button class="tab${t.key === activeFilter ? ' is-active' : ''}" data-filter="${escapeHtml(t.key)}" role="tab">${escapeHtml(t.label)}</button>
  `).join('');
  tabsContainer.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => setFilter(btn.dataset.filter));
  });
  // Mobile custom dropdown
  const activeTab = cfg.tabs.find(t => t.key === activeFilter);
  filterDropdownLabel.textContent = activeTab ? activeTab.label : '';
  filterDropdownMenu.innerHTML = cfg.tabs.map(t => `
    <button type="button" role="option" class="dropdown-option${t.key === activeFilter ? ' is-active' : ''}" data-filter="${escapeHtml(t.key)}">${escapeHtml(t.label)}</button>
  `).join('');
  filterDropdownMenu.querySelectorAll('.dropdown-option').forEach(opt => {
    opt.addEventListener('click', () => {
      setFilter(opt.dataset.filter);
      filterDropdown.classList.remove('is-open');
      filterDropdownTrigger.setAttribute('aria-expanded', 'false');
    });
  });
}

function setFilter(key, opts = {}) {
  if (!key || key === activeFilter) return;
  activeFilter = key;
  // Sync desktop tabs
  tabsContainer.querySelectorAll('.tab').forEach(b => {
    b.classList.toggle('is-active', b.dataset.filter === key);
  });
  // Sync mobile dropdown
  const cfg = currentPlatform();
  const activeTab = cfg.tabs.find(t => t.key === key);
  if (activeTab) filterDropdownLabel.textContent = activeTab.label;
  filterDropdownMenu.querySelectorAll('.dropdown-option').forEach(o => {
    o.classList.toggle('is-active', o.dataset.filter === key);
  });
  // If favorites filter is on and the new category has zero favorited ads,
  // automatically release the filter so the gallery isn't empty.
  if (getFavoritesMode()) {
    const hasAnyFavInCategory = allAds.some(ad =>
      (ad.platform || 'google') === activePlatform &&
      (key === 'all' || ad.category === key) &&
      isFavorite(ad)
    );
    if (!hasAnyFavInCategory) {
      favoritesModeByPlatform[activePlatform] = false;
      if (typeof syncFavoritesButton === 'function') syncFavoritesButton();
    }
  }
  render();
  // Push URL so categories are sharable. Skip when popstate / deep-link triggered it.
  if (opts.updateUrl !== false) {
    const newPath = buildPath(activePlatform, key, null);
    if (window.location.pathname !== newPath) {
      window.history.pushState({ category: key }, '', newPath);
    }
  }
}

// Toggle mobile filter dropdown
filterDropdownTrigger.addEventListener('click', (e) => {
  e.stopPropagation();
  const isOpen = filterDropdown.classList.toggle('is-open');
  filterDropdownTrigger.setAttribute('aria-expanded', String(isOpen));
});

// ---------- Gallery ----------
// `animate` is true on initial load and platform switches, false on category-tab switches.
// render() refilters from allAds; renderCards() just paints whatever is currently in visibleAds
// (used by the shuffle button so it doesn't re-sort back into the original order).
// True when an ad has an explicit position priority for the given category.
// Used both for "appears in this secondary category" and ordering within it.
function isPinnedTo(ad, filter) {
  return ad.priority && typeof ad.priority[filter] === 'number';
}
// Position priority for an ad in a category (lower = higher in list).
// Returns Infinity for ads without an explicit priority — they sort to the end.
function adPriority(ad, filter) {
  if (ad.priority && typeof ad.priority[filter] === 'number') return ad.priority[filter];
  return Infinity;
}

function render(animate = false) {
  visibleAds = allAds.filter(ad => {
    if ((ad.platform || 'google') !== activePlatform) return false;
    // 'all' shows every category in the current platform
    if (activeFilter !== 'all') {
      // Match if this is the ad's primary category, or if it's pinned here
      const matchesCategory = ad.category === activeFilter || isPinnedTo(ad, activeFilter);
      if (!matchesCategory) return false;
    }
    if (getFavoritesMode() && !isFavorite(ad)) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const hay = `${ad.title || ''} ${ad.formula || ''} ${ad.tag || ''} ${ad.image || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  applyPinnedSort(visibleAds);
  renderCards(animate);
}

// Sort ads by their priority for the current filter (lower = higher in list).
// Ads without an explicit priority remain in their natural ads.js order at the end
// (stable sort). Skipped for the 'all' view so global order is preserved there.
function applyPinnedSort(arr) {
  if (activeFilter === 'all') return;
  arr.sort((a, b) => adPriority(a, activeFilter) - adPriority(b, activeFilter));
}

function renderCards(animate = false) {
  gallery.innerHTML = '';
  if (visibleAds.length === 0) {
    const cfg = currentPlatform();
    const tab = findTab(activePlatform, activeFilter);
    const tabFolder = tab ? tab.folder : activeFilter;
    emptyState.hidden = false;
    emptyState.innerHTML = `No ads in <code>${escapeHtml(cfg.label)} → ${escapeHtml(tabFolder)}</code> yet. Drop images into <code>images/${escapeHtml(cfg.folder)}/${escapeHtml(tabFolder)}/</code> and add an entry to <code>ads.js</code> with <code>platform: "${activePlatform}"</code> and <code>category: "${activeFilter}"</code>.`;
    return;
  }
  emptyState.hidden = true;

  visibleAds.forEach((ad, i) => {
    const card = document.createElement('article');
    card.className = `card card-${ad.platform || 'google'}`;
    // Pop animation on the first 6 cards — only on initial load + platform switches
    if (animate && i < 6) {
      card.classList.add('card-pop');
      card.style.animationDelay = `${i * 0.08}s`;
    }
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label', `Open ${ad.title}`);
    const fav = isFavorite(ad);
    card.innerHTML = `
      <div class="card-thumb">
        <img src="${imagePath(ad)}" alt="${escapeHtml(ad.title)}" loading="lazy" />
      </div>
      <div class="card-body">
        <div class="card-text">
          <h3 class="card-title">${escapeHtml(ad.title)}</h3>
          ${ad.formula ? `<p class="card-sub">${escapeHtml(ad.formula)}</p>` : ''}
        </div>
        ${ad.tag ? `<span class="card-tag">${escapeHtml(ad.tag)}</span>` : ''}
        <button class="card-heart${fav ? ' is-favorited' : ''}" type="button" aria-label="${fav ? 'Remove favorite' : 'Add favorite'}" title="${fav ? 'Remove favorite' : 'Add favorite'}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="${fav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
          </svg>
        </button>
      </div>
    `;
    card.addEventListener('click', () => openLightbox(i));
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openLightbox(i);
      }
    });
    // Heart toggle — stop propagation so it doesn't also open the lightbox
    const heart = card.querySelector('.card-heart');
    if (heart) {
      heart.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleFavorite(ad);
        const nowFav = isFavorite(ad);
        heart.classList.toggle('is-favorited', nowFav);
        heart.setAttribute('aria-label', nowFav ? 'Remove favorite' : 'Add favorite');
        heart.setAttribute('title', nowFav ? 'Remove favorite' : 'Add favorite');
        const svg = heart.querySelector('svg');
        if (svg) svg.setAttribute('fill', nowFav ? 'currentColor' : 'none');
        // If favorites filter is on and this card just got unfavorited,
        // re-render so it disappears from the gallery.
        if (getFavoritesMode() && !nowFav) render();
      });
      heart.addEventListener('keydown', (e) => {
        // Prevent space/enter from bubbling to the card
        if (e.key === 'Enter' || e.key === ' ') e.stopPropagation();
      });
    }
    gallery.appendChild(card);
  });
  isFirstRender = false;
}

// ---------- Platform switching ----------
const platformNav = document.querySelector('.platform-nav');

function setPlatform(platform, opts = {}) {
  if (!platform || platform === activePlatform) return;
  // Sync desktop pills
  platformPills.forEach(p => p.classList.toggle('is-active', p.dataset.platform === platform));
  activePlatform = platform;
  activeFilter = currentPlatform().defaultTab;
  // Sync mobile dropdown label + active option
  const cfg = currentPlatform();
  platformDropdownLabel.textContent = cfg.label;
  platformDropdownMenu.querySelectorAll('.dropdown-option').forEach(o => {
    o.classList.toggle('is-active', o.dataset.platform === platform);
  });
  updateHeadline();
  renderFeaturePills();
  renderTabs();
  // Reflect the new platform's stored favorites-filter state on the button
  if (typeof syncFavoritesButton === 'function') syncFavoritesButton();
  render(true); // platform switch — animate
  // Push the new URL (unless this was triggered by popstate, or the homepage
  // gate is active — clicking platform pills on the gate should swap the
  // blurred preview without revealing the deep-link URL).
  if (opts.updateUrl !== false && !gateActive) {
    const newPath = PLATFORM_TO_PATH[platform];
    if (newPath && window.location.pathname !== newPath) {
      window.history.pushState({ platform }, '', newPath);
    }
  }
}

// Sync platform + category + lightbox state when the user hits back / forward.
window.addEventListener('popstate', () => {
  const parsed = parsePath();
  // Platform change first (e.g., /linkedin-ads/problem-3 → /google-ads)
  if (parsed.platform !== activePlatform) {
    setPlatform(parsed.platform, { updateUrl: false });
  }
  // Category change (e.g., switching to /linkedin-ads/product)
  const targetCategory = parsed.category || platforms[parsed.platform].defaultTab;
  if (targetCategory !== activeFilter) {
    setFilter(targetCategory, { updateUrl: false });
  }
  if (parsed.adId != null && parsed.category) {
    // Navigated to a deep-link URL — make sure the right ad is open
    const ad = findAd(parsed.platform, parsed.category, parsed.adId);
    if (ad) {
      const idx = visibleAds.indexOf(ad);
      if (idx !== -1) {
        if (lightbox.hidden) {
          openLightbox(idx, { updateUrl: false });
        } else {
          currentIndex = idx;
          updateLightbox();
        }
      }
    }
  } else if (!lightbox.hidden) {
    // Navigated away from a deep-link URL — close the lightbox
    closeLightbox({ updateUrl: false });
  }
});

// Desktop pills
platformPills.forEach(pill => {
  pill.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    setPlatform(pill.dataset.platform);
  });
});

// Build the mobile platform dropdown menu options
function renderPlatformDropdown() {
  const options = Object.entries(platforms).map(([key, cfg]) => ({
    key, label: cfg.label
  }));
  platformDropdownLabel.textContent = currentPlatform().label;
  platformDropdownMenu.innerHTML = options.map(o => `
    <button type="button" role="option" class="dropdown-option${o.key === activePlatform ? ' is-active' : ''}" data-platform="${escapeHtml(o.key)}">${escapeHtml(o.label)}</button>
  `).join('');
  platformDropdownMenu.querySelectorAll('.dropdown-option').forEach(opt => {
    opt.addEventListener('click', () => {
      setPlatform(opt.dataset.platform);
      platformDropdown.classList.remove('is-open');
      platformDropdownTrigger.setAttribute('aria-expanded', 'false');
    });
  });
}
renderPlatformDropdown();

// Toggle the mobile platform dropdown
platformDropdownTrigger.addEventListener('click', (e) => {
  e.stopPropagation();
  const isOpen = platformDropdown.classList.toggle('is-open');
  platformDropdownTrigger.setAttribute('aria-expanded', String(isOpen));
});

// Close mobile dropdowns when clicking outside
document.addEventListener('click', (e) => {
  if (platformDropdown && !platformDropdown.contains(e.target)) {
    platformDropdown.classList.remove('is-open');
    platformDropdownTrigger.setAttribute('aria-expanded', 'false');
  }
  if (filterDropdown && !filterDropdown.contains(e.target)) {
    filterDropdown.classList.remove('is-open');
    filterDropdownTrigger.setAttribute('aria-expanded', 'false');
  }
});

// ---------- Lightbox ----------
// Preload + decode an image so we don't paint the lightbox until pixels are
// actually ready. Resolves either way (errors are swallowed so the UI never gets stuck).
function preloadImage(src) {
  return new Promise(resolve => {
    const img = new Image();
    img.src = src;
    const finish = () => {
      if (img.decode) img.decode().then(resolve, resolve);
      else resolve();
    };
    if (img.complete && img.naturalWidth > 0) { finish(); return; }
    img.onload = finish;
    img.onerror = () => resolve();
  });
}

// Warm prev / next so swipes & arrow keys are usually instant.
function preloadNeighbors() {
  if (visibleAds.length < 2) return;
  const prev = visibleAds[(currentIndex - 1 + visibleAds.length) % visibleAds.length];
  const next = visibleAds[(currentIndex + 1) % visibleAds.length];
  if (prev) preloadImage(imagePath(prev));
  if (next && next !== prev) preloadImage(imagePath(next));
}

// Sequence counter so rapid clicks / keypresses don't race each other.
let navSeq = 0;

function updateCaption(ad) {
  const parts = [ad.title];
  if (ad.formula) parts.push(ad.formula);
  lbCaption.textContent = parts.join(' — ');
}

function syncUrlToCurrentAd() {
  const ad = visibleAds[currentIndex];
  if (!ad || ad.id == null) return;
  const newPath = adPath(ad);
  if (window.location.pathname !== newPath) {
    window.history.replaceState({ adId: ad.id }, '', newPath);
  }
}

async function openLightbox(index, opts = {}) {
  currentIndex = index;
  const ad = visibleAds[currentIndex];
  if (!ad) return;
  const mySeq = ++navSeq;

  // Pre-decode the first frame before we paint anything, so we never see the
  // previously-loaded image flash through. Hold opacity at 0 until ready.
  lbImage.style.transition = 'none';
  lbImage.style.transform = '';
  lbImage.style.opacity = '0';
  lbImage.src = imagePath(ad);
  lbImage.alt = ad.title;
  updateCaption(ad);

  lightbox.hidden = false;
  document.body.style.overflow = 'hidden';

  // Wait for the image (or 400ms — whichever comes first) so animated WebPs
  // or slow-loading images can't deadlock the open.
  await Promise.race([
    preloadImage(imagePath(ad)),
    new Promise(r => setTimeout(r, 400))
  ]);
  if (mySeq !== navSeq) return; // user already navigated past this

  if (opts.slideIn) {
    // Position off-screen left, then spring to center
    lbImage.style.transition = 'none';
    lbImage.style.transform = 'translateX(-110vw) rotate(-4deg)';
    lbImage.style.opacity = '0';
    void lbImage.offsetWidth;
    requestAnimationFrame(() => {
      lbImage.style.transition = 'transform 0.6s cubic-bezier(0.22, 1.15, 0.36, 1), opacity 0.45s ease';
      lbImage.style.transform = '';
      lbImage.style.opacity = '';
      const cleanup = () => {
        lbImage.removeEventListener('transitionend', cleanup);
        lbImage.style.transition = '';
      };
      lbImage.addEventListener('transitionend', cleanup, { once: true });
    });
  } else {
    // Quick fade-in so the swap doesn't pop
    lbImage.style.transition = 'opacity 0.18s ease';
    lbImage.style.opacity = '';
  }

  // Push the ad's URL so it can be shared / linked.
  if (opts.updateUrl !== false && ad.id != null) {
    const newPath = adPath(ad);
    if (window.location.pathname !== newPath) {
      window.history.pushState({ adId: ad.id, platform: ad.platform || 'google' }, '', newPath);
    }
  }

  preloadNeighbors();
}

function closeLightbox(opts = {}) {
  navSeq++; // cancel any in-flight transition
  lightbox.hidden = true;
  document.body.style.overflow = '';
  // Reset any in-flight drag / slide transform so next open is clean
  lbImage.style.transition = 'none';
  lbImage.style.transform = '';
  lbImage.style.opacity = '';
  // Drop the ad-specific URL but keep the category — replaceState so we don't
  // pile up history entries from close events.
  if (opts.updateUrl !== false) {
    const newPath = buildPath(activePlatform, activeFilter, null);
    if (newPath && window.location.pathname !== newPath) {
      window.history.replaceState({}, '', newPath);
    }
  }
}

// step(): used by desktop prev/next buttons, arrow keys, and the
// tap-to-advance click handler. Crossfades the image and waits for the new
// one to decode so there's never a flash of the previous image.
// Fully synchronous — no awaits, no race conditions. Used by the prev/next
// arrows, arrow keys, and tap-to-advance click. Image src change is instant;
// the browser handles the visual swap. Loading is masked by the preloadNeighbors
// warm-up which usually means the next/prev image is already cached.
function step(delta) {
  if (visibleAds.length < 2) return;
  navSeq++; // cancel any in-flight slide animation (commitSwipe checks this)
  currentIndex = (currentIndex + delta + visibleAds.length) % visibleAds.length;
  const ad = visibleAds[currentIndex];
  if (!ad) return;
  // Reset any drag/swipe transform left behind so the new image isn't off-screen
  lbImage.style.transition = 'none';
  lbImage.style.transform = '';
  lbImage.style.opacity = '';
  lbImage.src = imagePath(ad);
  lbImage.alt = ad.title;
  updateCaption(ad);
  syncUrlToCurrentAd();
  preloadNeighbors();
}
lbClose.addEventListener('click', closeLightbox);
lbPrev.addEventListener('click', () => step(-1));
lbNext.addEventListener('click', () => step(1));
lightbox.addEventListener('click', (e) => {
  if (e.target === lightbox) closeLightbox();
});
document.addEventListener('keydown', (e) => {
  if (lightbox.hidden) return;
  if (e.key === 'Escape') closeLightbox();
  if (e.key === 'ArrowLeft') step(-1);
  if (e.key === 'ArrowRight') step(1);
});

// ---------- Touch drag (Tinder-style) on the lightbox image ----------
// Mobile only: the image follows the finger horizontally. If the drag
// crosses SWIPE_THRESHOLD, the image slides off and the next/previous ad
// slides in from the opposite side. Otherwise it springs back to center.
// A tap (no significant movement) advances to the next ad via the click
// handler below — that handler also covers desktop click-to-advance.
const SWIPE_THRESHOLD = 80; // px past which a swipe commits to navigation
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let dragAxis = null; // 'x' | 'y' | null — locked on first significant movement
let dragDx = 0;
let swipeDidNavigate = false;

function applyDrag(dx) {
  // Subtle rotation + fade as the card pulls away
  const rot = (dx / window.innerWidth) * 10;
  const opacity = Math.max(0.5, 1 - Math.abs(dx) / (window.innerWidth * 0.8));
  lbImage.style.transition = 'none';
  lbImage.style.transform = `translateX(${dx}px) rotate(${rot}deg)`;
  lbImage.style.opacity = String(opacity);
}

function snapBack() {
  lbImage.style.transition = 'transform 0.28s cubic-bezier(0.22, 1.15, 0.36, 1), opacity 0.25s ease';
  lbImage.style.transform = '';
  lbImage.style.opacity = '';
}

async function commitSwipe(direction) {
  // direction: +1 (next, swipe-left) or -1 (prev, swipe-right)
  if (visibleAds.length < 2) { snapBack(); return; }

  const mySeq = ++navSeq;
  const sign = direction === 1 ? -1 : 1;
  const targetIdx = (currentIndex + direction + visibleAds.length) % visibleAds.length;
  const targetAd = visibleAds[targetIdx];
  const targetSrc = imagePath(targetAd);

  // Start preloading + decoding the next image immediately. By the time the
  // swipe-off animation ends, the new image is almost always cache-warm.
  const preloadDone = preloadImage(targetSrc);

  // Phase 1 — throw the current image off-screen.
  // We use a setTimeout matching the transition duration instead of waiting
  // on `transitionend`. If anything cancels the transition (e.g. a follow-up
  // touch resetting transition to 'none'), `transitionend` never fires and
  // the await would hang forever — which would leave the image stuck off-screen
  // and break every subsequent navigation.
  const PHASE_1_MS = 260;
  lbImage.style.transition = `transform ${PHASE_1_MS}ms cubic-bezier(0.5, 0, 0.75, 0.1), opacity 0.22s ease`;
  lbImage.style.transform = `translateX(${sign * window.innerWidth}px) rotate(${sign * 10}deg)`;
  lbImage.style.opacity = '0';

  await Promise.all([
    new Promise(resolve => setTimeout(resolve, PHASE_1_MS + 10)),
    preloadDone
  ]);
  if (mySeq !== navSeq) return;

  // Swap src + caption + URL. Image is already decoded so no flash.
  currentIndex = targetIdx;
  lbImage.src = targetSrc;
  lbImage.alt = targetAd.title;
  updateCaption(targetAd);
  syncUrlToCurrentAd();

  // Decode the now-attached element too, belt-and-braces against any final blink
  if (lbImage.decode) { try { await lbImage.decode(); } catch (e) {} }
  if (mySeq !== navSeq) return;

  // Phase 2 — position off-screen on the opposite side (invisible), reflow, slide in
  lbImage.style.transition = 'none';
  lbImage.style.transform = `translateX(${-sign * window.innerWidth}px) rotate(${-sign * 6}deg)`;
  lbImage.style.opacity = '0';
  void lbImage.offsetWidth;
  requestAnimationFrame(() => {
    lbImage.style.transition = 'transform 0.36s cubic-bezier(0.22, 1.05, 0.36, 1), opacity 0.3s ease';
    lbImage.style.transform = '';
    lbImage.style.opacity = '';
  });

  preloadNeighbors();
}

lbImage.addEventListener('touchstart', (e) => {
  if (e.touches.length !== 1) return;
  dragStartX = e.touches[0].clientX;
  dragStartY = e.touches[0].clientY;
  dragAxis = null;
  dragDx = 0;
  isDragging = true;
  swipeDidNavigate = false;
  lbImage.style.transition = 'none';
}, { passive: true });

lbImage.addEventListener('touchmove', (e) => {
  if (!isDragging || e.touches.length !== 1) return;
  const dx = e.touches[0].clientX - dragStartX;
  const dy = e.touches[0].clientY - dragStartY;
  if (!dragAxis) {
    if (Math.abs(dx) > 6 || Math.abs(dy) > 6) {
      dragAxis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    }
  }
  if (dragAxis === 'x') {
    dragDx = dx;
    applyDrag(dx);
  }
}, { passive: true });

lbImage.addEventListener('touchend', () => {
  if (!isDragging) return;
  isDragging = false;
  if (dragAxis !== 'x') return; // vertical or no movement — leave alone
  if (Math.abs(dragDx) > SWIPE_THRESHOLD) {
    swipeDidNavigate = true;
    commitSwipe(dragDx < 0 ? 1 : -1);
  } else {
    snapBack();
  }
}, { passive: true });

lbImage.addEventListener('touchcancel', () => {
  if (!isDragging) return;
  isDragging = false;
  if (dragAxis === 'x') snapBack();
}, { passive: true });

// ---------- Desktop mouse drag on the lightbox image ----------
// Mirrors the touch drag — mousedown locks state, mousemove on the document
// updates the transform (so the drag continues even if the cursor leaves the
// image), mouseup commits or snaps back. A "suppress next click" flag stops
// drags from also firing the tap-to-advance click handler.
let isMouseDragging = false;
let suppressNextClick = false;

lbImage.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return; // left-button only
  if (lightbox.hidden) return;
  e.preventDefault(); // stop native image drag-and-drop
  dragStartX = e.clientX;
  dragStartY = e.clientY;
  dragAxis = null;
  dragDx = 0;
  isMouseDragging = true;
  swipeDidNavigate = false;
  lbImage.style.transition = 'none';
  document.body.classList.add('lb-dragging');
});

document.addEventListener('mousemove', (e) => {
  if (!isMouseDragging) return;
  const dx = e.clientX - dragStartX;
  const dy = e.clientY - dragStartY;
  if (!dragAxis) {
    if (Math.abs(dx) > 6 || Math.abs(dy) > 6) {
      dragAxis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    }
  }
  if (dragAxis === 'x') {
    dragDx = dx;
    applyDrag(dx);
  }
});

document.addEventListener('mouseup', () => {
  if (!isMouseDragging) return;
  isMouseDragging = false;
  document.body.classList.remove('lb-dragging');

  // Any meaningful movement should suppress the click that mouseup triggers.
  if (dragAxis !== null) suppressNextClick = true;

  if (dragAxis === 'x') {
    if (Math.abs(dragDx) > SWIPE_THRESHOLD) {
      swipeDidNavigate = true;
      commitSwipe(dragDx < 0 ? 1 : -1);
    } else {
      snapBack();
    }
  }
});

lbImage.addEventListener('click', () => {
  // Suppress the click that fires after a swipe or a mouse drag
  if (swipeDidNavigate || suppressNextClick) {
    swipeDidNavigate = false;
    suppressNextClick = false;
    return;
  }
  step(1);
});

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
