/**
 * The homepage's sequence (DESIGN.md HOME-1, ADR-0008): the loading intro,
 * then the hero, then the pass, in that order and never on top of each
 * other; plus the page's scroll reveals and number counters.
 *
 * GSAP orders the intro, the hero entrance and the pass's cue. Nothing
 * waits on an asset: the intro has a fixed length (about four seconds), ends at once on any key, a click or "Skip intro", and the CSS
 * clears it by itself if this script never runs. The hero copy is HTML
 * from the start; the entrance only fades it in.
 *
 * The intro's end, after the team's loading film: the loader's content
 * lifts away while the hero's navy and light rise from the bottom behind a
 * long soft edge; a copy of the hero's headline (same box width, same
 * type, same line breaks) fades in small in the middle of the screen,
 * holds for a moment, then zooms into the place of the real one. Once it
 * lands the real headline is shown under it, the panel's ground (which
 * draws the hero's light over exactly the hero's box) fades into the
 * page, the copy goes with the intro, and the rest of the hero comes in:
 * one headline throughout, never two, and nothing jumps.
 *
 * Reveals start early (as an element's top reaches 6 % below the window)
 * and take half a second; anything already passed when the page loads or
 * jumps is shown at once. Counters run once, in under a second, from the
 * moment a quarter of the figure is visible; the final value is in the
 * HTML all along.
 */
import { gsap } from "gsap";
import { getPassController } from "./hanging-pass.client";

const root = document.documentElement;
const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Shows the hero: every entrance item fades and rises in, a little apart,
 * except `keep` (the headline the intro has just handed over), which is
 * already in place and is shown at once.
 */
function heroEntrance(keep: HTMLElement | null = null, delay = 0) {
  const items = [
    ...document.querySelectorAll<HTMLElement>("[data-hero-in]"),
  ].filter((el) => el !== keep);
  if (reduced || items.length === 0) {
    root.dataset.hero = "in";
    return Promise.resolve();
  }
  gsap.set(items, { opacity: 0, y: 22 });
  root.dataset.hero = "in";
  return new Promise<void>((resolve) => {
    gsap.to(items, {
      opacity: 1,
      y: 0,
      duration: 0.7,
      delay,
      ease: "power3.out",
      stagger: 0.07,
      clearProps: "opacity,transform",
      onComplete: () => resolve(),
    });
  });
}

/**
 * Plays the intro. `onCovered` runs at the moment the panel's copy of the
 * headline has landed, with the hero's headline (now exactly under the
 * copy), so the hero can be shown there.
 */
