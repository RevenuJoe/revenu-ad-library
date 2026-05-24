#!/usr/bin/env python3
"""
Generates per-ad Open Graph images (1200×630) used as social previews when
someone shares a deep-link URL on LinkedIn, Slack, Twitter, etc.

Each OG image is composed of:
  - The brand background color
  - The ad's image, fit centered on the right
  - A title strip on the left with the ad name + REVENU AD LIBRARY label

Run after editing ads.js (and run build-seo.js too so the HTML files point
at the freshly-generated OG image paths):

    python3 scripts/build-og-images.py

Output: og/<platform>/<category>-<id>.png
"""

import json
import os
import re
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
ADS_JSON = ROOT / "api" / "ads.json"
OG_DIR = ROOT / "og"

OG_W, OG_H = 1200, 630
BG = (252, 247, 245)           # var(--bg) #FCF7F5
INK = (38, 40, 39)              # ink/dark
ACCENT = (118, 160, 156)        # var(--accent) #76A09C
SOFT = (112, 112, 112)          # ink-soft

PAD = 56
LEFT_W = 540                    # text panel width

def find_font(*names, size=48):
    """Try a few system fonts in order, fall back to PIL default."""
    candidates = [
        "/System/Library/Fonts/Helvetica.ttc",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ]
    for n in names:
        candidates.insert(0, n)
    for c in candidates:
        try:
            return ImageFont.truetype(c, size=size)
        except OSError:
            continue
    return ImageFont.load_default()

def wrap_text(text, font, max_w, draw):
    words = text.split()
    lines, cur = [], ""
    for w in words:
        test = (cur + " " + w).strip()
        bbox = draw.textbbox((0, 0), test, font=font)
        if bbox[2] - bbox[0] <= max_w:
            cur = test
        else:
            if cur:
                lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines

def safe_filename(s):
    return re.sub(r"[^A-Za-z0-9._-]+", "_", s)

def main():
    if not ADS_JSON.exists():
        print(f"ERROR: {ADS_JSON} not found. Run scripts/build-seo.js first.", file=sys.stderr)
        sys.exit(1)
    data = json.loads(ADS_JSON.read_text())
    ads = data["ads"]

    title_font = find_font(size=58)
    sub_font = find_font(size=28)
    brand_font = find_font(size=22)

    OG_DIR.mkdir(parents=True, exist_ok=True)
    written = 0

    for ad in ads:
        platform = ad["platform"]
        category = ad["category"]
        ad_id = ad["id"]
        title = ad["title"]
        tag = ad.get("tag", "")
        rel_path = ad["image"]

        # Source ad image
        src = ROOT / Path(ad["imageUrl"].split("library.revenuagency.io/")[1])
        # The URL has spaces percent-encoded as spaces — fine on disk.
        # But the imageUrl in ads.json uses encoded path; let's just rebuild from local
        plat_folder = {"google": "Google Ads", "linkedin": "LinkedIn Ads", "landing": "Landing Pages"}[platform]
        # category folder lookup
        cat_folder_map = {
            "non-brand": "Non Brand", "brand": "Brand", "competitor": "Competitor", "playbook": "The Playbook",
            "problem": "Problem", "product": "Product", "conversion": "Conversion",
            "convo-ads": "Convo Ads", "gated-content": "Gated Content", "animations": "Animations",
            "above-the-fold": "Above the Fold", "blocks": "Blocks", "product-visuals": "Product Visuals",
        }
        cat_folder = cat_folder_map.get(category, category)
        src = ROOT / "images" / plat_folder / cat_folder / rel_path
        if not src.exists():
            print(f"  SKIP (missing): {src}")
            continue

        # Compose canvas
        canvas = Image.new("RGB", (OG_W, OG_H), BG)
        draw = ImageDraw.Draw(canvas)

        # Right-side image area
        right_x = LEFT_W
        right_w = OG_W - LEFT_W
        avail_w = right_w - PAD * 2
        avail_h = OG_H - PAD * 2

        try:
            ad_img = Image.open(src).convert("RGB")
        except Exception as e:
            print(f"  SKIP ({e}): {src}")
            continue

        # Resize to fit while preserving aspect
        ratio = min(avail_w / ad_img.width, avail_h / ad_img.height)
        new_w = int(ad_img.width * ratio)
        new_h = int(ad_img.height * ratio)
        ad_img = ad_img.resize((new_w, new_h), Image.LANCZOS)

        # Centered on the right panel
        ox = right_x + (right_w - new_w) // 2
        oy = (OG_H - new_h) // 2
        # Subtle drop shadow
        shadow = Image.new("RGBA", (new_w + 24, new_h + 24), (0, 0, 0, 0))
        sd = ImageDraw.Draw(shadow)
        sd.rectangle([12, 12, 12 + new_w, 12 + new_h], fill=(0, 0, 0, 60))
        canvas.paste(Image.alpha_composite(Image.new("RGBA", shadow.size, (252, 247, 245, 255)), shadow).convert("RGB"),
                     (ox - 12, oy - 12))
        canvas.paste(ad_img, (ox, oy))

        # Left-side text panel
        # Tag pill at top
        tag_text = tag or "Revenu"
        tag_bbox = draw.textbbox((0, 0), tag_text, font=sub_font)
        tag_w = tag_bbox[2] - tag_bbox[0]
        tag_h = tag_bbox[3] - tag_bbox[1]
        tag_px = PAD
        tag_py = PAD
        draw.rounded_rectangle(
            [tag_px - 16, tag_py - 10, tag_px + tag_w + 16, tag_py + tag_h + 14],
            radius=999, fill=ACCENT
        )
        draw.text((tag_px, tag_py), tag_text, fill=(255, 255, 255), font=sub_font)

        # Title (wrap to fit)
        title_max_w = LEFT_W - PAD * 2
        title_lines = wrap_text(title, title_font, title_max_w, draw)
        title_y = tag_py + tag_h + 56
        for line in title_lines[:3]:  # cap at 3 lines
            draw.text((PAD, title_y), line, fill=INK, font=title_font)
            bb = draw.textbbox((0, 0), line, font=title_font)
            title_y += (bb[3] - bb[1]) + 12

        # REVENU AD LIBRARY footer
        footer = "REVENU AD LIBRARY"
        fb = draw.textbbox((0, 0), footer, font=brand_font)
        draw.text((PAD, OG_H - PAD - (fb[3] - fb[1]) - 4), footer, fill=SOFT, font=brand_font)

        # Save
        out_path = OG_DIR / platform / f"{category}-{ad_id}.png"
        out_path.parent.mkdir(parents=True, exist_ok=True)
        canvas.save(out_path, "PNG", optimize=True)
        written += 1

    print(f"✓ Wrote {written} OG images to {OG_DIR.relative_to(ROOT)}/")

if __name__ == "__main__":
    main()
