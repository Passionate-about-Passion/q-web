/**
 * Runs the home hero countdown (HeroCountdown.astro, DESIGN.md HOME-1).
 *
 * The time left is always recomputed from the real target instant and the
 * current clock, never counted down by a timer, so a sleeping tab, a
 * throttled background timer or a changed system clock cannot make it
 * drift: the first tick after the page is visible again is correct.
 * Ticks are aligned to the wall clock second and stop while the tab is
 * hidden or the display is off screen.
 *
 * The display appears with the hero's entrance. Afterwards a figure that
 * changes rolls in from below (a short transform and opacity animation,
 * skipped for reduced motion); the figures that stay the same do not move.
 */
import {
  COUNTDOWN_UNITS,
  remainingUntil,
  spokenRemaining,
  unitText,
  type CountdownUnit,
} from "../../lib/countdown";

/** How long a changing figure takes to roll in. */
const ROLL_MS = 360;

function initCountdown(root: HTMLElement): void {
  const target = Number(root.dataset.target);
  if (!Number.isFinite(target)) return;

  const row = root.querySelector<HTMLElement>("[data-countdown-row]");
  const spoken = root.querySelector<HTMLElement>("[data-countdown-spoken]");
  const live = root.querySelector<HTMLElement>("[data-countdown-live]");
  const template = root.dataset.spoken ?? "";
  const units = new Map<CountdownUnit, { box: HTMLElement; text: string }>();
  for (const unit of COUNTDOWN_UNITS) {
    const box = root.querySelector<HTMLElement>(
      `[data-unit="${unit}"] [data-digits]`,
    );
    if (!box) return;
    units.set(unit, { box, text: "" });
  }
  if (!row) return;

  let timer = 0;
  let onScreen = true;
  let spokenMinute = -1;
  let finished = false;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  // The first paint sets the figures without rolling them.
  let painted = false;

  /** Shows `text` in a unit, one figure per digit; changed ones roll in. */
  function show(box: HTMLElement, text: string): void {
    let figures = [...box.querySelectorAll<HTMLElement>("[data-digit]")];
    // The day count loses (or, after a clock change, gains) a digit.
    while (figures.length > text.length) figures.shift()!.remove();
    while (figures.length < text.length && figures[0]) {
      const copy = figures[0].cloneNode(true) as HTMLElement;
      box.prepend(copy);
      figures = [copy, ...figures];
    }
    figures.forEach((figure, i) => {
      const digit = text[i]!;
      if (figure.dataset.value === digit) return;
      figure.dataset.value = digit;
      figure.textContent = digit;
      if (painted && !reduced.matches && "animate" in figure) {
        figure.animate(
          [
            { transform: "translateY(60%)", opacity: 0 },
            { transform: "none", opacity: 1 },
          ],
          { duration: ROLL_MS, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
        );
      }
    });
  }

  function paint(): void {
    const left = remainingUntil(target, Date.now());

    if (left.done) {
      finished = true;
      row!.hidden = true;
      if (live) live.hidden = false;
      if (spoken) spoken.textContent = "";
      root.setAttribute("data-state", "live");
      return;
    }

    for (const unit of COUNTDOWN_UNITS) {
      const state = units.get(unit)!;
      const text = unitText(unit, left);
      if (text === state.text) continue;
      show(state.box, text);
      state.text = text;
    }
    painted = true;

    // Screen readers get one sentence, refreshed once a minute, not a
    // stream of changing figures (no live region: read on demand).
    const minute = Math.floor((target - Date.now()) / 60_000);
    if (spoken && minute !== spokenMinute) {
      spokenMinute = minute;
      spoken.textContent = spokenRemaining(template, left);
    }
    root.setAttribute("data-state", "running");
  }

  function schedule(): void {
    window.clearTimeout(timer);
    if (finished || document.hidden || !onScreen) return;
    // Wake just after the next full second of the wall clock.
    timer = window.setTimeout(tick, 1000 - (Date.now() % 1000) + 12);
  }

  function tick(): void {
    paint();
    schedule();
  }

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) tick();
    else window.clearTimeout(timer);
  });
  // A restored page (back/forward cache) is stale by however long it slept.
  window.addEventListener("pageshow", tick);

  if ("IntersectionObserver" in window) {
    new IntersectionObserver((entries) => {
      onScreen = entries.some((entry) => entry.isIntersecting);
      if (onScreen) tick();
      else window.clearTimeout(timer);
    }).observe(root);
  }

  tick();
}

document
  .querySelectorAll<HTMLElement>("[data-countdown]:not([data-countdown-ready])")
  .forEach((root) => {
    root.setAttribute("data-countdown-ready", "");
    initCountdown(root);
  });
