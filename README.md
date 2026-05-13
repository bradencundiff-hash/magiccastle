# Magic Castle — kindergarten spelling

A small browser game for **desktop keyboard** practice: children type 3–4 letter words, get calm feedback, and earn on-screen “stickers” when a word is correct. Visuals are **original SVG shapes** (castle + friendly “tool pal”) so the repository stays easy to ship under an open license. See [ATTRIBUTION.md](ATTRIBUTION.md) before adding any Disney-owned artwork.

## Run locally

You need [Node.js](https://nodejs.org/) 20+ (22 recommended).

```bash
cd magiccastle
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`). Click **Start playing**, then type letters; **Backspace** fixes a letter.

## Build

```bash
npm run build
```

Output is written to `dist/`.

## GitHub Pages

The site is published at  
`https://bradencundiff-hash.github.io/magiccastle/`  
once Pages is enabled for the repository (**Settings → Pages → Build and deployment → GitHub Actions**).

Production build with the correct base path:

```bash
npm run build:pages
```

The workflow [.github/workflows/pages.yml](.github/workflows/pages.yml) runs `npm install` and `npm run build:pages` on every push to `main`.

## Design notes

- **Predictable layout** each round: hint text, letter boxes, the same tool buttons.
- **Settings** (saved in `localStorage`): sound, motion preference, larger UI, high contrast, Toodles-style first-slot highlight, slower transitions, optional “stay on word until Next.”
- **Speech**: “Say the word” uses the browser `speechSynthesis` API when available.
- **Reduced motion**: Honors `prefers-reduced-motion` unless the caregiver explicitly allows celebration motion.

## Disney / fan content

Open-sourcing this repo does **not** include rights to Mickey, Toodles, or other Disney art. Add only assets you are allowed to redistribute, and document them in [ATTRIBUTION.md](ATTRIBUTION.md).

## License

MIT — see [LICENSE](LICENSE).
