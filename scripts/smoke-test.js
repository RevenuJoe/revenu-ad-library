// Local-only smoke test for the chooser homepage flow. Not committed to deploy.
// Loads index.html via JSDOM, simulates a chooser-tile click and deep links,
// and checks the DOM ends up in the expected state at each step. The site is
// fully open (the old password gate was removed), so there is no unlock step.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const REPO = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(REPO, 'index.html'), 'utf8');

function makeDom({ url }) {
  const dom = new JSDOM(html, {
    url,
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true
  });
  // Load ads.js and app.js manually since resources: 'usable' may not work for relative file://
  const adsJs = fs.readFileSync(path.join(REPO, 'ads.js'), 'utf8');
  const appJs = fs.readFileSync(path.join(REPO, 'app.js'), 'utf8');
  // Stubs for JSDOM gaps
  dom.window.matchMedia = dom.window.matchMedia || (() => ({ matches: false, addListener: () => {}, removeListener: () => {} }));
  // Start from a clean slate (favorites etc.). localStorage is unavailable
  // on opaque origins (file://) in JSDOM — ignore that case.
  try { dom.window.localStorage.clear(); } catch (e) {}
  dom.window.eval(adsJs);
  dom.window.eval(appJs);
  return dom;
}

let pass = 0, fail = 0;
function check(label, cond) {
  if (cond) { pass++; console.log('  ✓', label); }
  else      { fail++; console.log('  ✗', label); }
}

console.log('\n== Scenario A: load library.revenuagency.io/ ==');
{
  const dom = makeDom({ url: 'https://library.revenuagency.io/' });
  const window = dom.window;
  const document = window.document;
  const chooser = document.getElementById('chooser');
  const gallery = document.getElementById('gallery');
  const filtersWrap = document.getElementById('filters-wrap');
  const heroTitle = document.getElementById('hero-title');

  check('chooser is visible', !chooser.hidden);
  check('gallery is hidden', gallery.hidden);
  check('filters-wrap is hidden', filtersWrap.hidden);
  check('headline says "Select Your Library"', /select your library/i.test(heroTitle.textContent));
  check('no password gate in the DOM (site is open)', !document.getElementById('password-gate'));
  // The chooser highlights the "home" pill; no ad-platform pill should be active.
  const activePills = [...document.querySelectorAll('.platform-pill.is-active')].map((el) => el.dataset.platform);
  check('only the home pill active on chooser', activePills.length === 1 && activePills[0] === 'home');
}

console.log('\n== Scenario B: unlock gate, then click LinkedIn tile ==');
{
  const dom = makeDom({ url: 'https://library.revenuagency.io/' });
  const window = dom.window;
  const document = window.document;
  // Click the LinkedIn chooser tile
  const linkedinTile = document.querySelector('.chooser-tile[data-platform="linkedin"]');
  check('linkedin chooser tile exists', !!linkedinTile);
  linkedinTile.click();

  const chooser = document.getElementById('chooser');
  const gallery = document.getElementById('gallery');
  const filtersWrap = document.getElementById('filters-wrap');
  const heroTitle = document.getElementById('hero-title');
  check('after click: chooser is hidden', chooser.hidden);
  check('after click: gallery is visible', !gallery.hidden);
  check('after click: filters-wrap is visible', !filtersWrap.hidden);
  check('after click: headline says "LinkedIn Ads"', heroTitle.textContent.includes('LinkedIn Ads'));
  check('after click: URL updated to /linkedin-ads', window.location.pathname === '/linkedin-ads');
  check('linkedin pill is now active', document.querySelector('.platform-pill[data-platform="linkedin"]').classList.contains('is-active'));
  // Gallery should have ads in it
  const cards = document.querySelectorAll('#gallery .card');
  check(`gallery has cards (${cards.length} found)`, cards.length > 0);
}

console.log('\n== Scenario C: direct deep-link to /linkedin-ads ==');
{
  const dom = makeDom({ url: 'https://library.revenuagency.io/linkedin-ads' });
  const window = dom.window;
  const document = window.document;
  const chooser = document.getElementById('chooser');
  const gallery = document.getElementById('gallery');
  check('chooser hidden on /linkedin-ads', chooser.hidden);
  check('gallery visible on /linkedin-ads', !gallery.hidden);
  check('linkedin pill active', document.querySelector('.platform-pill[data-platform="linkedin"]').classList.contains('is-active'));
}

console.log('\n== Scenario D: direct deep-link to /landing-pages/blocks-1 ==');
{
  const dom = makeDom({ url: 'https://library.revenuagency.io/landing-pages/blocks-1' });
  const document = dom.window.document;
  const chooser = document.getElementById('chooser');
  const gallery = document.getElementById('gallery');
  check('chooser hidden on /landing-pages/blocks-1', chooser.hidden);
  check('gallery visible', !gallery.hidden);
  check('landing pill active', document.querySelector('.platform-pill[data-platform="landing"]').classList.contains('is-active'));
}

console.log('\n== Scenario E: file:// preview of index.html ==');
try {
  const dom = makeDom({ url: 'file:///Users/joe/ad-library/index.html' });
  const window = dom.window;
  const document = window.document;
  const chooser = document.getElementById('chooser');
  const gallery = document.getElementById('gallery');
  check('chooser visible on file:// index.html', !chooser.hidden);
  check('gallery hidden on file:// index.html', gallery.hidden);
  const tile = document.querySelector('.chooser-tile[data-platform="linkedin"]');
  // Wrap dispatch — JSDOM's anchor-click handler throws on file:// even with
  // our preventDefault (jsdom bug). Real browsers respect preventDefault.
  try {
    tile.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
  } catch (e) { /* jsdom file:// quirk */ }
  check('after click on file://: chooser hidden', chooser.hidden);
  check('after click on file://: gallery visible', !gallery.hidden);
  const cards = document.querySelectorAll('#gallery .card');
  check(`after click on file://: gallery has cards (${cards.length})`, cards.length > 0);
} catch (e) { console.log('  ⚠ JSDOM file:// init threw:', e.message || String(e)); }

console.log(`\nResult: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
