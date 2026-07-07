#!/usr/bin/env node
/**
 * Backfill empty `formula` fields in ads.js using the Anthropic API (vision).
 *
 * Two-phase by design so nothing lands in ads.js without review:
 *
 *   1. Propose:  ANTHROPIC_API_KEY=sk-ant-... node scripts/backfill-formulas.js
 *      Sends each ad image that's missing a formula to Claude and writes
 *      proposals to scripts/formulas-proposed.json. Re-running skips ads that
 *      already have a proposal, so it's safe to stop/resume.
 *
 *   2. Apply:    node scripts/backfill-formulas.js --apply
 *      Reads the (reviewed/edited) proposals file and patches ads.js in place.
 *      Only ads whose formula is still "" are touched. Run
 *      `node scripts/build-seo.js` afterwards and commit.
 *
 * Options:
 *   --limit N     propose for at most N ads this run (default: all)
 *   --model M     override the model (default below)
 *   --dry-run     with --apply: print what would change, don't write ads.js
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const REPO = path.join(__dirname, "..");
const ADS_JS = path.join(REPO, "ads.js");
const PROPOSALS = path.join(__dirname, "formulas-proposed.json");
const MODEL = argValue("--model") || "claude-sonnet-4-6";
const API_URL = "https://api.anthropic.com/v1/messages";
const CONCURRENCY = 4;
// Anthropic's per-image request limit is 5MB; stay under it with headroom.
const MAX_IMAGE_BYTES = 4.5 * 1024 * 1024;
// Oversized images are fetched by the API from the live site instead.
const SITE = "https://library.revenuagency.io";

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i > -1 ? process.argv[i + 1] : null;
}
const APPLY = process.argv.includes("--apply");
const DRY = process.argv.includes("--dry-run");
const LIMIT = Number(argValue("--limit")) || Infinity;

/* ---------- load ads.js + the platform folder map (mirrors app.js) ---------- */
const FOLDERS = {
  linkedin: { folder: "LinkedIn Ads", tabs: { problem: "Problem", product: "Product", conversion: "Conversion", "convo-ads": "Convo Ads", "gated-content": "Gated Content", playbook: "The Playbook", animations: "Animations" } },
  google:   { folder: "Google Ads", tabs: { brand: "Brand", "non-brand": "Non Brand", competitor: "Competitor", playbook: "The Playbook" } },
  landing:  { folder: "Landing Pages", tabs: { "above-the-fold": "Above the Fold", blocks: "Blocks", "product-visuals": "Product Visuals" } },
  chatgpt:  { folder: "ChatGPT Ads", tabs: { playbook: "Playbook", formulas: "Formulas", setup: "Setup" } },
};

function loadAds() {
  const ctx = { window: {} };
  vm.runInNewContext(fs.readFileSync(ADS_JS, "utf8"), ctx);
  return ctx.window.ADS;
}
function adKey(ad) { return `${ad.platform || "google"}|${ad.category}|${ad.image}`; }
function imageFile(ad) {
  const p = FOLDERS[ad.platform || "google"];
  const tab = p && p.tabs[ad.category];
  if (!p || !tab) return null;
  return path.join(REPO, "images", p.folder, tab, ad.image);
}
function imageUrl(ad) {
  const p = FOLDERS[ad.platform || "google"];
  const tab = p && p.tabs[ad.category];
  return `${SITE}/images/${encodeURIComponent(p.folder)}/${encodeURIComponent(tab)}/${encodeURIComponent(ad.image)}`;
}