function runIntro(
  onCovered: (title: HTMLElement | null) => void,
): Promise<void> {
  const intro = document.querySelector<HTMLElement>("[data-home-intro]");
  if (!intro || root.dataset.intro !== "play") return Promise.resolve();
  // The CSS failsafe clears the intro 5.5 s after load. A script that
  // arrives late plays a shorter intro inside that window, and one that
  // arrives too late never brings it back.
  const left = 5200 - performance.now();
  if (left < 1600) {
    intro.remove();
    root.dataset.intro = "done";
    return Promise.resolve();
  }
  const pace = Math.max(1, 4500 / left);
  root.dataset.intro = "run";
  try {
    localStorage.setItem("q27-intro", String(Date.now()));
  } catch {
    /* fine: it will simply play again next time */
  }

  const first = Number(intro.dataset.firstYear) || 2017;
  const last = Number(intro.dataset.lastYear) || first + 10;
  const year = intro.querySelector<HTMLElement>("[data-intro-year]");
  const mark = intro.querySelector<HTMLElement>("[data-intro-mark]");
  const trace = intro.querySelector<SVGElement>("[data-intro-trace]");
  const bar = intro.querySelector<HTMLElement>("[data-intro-bar]");
  const caption = intro.querySelector<HTMLElement>("[data-intro-caption]");
  const glow = intro.querySelector<HTMLElement>("[data-intro-glow]");
  const skip = intro.querySelector<HTMLButtonElement>("[data-intro-skip]");
  const center = intro.querySelector<HTMLElement>("[data-intro-center]");
  const frame = intro.querySelector<HTMLElement>("[data-intro-frame]");
  const ground = intro.querySelector<HTMLElement>("[data-intro-panel-ground]");
  const light = intro.querySelector<HTMLElement>("[data-intro-panel-light]");
  const copy = intro.querySelector<HTMLElement>("[data-intro-copy]");
  const title = document.querySelector<HTMLElement>("#home-hero-title");
  const hero = title?.closest<HTMLElement>("section") ?? null;
  const counter = { value: first };

  // Where the copy starts (small, centred); the fade in rises to it.
  let startY = 0;

  /** The panel's copy of the headline: the real one's box, type and
   *  breaks; and the hero's light over exactly the hero's box. The copy
   *  then starts small with its words centred on the screen; the fly below
   *  zooms it from there into the real one's place. */
  const placeCopy = () => {
    if (hero && light) {
      const style = getComputedStyle(hero);
      for (const key of ["x", "y", "size"]) {
        const value = style.getPropertyValue(`--hx-spot-${key}`).trim();
        if (value) light.style.setProperty(`--hx-spot-${key}`, value);
      }
      const area = hero.getBoundingClientRect();
      Object.assign(light.style, {
        left: `${area.left}px`,
        top: `calc(var(--hi-edge) + ${area.top}px)`,
        width: `${area.width}px`,
        height: `${area.height}px`,
      });
    }
    if (!title || !copy) return;
    const box = title.getBoundingClientRect();
    const type = getComputedStyle(title);
    copy.innerHTML = title.innerHTML;
    Object.assign(copy.style, {
      left: `${box.left}px`,
      top: `${box.top}px`,
      width: `${box.width}px`,
      fontFamily: type.fontFamily,
      fontSize: type.fontSize,
      fontWeight: type.fontWeight,
      lineHeight: type.lineHeight,
      letterSpacing: type.letterSpacing,
      textAlign: type.textAlign,
    });
    copy.style.setProperty(
      "text-wrap",
      type.getPropertyValue("text-wrap") || "balance",
    );
    // Where the words themselves sit inside the box (a left aligned
    // headline does not fill its box's width).
    const range = document.createRange();
    range.selectNodeContents(copy);
    const words = range.getBoundingClientRect();
    const own = copy.getBoundingClientRect();
    const across = words.width || own.width;
    const down = words.height || own.height;
    const scale = Math.min(0.6, (window.innerWidth * 0.82) / across);
    const offsetX = (words.width ? words.left : own.left) - own.left;
    const offsetY = (words.height ? words.top : own.top) - own.top;
    startY = window.innerHeight / 2 - box.top - (offsetY + down / 2) * scale;
    gsap.set(copy, {
      x: window.innerWidth / 2 - box.left - (offsetX + across / 2) * scale,
      y: startY,
      scale,
      force3D: false,
    });
  };

  return new Promise((resolve) => {
    let finished = false;
    let covered = false;
    const tl = gsap.timeline({
      defaults: { ease: "power2.out" },
      onComplete: done,
    });
    tl.timeScale(pace);
    // The intro keeps to the clock: on a device that draws slowly it skips
    // frames instead of slowing down (GSAP's lag smoothing would stretch
    // it), so it always reaches the headline before the cap below.
    gsap.ticker.lagSmoothing(0);

    // The Q settles in (a small scale and a fade, no overshoot), its
    // outline is traced in light while the years run and the line fills,
    // all three on the same curve and the same clock, so they arrive
    // together; "10 Years of Q-Summit" joins halfway, and the year turns
    // ice over its last steps. Transform and opacity only (MOTION-3): an
    // animated blur cost slow devices whole frames.
    tl.fromTo(
      mark,
      { scale: 0.86, opacity: 0 },
      {
        scale: 1,
        opacity: 1,
        duration: 0.8,
        ease: "expo.out",
      },
      0,
    )
      .fromTo(
        glow,
        { opacity: 0, scale: 0.9 },
        { opacity: 1, scale: 1, duration: 1.6, ease: "sine.out" },
        0,
      )
      .to(
        trace,
        { strokeDashoffset: 0, duration: 1.5, ease: "sine.inOut" },
        0.2,
      )
      .to(bar, { scaleX: 1, duration: 1.5, ease: "sine.inOut" }, 0.2)
      .to(
        counter,
        {
          value: last,
          duration: 1.5,
          ease: "sine.inOut",
          onUpdate: () => {
            if (year) year.textContent = String(Math.round(counter.value));
          },
        },
        0.2,
      )
      // The ice settles over the last steps (a color transition,
      // HomeIntro.astro), so it is there as the edition's year arrives.
      .call(() => year?.classList.add("is-now"), undefined, 1.3)
      .fromTo(
        caption,
        { opacity: 0, y: 8 },
        { opacity: 1, y: 0, duration: 0.6, ease: "power2.out" },
        0.75,
      )
      .addLabel("exit", 1.9)
      // The loader's content lifts away and its frame fades, quickly, so
      // it is gone before the headline comes in (never two texts at once).
      .to(
        center,
        { opacity: 0, y: -14, duration: 0.4, ease: "power2.out" },
        "exit",
      )
      .to(frame, { opacity: 0, duration: 0.4, ease: "power1.out" }, "exit")
      .to(skip, { opacity: 0, duration: 0.3, ease: "power1.out" }, "exit")
      // The hero's ground and light rise from the bottom behind their soft
      // edge (the copy of the headline is placed as it starts, also after
      // a skip). (y: 0 drops the pixel offset GSAP would otherwise read
      // from the ground's resting CSS transform and keep on top of
      // yPercent.)
      .fromTo(
        ground,
        { y: 0, yPercent: 100 },
        {
          y: 0,
          yPercent: 0,
          duration: 0.8,
          ease: "power2.inOut",
          onStart: placeCopy,
        },
        "exit",
      )
      // The light's own top edge, soft while it travels, closes as the
      // ground settles.
      .fromTo(
        light,
        { "--hi-lift": "24vh" },
        { "--hi-lift": "0vh", duration: 0.8, ease: "power2.inOut" },
        "exit",
      )
      // The headline fades in small in the middle of the screen as the
      // soft edge passes it, rising a little, the way the ground rises.
      .fromTo(
        copy,
        { opacity: 0, y: () => startY + 14 },
        {
          opacity: 1,
          y: () => startY,
          duration: 0.5,
          ease: "power2.out",
          force3D: false,
          immediateRender: false,
        },
        "exit+=0.4",
      )
      // It is read for a moment, then zooms into the real one's place:
      // eased in and out, so it leaves gently and lands without a bump.
      // force3D: false keeps the text drawn sharp at every size.
      .addLabel("fly", "exit+=1.35")
      .to(
        copy,
        {
          x: 0,
          y: 0,
          scale: 1,
          duration: 0.8,
          ease: "power2.inOut",
          force3D: false,
        },
        "fly",
      )
      .call(cover, undefined, "fly+=0.8")
      // Its ground fades into the hero, which draws the same light in the
      // same place; the headline stays.
      .to(
        ground,
        { opacity: 0, duration: 0.45, ease: "power1.inOut" },
        "fly+=0.8",
      );

    /** The copy has landed: show the real headline under it. */
    function cover(): void {
      if (covered) return;
      covered = true;
      intro!.classList.add("is-covered");
      onCovered(title ?? null);
    }

    function done(): void {
      if (finished) return;
      finished = true;
      cover();
      gsap.ticker.lagSmoothing(500, 33);
      intro!.remove();
      root.dataset.intro = "done";
      window.removeEventListener("keydown", skipNow);
      window.removeEventListener("resize", onResize);
      resolve();
    }

    /** A resize (a phone turned, a window dragged) moves the hero's
     *  headline: the copy is placed again, and if it is already flying it
     *  lands at once, on the new place. A height-only change (a phone's
     *  browser bar) moves nothing that matters and is ignored. */
    let width = window.innerWidth;
    function onResize(): void {
      if (finished || window.innerWidth === width) return;
      width = window.innerWidth;
      const exit = tl.labels.exit ?? 0;
      const fly = tl.labels.fly ?? exit;
      if (tl.time() < exit) return;
      placeCopy();
      if (tl.time() >= fly) tl.seek(fly + 0.8, false);
      else gsap.set(copy, { opacity: 1, y: startY });
    }

    function skipNow(): void {
      if (finished) return;
      const at = tl.labels.exit ?? 0;
      if (tl.time() < at) {
        tl.seek(at);
        // A seek passes over the timeline's calls: settle what they set.
        if (year) year.textContent = String(last);
        year?.classList.add("is-now");
      }
      tl.timeScale(1.6);
    }

    skip?.addEventListener("click", skipNow);
    intro.addEventListener("pointerdown", (event) => {
      if (event.target !== skip) skipNow();
    });
    window.addEventListener("keydown", skipNow);
    window.addEventListener("resize", onResize);
    // Absolute cap: whatever happens, the page is free after 5.4 s.
    setTimeout(() => {
      if (!finished) {
        tl.kill();
        done();
      }
    }, 5400);
  });
}

