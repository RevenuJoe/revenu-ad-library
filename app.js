// ---------- Ad Library — gallery + lightbox ----------

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
      { key: 'above-the-fold',  label: 'Above the Fold',  folder: 'Above the Fold' },
      { key: 'blocks',          label: 'Blocks',          folder: 'Blocks' },
      { key: 'conversion-path', label: 'Conversion Path', folder: 'Conversion Path' }
    ]
  }
};

// ---------- URL routing ----------
// Each platform has its own clean URL. Root URL "/" defaults to LinkedIn.
// vercel.json rewrites /google-ads, /linkedin-ads, /landing-pages to index.html.
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
function platformFromPath() {
  const path = (window.location.pathname || '/').replace(/\/+$/, '') || '/';
  return PATH_TO_PLATFORM[path] || 'linkedin';
}

let allAds = [];
let visibleAds = [];
let currentIndex = 0;
let activePlatform = platformFromPath();
let activeFilter = platforms[activePlatform].defaultTab;
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

// Restore saved preference (default 3)
const savedCols = (() => {
  try { return localStorage.getItem(COLS_KEY); } catch (e) { return null; }
})();
setColumns(savedCols && ['1','2','3'].includes(savedCols) ? savedCols : 2);

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
  shuffleInPlace(visibleAds);
  renderCards(true); // animate to highlight the new order
  shuffleBtn.classList.remove('is-spinning');
  // Force reflow so the animation restarts even on rapid clicks
  void shuffleBtn.offsetWidth;
  shuffleBtn.classList.add('is-spinning');
});
shuffleBtn.addEventListener('animationend', () => {
  shuffleBtn.classList.remove('is-spinning');
});

// ---------- Load ads ----------
allAds = window.ADS || [];
// Sync the desktop platform pills to the URL-derived activePlatform
platformPills.forEach(p => p.classList.toggle('is-active', p.dataset.platform === activePlatform));
renderFeaturePills();
renderTabs();
updateHeadline();
render(true); // initial load — animate

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

function setFilter(key) {
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
  render();
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
function render(animate = false) {
  visibleAds = allAds.filter(ad =>
    (ad.platform || 'google') === activePlatform &&
    ad.category === activeFilter
  );
  renderCards(animate);
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
      </div>
    `;
    card.addEventListener('click', () => openLightbox(i));
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openLightbox(i);
      }
    });
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
  render(true); // platform switch — animate
  // Push the new URL (unless this was triggered by popstate)
  if (opts.updateUrl !== false) {
    const newPath = PLATFORM_TO_PATH[platform];
    if (newPath && window.location.pathname !== newPath) {
      window.history.pushState({ platform }, '', newPath);
    }
  }
}

// Sync platform when the user hits back / forward
window.addEventListener('popstate', () => {
  const platform = platformFromPath();
  if (platform !== activePlatform) {
    setPlatform(platform, { updateUrl: false });
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
function openLightbox(index) {
  currentIndex = index;
  updateLightbox();
  lightbox.hidden = false;
  document.body.style.overflow = 'hidden';
}
function closeLightbox() {
  lightbox.hidden = true;
  document.body.style.overflow = '';
  // Reset any in-flight drag transform so next open is clean
  lbImage.style.transition = 'none';
  lbImage.style.transform = '';
  lbImage.style.opacity = '';
}
function updateLightbox() {
  const ad = visibleAds[currentIndex];
  if (!ad) return;
  lbImage.src = imagePath(ad);
  lbImage.alt = ad.title;
  const parts = [ad.title];
  if (ad.formula) parts.push(ad.formula);
  lbCaption.textContent = parts.join(' — ');
}
function step(delta) {
  currentIndex = (currentIndex + delta + visibleAds.length) % visibleAds.length;
  updateLightbox();
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
  lbImage.style.transition = 'transform 0.25s ease, opacity 0.25s ease';
  lbImage.style.transform = '';
  lbImage.style.opacity = '';
}

function commitSwipe(direction) {
  // direction: +1 (next, swipe-left) or -1 (prev, swipe-right)
  const sign = direction === 1 ? -1 : 1;
  lbImage.style.transition = 'transform 0.22s ease, opacity 0.22s ease';
  lbImage.style.transform = `translateX(${sign * window.innerWidth}px) rotate(${sign * 12}deg)`;
  lbImage.style.opacity = '0';

  const onOff = () => {
    lbImage.removeEventListener('transitionend', onOff);
    step(direction);
    // Place the new image off-screen on the opposite side, then animate to center
    lbImage.style.transition = 'none';
    lbImage.style.transform = `translateX(${-sign * window.innerWidth}px)`;
    lbImage.style.opacity = '0';
    void lbImage.offsetWidth; // force reflow so the next change animates
    lbImage.style.transition = 'transform 0.28s ease, opacity 0.28s ease';
    lbImage.style.transform = '';
    lbImage.style.opacity = '';
  };
  lbImage.addEventListener('transitionend', onOff, { once: true });
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

lbImage.addEventListener('click', () => {
  // Suppress the synthetic click that follows a swipe
  if (swipeDidNavigate) {
    swipeDidNavigate = false;
    return;
  }
  step(1);
});

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
