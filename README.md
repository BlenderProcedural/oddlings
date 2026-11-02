# Oddlings: product page

This is the product page and a playable sprite demo for **Oddlings**, a procedural creature generator for Blender 5.2+.

- One click, a word or a photo hatches a toon creature.
- Every creature is a single Geometry Nodes object with 111 live parameters and seven animations.
- A one-click sprite sheet exporter is built in.

This repository holds only the description, the media and the demo. The add-on itself is sold on Superhive and is not included here.

- Product page: `index.html`, served with GitHub Pages at https://blenderprocedural.github.io/oddlings/
- Playable demo on its own: `demo.html`, at https://blenderprocedural.github.io/oddlings/demo.html
- Images: `images/` (cover, store images, logo, tutorial poster)
- Video and loops: `media/` (promo, two-minute tutorial, short feature loops)
- Demo sprites: `demo/`. These are atlases and their Aseprite-style JSON exactly as the Oddlings exporter wrote them: 8 directions × 7 actions × 8 frames, 64 px pixel art. `demo/meadow.png` is the background.
- Style, iframe helper and the game: `assets/`. Fonts (Inter) are bundled in `fonts/`, so the pages make no external requests.

## Embedding

Both pages work inside an iframe:

- Links to other pages open in a new tab.
- The page posts its height to the parent window as `{type: "oddlings-height", height}`.

Full product page:

```html
<iframe src="https://blenderprocedural.github.io/oddlings/"
        width="100%" height="6400" style="border:0" loading="lazy" title="Oddlings for Blender"></iframe>
```

Demo only:

```html
<iframe src="https://blenderprocedural.github.io/oddlings/demo.html"
        width="100%" height="640" style="border:0;border-radius:12px" loading="lazy" title="Oddlings sprite demo"></iframe>
```

## License

All renders, videos, text and code in this repository are © BlenderProcedural. All rights reserved.
