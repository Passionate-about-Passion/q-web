/**
 * The homepage's behavior (DESIGN.md HOME-1). The page is complete
 * without it; this adds:
 *
 *   stage     intro, hero entrance, pass, reveals, counters
 *             (home-stage.client.ts, GSAP; ADR-0008)
 *   marquee   the partner strips stop off screen
 *   logos     partner logos are swapped for copies at their drawn size
 *   why       the audience picker: a tab list (hover picks on a fine
 *             pointer, arrow keys move, the card links to the page)
 *   film      the aftermovie loads near the window, plays muted in view
 *             and pauses off screen and in hidden tabs (the stage around
 *             it is CSS, Aftermovie.astro)
 *   palace    the programme's items and bars follow the scroll in clear
 *             steps, a bar jumps to its item, and windows light around a
 *             fine pointer (palace.client.ts; the drawing, the scroll's
 *             lights and the count are CSS, PalaceStage.astro)
 *   clock     the countdown to the end of the discount phase on sale
 *   hero film last edition's film behind the hero, after load, in view only
 */
import { startHomeStage } from "./home-stage.client";
import { initPalace } from "./palace.client";

const reduceMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** WAI APG tab keys: the index a key moves to, or -1 for other keys. */
function tabKeyTarget(key: string, index: number, last: number): number {
  switch (key) {
    case "ArrowDown":
    case "ArrowRight":
      return index === last ? 0 : index + 1;
    case "ArrowUp":
    case "ArrowLeft":
      return index === 0 ? last : index - 1;
    case "Home":
      return 0;
    case "End":
      return last;
    default:
      return -1;
  }
}

function initMarquee(): void {
  const root = document.querySelector<HTMLElement>("[data-marquee]");
  if (!root) return;
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(([entry]) => {
      root.toggleAttribute("data-offscreen", !entry!.isIntersecting);
    }).observe(root);
  }
}

/**
 * The partner files are made for the partner page, several hundred pixels
 * wide; here they are drawn about a hundred wide. Once the page is idle
 * each distinct logo is drawn once into a bitmap of its drawn size and
 * every copy points at it, so the strip never decodes a large file while
 * it moves. The pixels are the logo's own; nothing is recolored.
 */
function initLogoThumbs(): void {
  const imgs = [
    ...document.querySelectorAll<HTMLImageElement>(".pl-plate img"),
  ];
  if (!imgs.length || !("createImageBitmap" in window)) return;
  const bySrc = new Map<string, HTMLImageElement[]>();
  for (const img of imgs) {
    const list = bySrc.get(img.src) ?? [];
    list.push(img);
    bySrc.set(img.src, list);
  }
  const scale = Math.min(3, Math.ceil(window.devicePixelRatio || 1));

  async function convert(copies: HTMLImageElement[]) {
    const first = copies[0]!;
    try {
      await first.decode();
      const width = Math.max(1, Math.round(first.width * scale));
      const height = Math.max(1, Math.round(first.height * scale));
      if (first.naturalWidth <= width * 1.25) return;
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.imageSmoothingQuality = "high";
      const ratio = Math.min(
        width / first.naturalWidth,
        height / first.naturalHeight,
      );
      const w = first.naturalWidth * ratio;
      const h = first.naturalHeight * ratio;
      ctx.drawImage(first, (width - w) / 2, (height - h) / 2, w, h);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/png"),
      );
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      for (const img of copies) img.src = url;
    } catch {
      // A logo that cannot be read stays as it is.
    }
  }

  const run = async () => {
    for (const copies of bySrc.values()) {
      await convert(copies);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  };
  const start = () =>
    "requestIdleCallback" in window
      ? window.requestIdleCallback(() => void run(), { timeout: 3000 })
      : setTimeout(() => void run(), 1200);
  if (document.readyState === "complete") start();
  else window.addEventListener("load", start, { once: true });
}

