# Atal Sharma: portfolio

A single scrolling story built with plain HTML, CSS and JavaScript, bundled by Vite.
One cobalt line, drawn in real time with three.js, carries the story newest first.
Every 3D moment is a real data-science idea, and orange only ever marks what a data
scientist has to catch: noise, flagged data, errors and overfitting.

| Scroll position | What the 3D does | What the text says |
| --- | --- | --- |
| Hero | The portrait sharpens out of noise in steps, like an image model. A noisy orange signal goes behind the head and comes out as a clean cobalt line | I build AI agents that survive production |
| Ingenia AI (2023 to now) | The line frays into five agents that tangle while orange messages collide, then braid while messages take turns | Getting AI agents to talk to each other, without starting a fight; an orchestrator, not a group chat |
| Gates | Strands flagged at the first ring turn orange, masking clears one, the flagged ones go into a self-hosted box and the rest go to an API | Every query passes three gates |
| Recent work | The 3D rests; six agents built at Ingenia AI, each card with a short animation of what it does and one plain line (no product names) | Recent work |
| Skills | The section pins and starts as an untrained embedding: every skill is a grey point scattered among orange noise. Each step of scroll trains one stage of the pipeline (data, models, agents, evaluation, production): the line draws to its node, the node and name light up, and its skills fly into their group. On phones the line runs down the side and each group gathers as it arrives | Skills, in the order a system gets built |
| WARPSPD.ai (2020 to 2023) | A ratings matrix gets its missing cells filled from two factor strips (matrix factorisation), then a forecast line with an uncertainty band and one orange anomaly | Before agents, production ML |
| 50,000 cries (2018 to 2020) | The line becomes a cry, the cry prints a spectrogram, the spectrogram shrinks into one dot, then 50,000 dots arrive (the counter counts exactly the dots on screen), sort into five labelled bands and fly into an embedding where about one in ten lands in the wrong cluster and turns orange | It started with 50,000 cries |
| Principles | A brush stroke floods the page cobalt; a demo curve keeps improving while the production curve peels away | The two rules |
| Contact | One calm line again | Let's talk |

## Run it

```bash
npm install
npm run dev       # local dev server with hot reload
npm run build     # production build into dist/
npm run preview   # serve dist/ locally to check the build
```

Node 20.19 or newer (Node 22 LTS recommended). Check with `node -v`.

## Publish on GitHub Pages (https://ashsharma96.github.io)

You do not need Node on your computer to publish: GitHub builds the site itself. This folder
already contains `.github/workflows/deploy.yml`, which builds and publishes the site every
time you push to `main`.

### One-time setup

1. Install Git from https://git-scm.com (on Windows keep the default options; they include
   the helper that signs you in to GitHub through the browser).
2. Tell Git who you are, once per computer:

   ```bash
   git config --global user.name "Atal Sharma"
   git config --global user.email "the email on your GitHub account"
   ```

3. On GitHub, create a new **public** repository named exactly `ashsharma96.github.io`.
   Leave *Add a README*, *.gitignore* and *license* unticked; this folder already has them.
4. In that repository open **Settings > Pages**. Under *Build and deployment*, set
   **Source** to **GitHub Actions**.
5. Open a terminal inside this folder (the one with `package.json` in it). On Windows: open
   the folder in File Explorer, type `cmd` in the address bar and press Enter. Then run:

   ```bash
   git init
   git add .
   git commit -m "Portfolio"
   git branch -M main
   git remote add origin https://github.com/ashsharma96/ashsharma96.github.io.git
   git push -u origin main
   ```

   The first push opens a browser window to sign in to GitHub. If the terminal asks for a
   password instead, paste a personal access token (GitHub > Settings > Developer settings >
   Personal access tokens), not your account password.
6. Open the repository's **Actions** tab and wait for *Deploy to GitHub Pages* to show a
   green tick (one or two minutes). The site is then live for anyone at
   **https://ashsharma96.github.io**.

Use git as above rather than uploading files on the GitHub website: the upload page can
leave out the `.github` folder, and without it nothing gets published.

### Updating the site later

```bash
git add .
git commit -m "Update"
git push
```

Each push rebuilds and republishes the site automatically.

### If something goes wrong

- **The first run fails at the Pages step:** Pages was not switched to GitHub Actions yet.
  Do step 4, open the failed run in the Actions tab and press **Re-run all jobs**.
