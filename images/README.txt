Drop your ad images in this folder.

Naming for the 4 already wired up in ads.json:
  cover.png
  p1-what.png
  p1-question.png
  p2-guarantee.png

To add more ads:
  1. Save the image here (any name, PNG or JPG)
  2. Open ../ads.json and add an entry:
     {
       "image": "your-file.png",
       "title": "Headline shown on the card",
       "formula": "Formula name shown as the subtitle",
       "tag": "Non-Brand" | "Competitor" | "Brand",
       "category": "non-brand" | "competitor" | "brand"
     }
  3. Reload the page.

Recommended image size: at least 1600px wide, 16:9 aspect ratio looks cleanest in the grid.