/** The audience picker: WAI APG tabs, plus hover on a fine pointer. */
function initWhyTabs(): void {
  const root = document.querySelector<HTMLElement>("[data-why]");
  if (!root) return;
  const tabs = [...root.querySelectorAll<HTMLButtonElement>("[data-why-tab]")];
  const panels = [...root.querySelectorAll<HTMLElement>("[data-why-panel]")];
  if (tabs.length === 0) return;

  const narrow = window.matchMedia("(max-width: 860px)");
  function select(index: number, focus = false, fromTap = false): void {
    tabs.forEach((tab, i) => {
      const on = i === index;
      tab.setAttribute("aria-selected", String(on));
      tab.tabIndex = on ? 0 : -1;
    });
    panels.forEach((panel, i) =>
      panel.toggleAttribute("data-selected", i === index),
    );
    if (focus) tabs[index]!.focus();
    // On a narrow screen the card sits under the list: bring it into view.
    if (fromTap && narrow.matches) {
      const card = panels[index];
      const rect = card?.getBoundingClientRect();
      if (card && rect && rect.bottom > window.innerHeight) {
        card.scrollIntoView({
          behavior: reduceMotion() ? "auto" : "smooth",
          block: "nearest",
        });
      }
    }
  }

  tabs.forEach((tab, i) => {
    tab.addEventListener("click", () => select(i, false, true));
    tab.addEventListener("keydown", (event) => {
      const to = tabKeyTarget(event.key, i, tabs.length - 1);
      if (to < 0) return;
      event.preventDefault();
      select(to, true);
    });
  });

  // A fine pointer picks on hover, after a short rest so passing over the
  // rows on the way somewhere else does not flicker the card.
  if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
    let timer = 0;
    tabs.forEach((tab, i) => {
      tab.addEventListener("pointerenter", () => {
        window.clearTimeout(timer);
        timer = window.setTimeout(() => select(i), 90);
      });
      tab.addEventListener("pointerleave", () => window.clearTimeout(timer));
    });
  }
}

/**
 * The aftermovie: poster first, the stream near the window, muted loop
 * while in view. Where the poster stays on purpose (reduced motion, data
 * saving, a slow connection) nothing loads; a blocked autoplay keeps the
 * poster. There is no play or pause button (the team asked for the film
 * without one): it is silent, plays only while it is on screen, and a
 * click on it opens the channel on YouTube.
 */
function initFilm(): void {
  const frame = document.querySelector<HTMLElement>("[data-film]");
  const video = frame?.querySelector<HTMLVideoElement>("[data-film-video]");
  if (!frame || !video) return;

  const conn = (
    navigator as { connection?: { saveData?: boolean; effectiveType?: string } }
  ).connection;
  const lean =
    reduceMotion() ||
    !!conn?.saveData ||
    /^(slow-2g|2g|3g)$/.test(conn?.effectiveType ?? "") ||
    window.matchMedia("(prefers-reduced-data: reduce)").matches;
  if (lean || !("IntersectionObserver" in window)) return;

  let loading: Promise<void> | undefined;
  let inView = false;

  const play = () => {
    if (!inView || document.hidden) return;
    // A blocked autoplay keeps the poster.
    video.play().catch(() => {});
  };
  const pause = () => video.pause();

  /** Attaches the stream once; resolves when it can play. */
  function load(): Promise<void> {
    loading ??= (async () => {
      const desktop = window.innerWidth >= 810;
      const master = desktop
        ? "/media/hero-hls/hero.m3u8"
        : "/media/hero-hls/hero-mobile.m3u8";
      const { default: Hls } = await import("hls.js/light");
      if (Hls.isSupported()) {
        const hls = new Hls({ capLevelToPlayerSize: true, startLevel: -1 });
        await new Promise<void>((resolve) => {
          hls.on(Hls.Events.MANIFEST_PARSED, () => resolve());
          hls.loadSource(master);
          hls.attachMedia(video!);
        });
      } else if (video!.canPlayType("application/vnd.apple.mpegurl")) {
        video!.src = master;
      } else {
        video!.src = "/media/hero-480.mp4";
      }
    })();
    return loading;
  }

  new IntersectionObserver(
    ([entry]) => {
      if (entry!.isIntersecting) void load().then(play);
    },
    { rootMargin: "600px 0px" },
  ).observe(frame);
  new IntersectionObserver(([entry]) => {
    inView = entry!.isIntersecting;
    if (inView) play();
    else pause();
  }).observe(frame);
  document.addEventListener("visibilitychange", () =>
    document.hidden ? pause() : play(),
  );
}

