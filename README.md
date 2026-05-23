# Ad Library — Revenu #SexyAds

A static gallery of Google Search ad examples, organised by formula.

## Preview

Just double-click `index.html`. The gallery opens in your default browser — no terminal, no server needed.

## Add an ad

1. Drop the image into the matching folder inside `images/`:
   - Brand-category ads → `images/Brand/`
   - Non-brand → `images/Non-brand/`
   - Competitor → `images/Competitor/`
2. Open `ads.js` and add an entry:

```js
{
  image: "my-ad.png",
  title: "Headline shown on the card",
  formula: "Formula name shown as subtitle",
  tag: "Non-Brand",
  category: "non-brand"  // brand | non-brand | competitor
},
```

3. Save the file and refresh the page.

## Deploy

Push to GitHub, connect to Vercel, point a subdomain. No build step — Vercel will serve the static files as-is.

## Structure

```
ad-library/
├── index.html        # the page
├── styles.css        # styling
├── app.js            # gallery + lightbox logic
├── ads.js            # list of ads (edit this to add more)
├── images/
│   ├── Brand/
│   ├── Non-brand/
│   └── Competitor/
└── README.md
```