/** Reveals: early, quick, once; instant for anything already passed. */
function initReveals(): void {
  const items = [...document.querySelectorAll<HTMLElement>("[data-h-reveal]")];
  if (reduced || !("IntersectionObserver" in window)) {
    items.forEach((el) => el.classList.add("is-in", "is-instant"));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const el = entry.target as HTMLElement;
        const passed = entry.boundingClientRect.bottom < 0;
        if (entry.isIntersecting || passed) {
          if (passed) el.classList.add("is-instant");
          el.classList.add("is-in");
          io.unobserve(el);
        }
      }
    },
    { rootMargin: "0px 0px 6% 0px" },
  );
  items.forEach((el) => io.observe(el));
}

/** Figures count up once, fast, from a quarter visible. */
function initCounters(): void {
  const figures = [
    ...document.querySelectorAll<HTMLElement>("[data-count-to]"),
  ];
  if (reduced || figures.length === 0 || !("IntersectionObserver" in window))
    return;
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const el = entry.target as HTMLElement;
        io.unobserve(el);
        const end = Number(el.dataset.countTo);
        if (!Number.isFinite(end) || end <= 0) continue;
        const fmt = new Intl.NumberFormat("en-US");
        const state = { v: 0 };
        gsap.to(state, {
          v: end,
          duration: Math.min(1, 0.55 + end / 4000),
          ease: "power2.out",
          onUpdate: () => {
            el.textContent = fmt.format(Math.round(state.v));
          },
        });
      }
    },
    { threshold: 0.25 },
  );
  figures.forEach((el) => {
    // Only figures not yet seen count; one already on screen stays put.
    const rect = el.getBoundingClientRect();
    if (
      rect.top < window.innerHeight &&
      rect.bottom > 0 &&
      root.dataset.intro !== "run"
    )
      return;
    io.observe(el);
  });
}

export async function startHomeStage(): Promise<void> {
  const pass = getPassController();
  initReveals();
  initCounters();
  let hero: Promise<void> | null = null;
  await runIntro((title) => {
    // The headline is in place under the panel: the rest of the hero
    // comes in while the panel fades into the page.
    hero = heroEntrance(title, 0.25);
  });
  hero ??= heroEntrance();
  // The pass drops as the copy settles, not behind the panel.
  await new Promise((resolve) => setTimeout(resolve, reduced ? 0 : 280));
  await Promise.all([hero, pass?.enter()]);
}
