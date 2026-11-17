/**
 * The homepage's sequence (DESIGN.md HOME-1, ADR-0008): the loading intro,
 * then the hero, then the pass, in that order and never on top of each
 * other; plus the page's scroll reveals and number counters.
 *
 * GSAP orders the intro, the hero entrance and the pass's cue. Nothing
 * waits on an asset: the intro has a fixed length, ends at once on any
 * key, a click or "Skip intro", and the CSS clears it by itself if this
 * script never runs. The hero copy is HTML from the start; the entrance
 * only fades it in.
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

function heroEntrance(): Promise<void> {
  const items = [...document.querySelectorAll<HTMLElement>("[data-hero-in]")];
  if (reduced || items.length === 0) {
    root.dataset.hero = "in";
    return Promise.resolve();
  }
  gsap.set(items, { opacity: 0, y: 22 });
  root.dataset.hero = "in";
  return new Promise((resolve) => {
    gsap.to(items, {
      opacity: 1,
      y: 0,
      duration: 0.7,
      ease: "power3.out",
      stagger: 0.07,
      clearProps: "opacity,transform",
      onComplete: () => resolve(),
    });
  });
}

function runIntro(): Promise<void> {
  const intro = document.querySelector<HTMLElement>("[data-home-intro]");
  if (!intro || root.dataset.intro !== "play") return Promise.resolve();
  // The CSS failsafe clears the intro 4.5 s after load. A script that
  // arrives late plays a shorter intro inside that window, and one that
  // arrives too late never brings it back.
  const left = 4300 - performance.now();
  if (left < 1400) {
    intro.remove();
    root.dataset.intro = "done";
    return Promise.resolve();
  }
  const pace = Math.max(1, 3100 / left);
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
  const qB = intro.querySelector<HTMLElement>("[data-intro-q-b]");
  const skip = intro.querySelector<HTMLButtonElement>("[data-intro-skip]");
  const counter = { value: first };

  return new Promise((resolve) => {
    let finished = false;
    const tl = gsap.timeline({
      defaults: { ease: "power2.out" },
      onComplete: done,
    });
    tl.timeScale(pace);

    tl.fromTo(
      mark,
      { scale: 0.55, opacity: 0, filter: "blur(10px)" },
      {
        scale: 1,
        opacity: 1,
        filter: "blur(0px)",
        duration: 0.9,
        ease: "back.out(1.4)",
      },
      0,
    )
      .fromTo(
        glow,
        { opacity: 0.2, scale: 0.85 },
        { opacity: 1, scale: 1.05, duration: 1.8, ease: "sine.inOut" },
        0,
      )
      .to(
        trace,
        { strokeDashoffset: 0, duration: 1.75, ease: "power2.inOut" },
        0.1,
      )
      .to(bar, { scaleX: 1, duration: 1.85, ease: "power2.inOut" }, 0.1)
      .to(
        counter,
        {
          value: last,
          duration: 1.6,
          ease: "power1.inOut",
          onUpdate: () => {
            if (year) year.textContent = String(Math.round(counter.value));
          },
        },
        0.25,
      )
      // The year turns ice gradually while the last years run in (a
      // color transition, HomeIntro.astro), so it has settled by 2027.
      .call(() => year?.classList.add("is-now"), undefined, 1.0)
      .fromTo(
        caption,
        { opacity: 0, y: 12 },
        { opacity: 1, y: 0, duration: 0.6 },
        1.0,
      )
      // The reflection moves: the second lighting state of the Q.
      .to(qB, { opacity: 1, duration: 1.4, ease: "sine.inOut" }, 0.6)
      .addLabel("exit", 2.3)
      // The curtain rises into the page; the centre lifts a little faster.
      .fromTo(
        intro,
        { clipPath: "inset(0% 0% 0% 0%)" },
        {
          clipPath: "inset(0% 0% 100% 0%)",
          duration: 0.8,
          ease: "power3.inOut",
        },
        "exit",
      )
      .to(
        intro.querySelector(".hi-center"),
        { y: -60, opacity: 0, duration: 0.55, ease: "power2.in" },
        "exit",
      );

    function done(): void {
      if (finished) return;
      finished = true;
      intro!.remove();
      root.dataset.intro = "done";
      window.removeEventListener("keydown", skipNow);
      resolve();
    }

    function skipNow(): void {
      if (finished) return;
      const at = tl.labels.exit ?? 0;
      if (tl.time() < at) tl.seek(at);
      tl.timeScale(1.6);
    }

    skip?.addEventListener("click", skipNow);
    intro.addEventListener("pointerdown", (event) => {
      if (event.target !== skip) skipNow();
    });
    window.addEventListener("keydown", skipNow);
    // Absolute cap: whatever happens, the page is free after 4.5 s.
    setTimeout(() => {
      if (!finished) {
        tl.kill();
        done();
      }
    }, 4500);
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
  await runIntro();
  const hero = heroEntrance();
  // The pass drops as the copy settles, not behind the curtain.
  await new Promise((resolve) => setTimeout(resolve, reduced ? 0 : 280));
  await Promise.all([hero, pass?.enter()]);
}