/**
 * The countdown to the end of the discount phase on sale (SalePhases):
 * shown once the script runs, ticking once a second only while it is in
 * view and the tab is visible, and gone once the end has passed. The
 * ticking digits are hidden from screen readers; the day the phase ends
 * is in the text beside them.
 */
function initPhaseClock(): void {
  const clock = document.querySelector<HTMLElement>("[data-sp-clock]");
  const out = clock?.querySelector<HTMLElement>("[data-sp-time]");
  const end = Date.parse(clock?.dataset.spClock ?? "");
  if (!clock || !out || Number.isNaN(end)) return;

  const two = (n: number) => String(n).padStart(2, "0");
  let timer = 0;
  const tick = (): boolean => {
    const left = Math.floor((end - Date.now()) / 1000);
    if (left <= 0) {
      clock.hidden = true;
      return false;
    }
    const d = Math.floor(left / 86400);
    const h = Math.floor((left % 86400) / 3600);
    const m = Math.floor((left % 3600) / 60);
    out.textContent = `${d}d ${two(h)}h ${two(m)}m ${two(left % 60)}s`;
    clock.hidden = false;
    return true;
  };
  const stop = () => {
    window.clearInterval(timer);
    timer = 0;
  };
  const start = () => {
    if (timer || document.hidden || !tick()) return;
    timer = window.setInterval(() => {
      if (!tick()) stop();
    }, 1000);
  };

  if (!tick()) return;
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(([entry]) =>
      entry!.isIntersecting ? start() : stop(),
    ).observe(clock);
  } else {
    start();
  }
  document.addEventListener("visibilitychange", () =>
    document.hidden ? stop() : start(),
  );
}

/**
 * Last edition's film behind the hero (HomeHero.astro): decoration only.
 * It starts once the page has loaded (never competing with the first
 * paint), plays muted while the hero is in view and the tab visible, and
 * never with reduced motion, data saving or a slow connection, where the
 * dimmed poster stays.
 */
function initHeroFilm(): void {
  const video = document.querySelector<HTMLVideoElement>("[data-hero-film]");
  if (!video || !("IntersectionObserver" in window)) return;
  const conn = (
    navigator as { connection?: { saveData?: boolean; effectiveType?: string } }
  ).connection;
  if (
    reduceMotion() ||
    conn?.saveData ||
    /^(slow-2g|2g|3g)$/.test(conn?.effectiveType ?? "") ||
    window.matchMedia("(prefers-reduced-data: reduce)").matches
  )
    return;

  let inView = false;
  let loaded = false;
  const play = () => {
    if (loaded && inView && !document.hidden) video.play().catch(() => {});
  };
  const start = () => {
    loaded = true;
    video.preload = "auto";
    play();
  };
  new IntersectionObserver(([entry]) => {
    inView = entry!.isIntersecting;
    if (inView) play();
    else video.pause();
  }).observe(video);
  document.addEventListener("visibilitychange", () =>
    document.hidden ? video.pause() : play(),
  );
  if (document.readyState === "complete") start();
  else window.addEventListener("load", start, { once: true });
}

export function initHomePage(): void {
  void startHomeStage();
  initMarquee();
  initLogoThumbs();
  initWhyTabs();
  initFilm();
  initPalace();
  initPhaseClock();
  initHeroFilm();
}