/* ---------- propose ---------- */
async function callClaude(ad, examples) {
  const file = imageFile(ad);
  if (!file || !fs.existsSync(file)) return { error: "image file not found: " + file };
  const size = fs.statSync(file).size;
  const source = size > MAX_IMAGE_BYTES
    ? { type: "url", url: imageUrl(ad) }
    : { type: "base64", media_type: "image/webp", data: fs.readFileSync(file).toString("base64") };

  const system = [
    "You label B2B SaaS marketing assets for the Revenu Ad Library with a short \"formula\" name: the repeatable copy/structure pattern the asset uses.",
    "Style rules: 2-4 words, Title Case, punchy, no punctuation, no quotes. Match the voice of the existing labels.",
    `Existing labels in this category (${ad.tag}): ${examples.length ? examples.join(" · ") : "(none yet — invent in the same spirit as: What and Why, Question Answer, Solution Guarantee, Competitor Redirect)"}.`,
    "Reply with strict JSON only: {\"formula\": \"...\"}",
  ].join("\n");

  const body = {
    model: MODEL,
    max_tokens: 100,
    temperature: 0,
    system,
    messages: [{
      role: "user",
      content: [
        { type: "image", source },
        { type: "text", text: `Platform: ${FOLDERS[ad.platform || "google"].folder}. Category: ${ad.tag}. Title: ${ad.title}. Name the formula.` },
      ],
    }],
  };

  for (let attempt = 1; attempt <= 3; attempt++) {
    const r = await fetch(API_URL, {
      method: "POST",
      headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (r.status === 429 || r.status >= 500) { await new Promise((s) => setTimeout(s, 2000 * attempt)); continue; }
    if (!r.ok) return { error: `HTTP ${r.status}: ${(await r.text()).slice(0, 200)}` };
    const j = await r.json();
    const text = (j.content || []).map((c) => c.text || "").join("");
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return { error: "no JSON in response: " + text.slice(0, 120) };
    try {
      const formula = String(JSON.parse(m[0]).formula || "").trim();
      if (!formula) return { error: "empty formula in response" };
      return { formula };
    } catch (e) { return { error: "bad JSON: " + m[0].slice(0, 120) }; }
  }
  return { error: "rate-limited after 3 attempts" };
}

async function propose() {
  if (!process.env.ANTHROPIC_API_KEY) { console.error("Set ANTHROPIC_API_KEY first."); process.exit(1); }
  const ads = loadAds();
  const proposals = fs.existsSync(PROPOSALS) ? JSON.parse(fs.readFileSync(PROPOSALS, "utf8")) : {};

  // Existing formulas per category, as few-shot style examples.
  const byCat = {};
  for (const ad of ads) {
    if (ad.formula) (byCat[`${ad.platform || "google"}|${ad.category}`] ||= new Set()).add(ad.formula);
  }

  const todo = ads.filter((ad) => !ad.formula && !proposals[adKey(ad)]).slice(0, LIMIT);
  console.log(`${todo.length} ads to label (model: ${MODEL}). Proposals file: ${path.relative(REPO, PROPOSALS)}`);

  let done = 0, failed = 0;
  const queue = [...todo];
  async function worker() {
    for (let ad = queue.shift(); ad; ad = queue.shift()) {
      const examples = [...(byCat[`${ad.platform || "google"}|${ad.category}`] || [])].slice(0, 12);
      const res = await callClaude(ad, examples);
      if (res.formula) {
        proposals[adKey(ad)] = res.formula;
        done++;
        console.log(`  ✓ [${ad.tag}] ${ad.image} → ${res.formula}`);
      } else {
        failed++;
        console.warn(`  ✗ [${ad.tag}] ${ad.image} — ${res.error}`);
      }
      // Persist incrementally so an interrupted run keeps its progress.
      fs.writeFileSync(PROPOSALS, JSON.stringify(proposals, null, 2) + "\n");
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  console.log(`\nDone: ${done} proposed, ${failed} failed. Review ${path.relative(REPO, PROPOSALS)}, then run with --apply.`);
}

/* ---------- apply ---------- */
function apply() {
  if (!fs.existsSync(PROPOSALS)) { console.error("No proposals file. Run without --apply first."); process.exit(1); }
  const proposals = JSON.parse(fs.readFileSync(PROPOSALS, "utf8"));
  let src = fs.readFileSync(ADS_JS, "utf8");
  let applied = 0, skipped = 0;

  // Walk each { ... } ad block (allowing one nesting level for `priority: {...}`);
  // patch formula: "" where we have a proposal.
  src = src.replace(/\{(?:[^{}]|\{[^{}]*\})*\}/g, (block) => {
    const image = (block.match(/image:\s*"((?:[^"\\]|\\.)*)"/) || [])[1];
    const category = (block.match(/category:\s*"([^"]*)"/) || [])[1];
    const platform = (block.match(/platform:\s*"([^"]*)"/) || [])[1] || "google";
    if (!image || !category) return block;
    const formula = proposals[`${platform}|${category}|${image}`];
    if (!formula) return block;
    if (!/formula:\s*""/.test(block)) { skipped++; return block; } // already filled — never overwrite
    applied++;
    if (DRY) console.log(`  would set [${category}] ${image} → ${formula}`);
    return block.replace(/formula:\s*""/, `formula: ${JSON.stringify(formula)}`);
  });

  if (DRY) { console.log(`\nDry run: ${applied} would be applied, ${skipped} already filled.`); return; }
  fs.writeFileSync(ADS_JS, src);
  console.log(`Applied ${applied} formulas (${skipped} already filled — untouched).`);
  console.log("Now run: node scripts/build-seo.js  — then review git diff and commit.");
}

(APPLY ? Promise.resolve(apply()) : propose()).catch((e) => { console.error(e); process.exit(1); });
