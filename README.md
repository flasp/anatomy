# Le corps humain / The human body

Interactive 3D human body for young children, in a friendly, colourful style, French and English.

- 6 layers: outside, muscles, blood, nerves, organs, bones
- rotate (drag), move (right-drag / two fingers), zoom (pinch / wheel), double-click to fly in, front / back / side views
- "exploded" slider that spreads the parts apart
- labels with leader lines; tap one for a short child-friendly card, read-aloud button and Wikipedia link
- hide a part, undo, show all

Static site, no build step: open `index.html` through any web server (e.g. `python -m http.server`).

## Files

- `index.html`, `style.css`, `app.js` — the app (Three.js from a CDN)
- `data/parts.json` — every part: layers, mesh selection (`za`), FR/EN name, text, fun fact, Wikipedia title
- `models/<layer>.glb` — generated models, one per layer, loaded when the layer is first shown
- `tools/build-body.mjs` — regenerates the models from Z-Anatomy (`tools/fbx.mjs` reads the FBX files)
- `tools/check-wiki.mjs` — checks every Wikipedia link and text

## Rebuilding the models

Download `Regions.fbx`, `Muscular.fbx`, `Skeletal.fbx`, `Joints.fbx`, `Visceral.fbx`, `Lymphoid.fbx`, `Cardio.fbx`
and `Nervous.fbx` from [Z-Anatomy](https://github.com/LluisV/Z-Anatomy) (branch `PC-Version`, `Resources/Models/FBX/`)
into one folder, then:

```bash
cd tools && npm install && npm run build-body -- <folder>
```

Each part of `data/parts.json` picks its meshes with `za`, a list of regular expressions on `File:group/path/name`.

## Credits and licence

3D models:

- Z-Anatomy - The open source atlas of anatomy - CC-BY-SA 4.0
- BodyParts3D - The Database Center for Life Science - CC-BY-SA 2.1 Japan

The models in `models/` are adapted from them (parts selected, simplified, recoloured; the genital area of the skin is
closed into a neutral mannequin, and reproductive organs are left out). They are shared under the same licence,
[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). The parts of Z-Anatomy that are under a
non-commercial licence (the inner ear) are not used.