- **`git push` is rejected with "fetch first":** the repository was created with GitHub's
  sample README. Nothing else is in it yet, so replace it with yours:
  `git push -u origin main --force` (only for this first push).
- **404 after a green run:** wait a minute and refresh. Check that the repository is public
  and named exactly `ashsharma96.github.io`.
- **You still see the old version:** hard refresh with Ctrl+Shift+R (Cmd+Shift+R on a Mac).

Link previews (LinkedIn, X, WhatsApp) need the full address of `og-image.jpg`. The workflow
passes the Pages address to the build as `VITE_SITE_URL`; `.env` holds the local fallback.
If you later use a custom domain, nothing needs to change.

### Other hosts

`dist/` is a fully static site with relative paths, so it works on any host and in a sub-folder.
Netlify, Vercel and Cloudflare Pages all work with build command `npm run build` and output
directory `dist`. Set `VITE_SITE_URL` to the site's address (ending in `/`) in their settings.

## Where things live

```
index.html              all copy, in reading order (edit text here)
public/img/             portrait, cut out and graded black and white
public/env/             studio lighting rendered in Blender, packed as a PNG
public/og-image.jpg     link preview image
public/favicon.svg      icon
src/story.js            the story timeline shared by the page and the 3D
src/main.js             scroll, text reveals, nav, flood and loss curves, contact
src/denoise.js          the portrait's step-by-step denoising reveal
src/recent.js           the short animation for each Recent work card
src/skills.js           the Skills section: scatter, then scroll trains each stage
src/styles/main.css     tokens, layout, responsive and reduced-motion rules
src/three/stage.js      the 3D story: keyframes, matrix, forecast, 50,000 dots
src/three/tube.js       a tube whose shape and colour can change every frame
src/three/signal.js     the synthetic cry waveform and spectrogram
blender/studio.blend    the lighting studio (open in Blender 5.0 or newer)
blender/studio_env.py   script that builds the studio and renders the panorama
.github/workflows/      the GitHub Pages build and deploy
.env                    site address fallback for link previews
```

### The Blender lighting

`blender/studio.blend` is a small photo studio: a large key softbox, a soft fill, an
overhead strip light, an edge strip and a paper-coloured floor. Rendering it with the
panorama camera gives the reflections on the 3D objects. To change the lighting:

1. Open `studio.blend`, move or resize the light cards, render (F12) and save the
   image as Radiance HDR.
2. Or rebuild it from the script: `blender -b -P blender/studio_env.py` (or
   `python3 blender/studio_env.py` with the `bpy` package). It writes `studio-raw.hdr`
   next to the script.
3. Pack it for the web as an 8-bit PNG storing `x / (1 + x)` per channel, 512 x 256,
   saved as `public/env/studio-env.png`. The page decodes it back to full range.

### Changing the photo

Replace `public/img/atal-portrait-1200.webp` and `atal-portrait-720.webp` with a
transparent-background, black-and-white cut-out of the same proportions (about 1200 x 1152).

### Changing the story timing

`src/story.js` describes the timeline. `SCHEDULE` at the top of `src/three/stage.js` lists
which shape the line holds at each value of T, and `measure()` in `src/main.js` maps scroll
ranges to T. Chapter length is the `--len` value on each `<section class="chapter">`
(in screen heights).

## Accessibility and fallbacks

- Checked from 360px phones to 2560px monitors, tablets and phones held sideways included.
  Nothing ever scrolls or zooms sideways: animations that start pieces off screen are clipped
  at the page edge (see the note on `html` in `main.css`).
- All content is real HTML text; the 3D canvas is decorative and hidden from screen readers.
- The five cry types are keyed with colour swatches in the text as well as in 3D.
- Skills are a real ordered list of stages, each with its own list of skills; the scatter
  is only a visual effect on top of that markup.
- With **reduced motion** turned on, nothing is pinned or scrubbed, every paragraph is visible
  in normal flow, the portrait appears without the noise effect, and the 3D shows still
  states (it is removed entirely on phones).
- With **JavaScript off**, the whole story reads top to bottom as a normal page.
- Without WebGL, the page works the same minus the 3D.

## Credits and licences

- Type: Mona Sans and Martian Mono (SIL Open Font License), self-hosted via Fontsource.
- three.js (MIT), GSAP with ScrollTrigger and SplitText (free standard licence), Lenis (MIT).
- Studio lighting built and rendered in Blender (GPL; the rendered image is yours).
