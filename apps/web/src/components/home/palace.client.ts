/**
 * The palace stage (PalaceStage.astro, DESIGN.md HOME-1). The drawing,
 * the scroll's window lights and the count are CSS; this adds two things
 * that need to know where things are.
 *
 * The programme: the hold is split into one stretch per item, and the item
 * whose stretch is on screen is the one shown (data-active), so it always
 * matches the scroll, forwards, backwards and after a resize. Under it the
 * bars report the same: items passed "done", the one shown "current", the
 * rest "next". A click on a bar (or Enter / Space on it) shows its item at
 * once and scrolls to the middle of its stretch; while that scroll runs,
 * the items it passes do not flash by, and a wheel, a touch or a key hands
 * control straight back to the visitor. Only with the stage (scroll-driven
 * animations and motion welcome); otherwise every item is listed.
 *
 * Windows around the pointer: on a fine pointer, windows near it light
 * softly (stronger the nearer they are) and fade back once it moves on or
 * leaves. That light is a layer of its own over the scroll's lights, so a
 * window the scroll has lit stays lit, and nothing of the scroll's
 * progress is touched. Pointer moves are folded into one update a frame,
 * and only windows whose light changes are written.
 */

const reduced = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const staged = () =>
  !reduced() &&
  typeof CSS !== "undefined" &&
  CSS.supports("animation-timeline: view()");

function initProgram(stage: HTMLElement): void {
  const pin = stage.querySelector<HTMLElement>(".ps-pin");
  const steps = [...stage.querySelectorAll<HTMLElement>("[data-palace-step]")];
  const bars = [
    ...stage.querySelectorAll<HTMLButtonElement>("[data-palace-bar]"),
  ];
  if (!pin || steps.length === 0) return;
  const n = steps.length;
  let current = -1;
  /** A jump from a bar: its item, and when the jump gives up waiting. */
  let target = -1;
  let until = 0;

  const show = (index: number) => {
    if (index === current) return;
    current = index;
    steps.forEach((step, i) =>
      step.toggleAttribute("data-active", i === index),
    );
    bars.forEach((bar, i) => {
      bar.dataset.state = i < index ? "done" : i === index ? "current" : "next";
      if (i === index) bar.setAttribute("aria-current", "step");
      else bar.removeAttribute("aria-current");
    });
  };

  const hold = () => stage.offsetHeight - pin.offsetHeight;
  const fromScroll = (): number => {
    const h = hold();
    if (h <= 0) return 0;
    const progress = -stage.getBoundingClientRect().top / h;
    return Math.min(n - 1, Math.max(0, Math.floor(progress * n)));
  };

  let frame = 0;
  const sync = () => {
    frame = 0;
    if (!staged()) return;
    const at = fromScroll();
    if (target >= 0) {
      // The jump is done once the scroll has reached its item (or gave up).
      if (at !== target && performance.now() < until) return;
      target = -1;
    }
    show(at);
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(sync);
  };
  // The visitor takes over: a wheel, a touch or a key ends a jump at once.
  const release = () => {
    if (target < 0) return;
    target = -1;
    schedule();
  };

  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", schedule);
  window.addEventListener("wheel", release, { passive: true });
  window.addEventListener("touchstart", release, { passive: true });
  window.addEventListener("keydown", release);

  bars.forEach((bar, i) => {
    bar.addEventListener("click", () => {
      const h = hold();
      if (h <= 0) return;
      const top = stage.getBoundingClientRect().top + window.scrollY;
      target = i;
      until = performance.now() + 1400;
      show(i);
      window.scrollTo({
        top: top + (h * (i + 0.5)) / n,
        behavior: reduced() ? "auto" : "smooth",
      });
    });
  });

  sync();
}

function initWindowLight(stage: HTMLElement): void {
  if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
  const art = stage.querySelector<HTMLElement>("[data-palace-art]");
  const svg = art?.querySelector<SVGSVGElement>(".ps-svg");
  const near = [...stage.querySelectorAll<SVGPathElement>(".ps-near path")];
  const halo = [
    ...stage.querySelectorAll<SVGPathElement>(".ps-glow-near path"),
  ];
  if (!art || !svg || near.length === 0) return;
  const centers = near.map((path) => {
    const [x, y] = (path.dataset.c ?? "0,0").split(",").map(Number);
    return [x ?? 0, y ?? 0] as const;
  });
  const level = new Float32Array(near.length);
  /** How far the light reaches, in drawing units (the canvas is 1600
   *  wide): a handful of windows around the pointer, the nearest at full
   *  light. */
  const REACH = 118;
  let x = 0;
  let y = 0;
  let inside = false;
  let frame = 0;

  const update = () => {
    frame = 0;
    // Static palace (reduced motion, no scroll-driven animations): every
    // window is lit already.
    const live = inside && staged();
    const rect = svg.getBoundingClientRect();
    const scale = rect.width > 0 ? 1600 / rect.width : 0;
    const ux = (x - rect.left) * scale;
    const uy = (y - rect.top) * scale;
    for (let i = 0; i < near.length; i++) {
      let value = 0;
      if (live) {
        const [cx, cy] = centers[i]!;
        const d = Math.hypot(cx - ux, (cy - uy) * 1.2) / REACH;
        if (d < 1) {
          const v = Math.min(1, (1 - d) * 1.35);
          value = v * v * (3 - 2 * v);
        }
      }
      const was = level[i]!;
      if (Math.abs(value - was) < 0.04 && (value > 0 || was === 0)) continue;
      level[i] = value;
      const up = value > was;
      for (const el of [near[i], halo[i]]) {
        if (!el) continue;
        el.classList.toggle("is-up", up);
        el.style.opacity = value > 0 ? value.toFixed(2) : "";
      }
    }
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(update);
  };

  art.addEventListener("pointermove", (event) => {
    if (event.pointerType !== "mouse") return;
    x = event.clientX;
    y = event.clientY;
    inside = true;
    schedule();
  });
  art.addEventListener("pointerleave", () => {
    inside = false;
    schedule();
  });
  // While the pointer rests on the palace and the page moves under it,
  // the light follows the windows that are now under it.
  window.addEventListener(
    "scroll",
    () => {
      if (inside) schedule();
    },
    { passive: true },
  );
}

export function initPalace(): void {
  const stage = document.querySelector<HTMLElement>("[data-palace]");
  if (!stage) return;
  initProgram(stage);
  initWindowLight(stage);
}
