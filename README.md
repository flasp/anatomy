# Le corps humain / The human body

Interactive 3D anatomy plate for young children, in a vintage anatomy-book style, French and English.

- 6 layers: outside, muscles, blood, nerves, organs, bones
- rotate (drag), zoom (pinch / wheel), front / back / side views
- "exploded" slider that spreads the parts apart
- labels with leader lines; tap one for a short child-friendly card, read-aloud button and Wikipedia link

Static site, no build step: open `index.html` through any web server (e.g. `python -m http.server`).

## Files

- `index.html`, `style.css`, `app.js` — the app (Three.js from a CDN)
- `data/parts.json` — every part: layers, mesh selection, FR/EN name, text, fun fact, Wikipedia title
- `models/body.glb` — generated model
- `tools/build-model.mjs` — regenerates the model from BodyParts3D
- `tools/check-wiki.mjs` — checks every Wikipedia link and text

## Rebuilding the model

Download from the [BodyParts3D archive](https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html):
`isa_element_parts.txt`, `partof_element_parts.txt`, `isa_BP3D_4.0_obj_99.zip`, `partof_BP3D_4.0_obj_99.zip`
into one folder, unzip both archives into `<folder>/obj/`, then:

```bash
cd tools && npm install && node build-model.mjs <folder>
```

## Credits

3D models: BodyParts3D, © The Database Center for Life Science, licensed under CC Attribution 4.0 International.
The genital area of the skin is smoothed into a neutral mannequin. Lung envelopes are generated around the bronchial
trees; the spinal cord and limb nerves are drawn by hand along their anatomical routes (BodyParts3D has no peripheral nerves).
