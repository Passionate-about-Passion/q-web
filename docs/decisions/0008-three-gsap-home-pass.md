# 0008 · Three.js and GSAP for the 2027 homepage pass and intro

- **Status:** Proposed
- **Date:** 2026-11-16
- **Trigger:** The 2027 homepage concept (local review, branch `feat/homepage-2027-concept`) asks for a real 3D event pass that hangs on a woven lanyard, swings into place and can be turned, plus a timed intro that hands over to the hero. DESIGN.md MOTION-4 rules out a client-side animation runtime unless an ADR allows it.

## Context

The site is static Astro with no framework islands, and every motion so far is CSS (transitions, keyframes, scroll timelines). The one WebGL use is the hackathon ground: a first-party fragment shader with no library (DESIGN.md HACK-1). The new homepage centres on a physical object: a card with thickness, rounded edges, a cut slot, a metal clip and a woven band that bends, twists and catches light. CSS 3D can only rotate flat planes, so it cannot show a card edge, a band that bends, or reflections that come from material and light. The concept also sequences the intro, the pass dropping in and the hero copy, which must never compete behind a visible overlay. The site's other properties still hold: no cookies, no third-party runtime requests, a page that works without JavaScript, and reduced motion respected (MOTION-2).

## Considered options

1. **CSS only (the mockup's approach)**: two flat faces rotated in a `preserve-3d` box, a CSS swing keyframe. Pro: no dependency, nothing to load. Con: no thickness, edges, bending band or real reflections; it reads as two pictures, which is what the concept asks to replace.
2. **First-party WebGL, no library** (like HACK-1): hand-written shaders and matrices. Pro: smallest bytes. Con: a lit, textured, physically shaded object with an environment map, a loaded clip model and a deforming band is a renderer, not a shader; writing and maintaining that by hand costs far more than the bytes it saves.
3. **Three.js for the pass, GSAP for sequencing, both self-hosted from npm and loaded lazily on the homepage only**: Pro: a maintained renderer with physically based materials, a room environment for reflections without an HDR download, a glTF loader for the Blender clip, and a timeline that can order intro, drop-in and hero reliably. Con: about 150 KB (gzip) of JavaScript more on the homepage, loaded after first paint.

## Decision

Option 3, scoped narrowly. Three.js renders only the hero pass (card, clip, lanyard) into one canvas; GSAP orders the intro, the pass drop-in and the hero entrance, and drives no scroll-linked effect that CSS can do. Both are npm dependencies of `apps/web`, bundled and served first-party (no CDN), and imported only by the homepage's own modules through dynamic `import()`, so no other page ships them and the homepage's first paint does not wait for them.

What decided it: the concept's central object needs real geometry, light and a deforming band, which only a renderer gives, and a static, accessible HTML page stays the base layer: every text, date, countdown figure and ticket link is HTML; the pass is decoration (`aria-hidden`), its canvas is replaced by a pre-rendered still from the same model (Blender) until WebGL is ready, without WebGL, with reduced motion, and when the script fails.

## Consequences

- `apps/web` gains `three` and `gsap` as runtime dependencies (`@types/three` for types). DESIGN.md MOTION-4 names this as its one exception, limited to `components/home/` and this ADR; any other page still needs its own ADR.
- Loading: the still image paints first; the 3D module loads after the intro or on idle, only when WebGL is available, the hero is on screen and the visitor does not prefer reduced motion. Textures are capped (2048 px), the device pixel ratio is capped at 1.75 (1.5 on phones), and rendering stops when the pass rests, when it is off screen and in hidden tabs.
- Phones: the pass is smaller and placed so it never covers the headline, ticket link, date or countdown; it never captures vertical scrolling (touch moves only turn it on a tap, the canvas keeps `touch-action: pan-y`).
- The per-file asset budget (`scripts/check/budgets.mjs`, 1.5 MiB) still applies unchanged; the 3D chunk stays well under it.
- Revisit if the homepage's Lighthouse performance on a mid-range phone drops below the site's other pages because of this chunk, or if a second page wants 3D (then decide whether this becomes a shared building block).
