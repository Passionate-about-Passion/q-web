# 0009 · Three.js and a second typeface for the Q-Hack page

- **Status:** Proposed
- **Date:** 2026-11-21
- **Trigger:** The Q-Hack 2027 page (`/hackathon`, branch `feat/qhack-2027`) was approved as a standalone mockup over eight review rounds. Its center is a real laptop that forms out of particles, opens, turns and gets "taken over", and a roll of film with photos. Its voice is a terminal, set in a monospaced face. DESIGN.md MOTION-4 allows Three.js on the homepage only ([ADR-0008](0008-three-gsap-home-pass.md) asks every other page for its own ADR), and the Typography rules name Montserrat as the only family.

## Context

The previous `/hackathon` page (Q-Hack x Hacktoberfest 2026) already used WebGL, but as one first-party fragment shader with no library. The 2027 page needs lit, textured geometry: a glTF model with physically based aluminum and glass, a studio environment for its reflections, glossy stickers on the lid, a display that is a live texture, and a cylinder of photographs with depth of field. That is a renderer, the same conclusion ADR-0008 reached for the homepage pass, and the dependency it chose (`three`) is already installed and served first-party. The page's identity is a terminal: prompts, typed lines, log entries and a status line only read as such in a monospaced face, and Montserrat has none. The site's other properties still hold: no cookies, no third-party runtime requests, a page that works without JavaScript, reduced motion respected (MOTION-2), and no asset over the per-file budget.

## Considered options

1. **CSS and first-party WebGL only, as on the 2026 page**: a drawn CSS laptop and a CSS 3D cylinder, hand-written shaders for the rest. Pro: no new code path, nothing to load. Con: the approved design cannot be built this way; reflections, the lid's stickers, the particle formation and the display texture all need a lit 3D scene, and writing that by hand is the cost ADR-0008 already declined.
2. **Three.js for the laptop and the film roll, loaded lazily on `/hackathon` only; the other two canvases stay first-party WebGL; JetBrains Mono self-hosted as a second face for this page only**: Pro: the dependency exists, the page ships it in its own chunks after first paint, and the two simple canvases (hero characters, aftermovie picture) cost no library at all. Con: a second page now depends on Three.js, and the site carries a second font file (about 40 KB, loaded by this page alone).
3. **Three.js everywhere on the page, including hero and aftermovie**: Pro: one way of drawing. Con: the hero would wait for the library before its first frame, for two effects that are a few hundred lines of plain WebGL.

## Decision

Option 2. Three.js renders exactly two things on `/hackathon`: the laptop sequence and the film roll. Both are imported by dynamic `import()` from `components/qhack/qhack.client.ts`, after the hero has assembled or at the first scroll, never on first paint and never on another page. The hero lockup and the aftermovie picture are first-party WebGL without a library. GSAP is not used: every sequence on the page is driven by one scroll value or a timer.

JetBrains Mono is self-hosted through the same Astro Fonts API route as Montserrat (`fontProviders.local()` reading the woff2 from `@fontsource-variable/jetbrains-mono`, no CDN at build time or in the browser) and its `<Font>` is rendered by `/hackathon` alone, so no other page downloads it. Montserrat stays the face of the section headings.

What decided it: the approved design is a physical object and a terminal, and both needs are met with pieces the site already knows how to ship (a first-party bundle, a self-hosted font), scoped to one page.

## Consequences

- DESIGN.md MOTION-4 and HACK-1 name `/hackathon` as the second sanctioned place for Three.js, limited to `components/qhack/` and this ADR; the Typography section names JetBrains Mono as the second face, for `/hackathon` only. `apps/web` gains `@fontsource-variable/jetbrains-mono`; `three` and `@types/three` are unchanged.
- HTML is the base layer. Every text, date, programme entry, photo, question and link is HTML from the CMS at build time. Without JavaScript, without WebGL and with reduced motion the laptop is a short text block with the apply link, the photos are a plain grid, the aftermovie is its poster, and every answer is written out. A flag set before first paint keeps the scripted page from flashing its plain form, and is taken back if the script never arrives.
- Loading and cost: the model is meshopt-compressed (about 0.55 MB) and the lid stickers are WebP (about 0.13 MB together), committed under `public/hackathon/` like the homepage pass. Each canvas draws only while it is on screen; drawing buffers are capped by a pixel budget, so a 4K window does not cost four times a laptop screen; shaders compile asynchronously before the first frame.
- The first-party WebGL ground of the 2026 page (`ground-gl.ts`, its worker and posters, `pnpm ground:poster`) is removed with that page.
- The aftermovie is a video and therefore not a Media library upload: like the home film it lives on R2 under a fixed `/media/` key and is uploaded by a maintainer. The section leaves the page if the file cannot be loaded.
- The visual regression gallery shows the page without the script (the canvases are empty there by design), so its baselines cover layout and type, not the 3D.
- Revisit if the page's Lighthouse performance on a mid-range phone drops below the site's other pages because of the 3D chunks, or if a third page wants Three.js: then the shared pieces (studio environment, pixel budget, visibility handling) become one building block instead of two copies.
