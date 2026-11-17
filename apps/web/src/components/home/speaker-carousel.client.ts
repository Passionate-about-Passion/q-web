/**
 * The speaker ring on the home page (SpeakerGrid.astro, DESIGN.md HOME-1).
 *
 * The row holds the cards three times over; the view is kept inside the
 * middle copy (after a scroll comes to rest, a position in an outer copy
 * jumps by one copy's width, which shows the very same cards), so it never
 * ends. Scrolling itself is native: touch, trackpad and keyboard keep
 * their own momentum and snapping. A mouse drags the row (free while
 * held, snapped on release). The arrows step one card. With no hand on
 * it, the ring advances one card every few seconds; it stops for good
 * once somebody uses it, and rests while it is off screen, while the tab
 * is hidden, while the pointer is over it or focus is inside, and with
 * reduced motion.
 *
 * Depth: the page width is where cards stand sharp. A card that leaves it
 * turns away from the middle, shrinks a little, dims and blurs, more the
 * further out it is. Only transform, opacity and filter are written, once
 * per frame and only while the row moves; positions come from offsetLeft,
 * which transforms do not change, so no frame reads layout it has just
 * dirtied.
 */

const STEP_MS = 4200;
const TURN_DEG = 16;
const SHRINK = 0.06;
const DIM = 0.5;
const BLUR_PX = 2;

function initCarousel(root: HTMLElement): void {
  const viewport = root.querySelector<HTMLElement>("[data-speaker-viewport]");
  const track = root.querySelector<HTMLElement>("[data-speaker-track]");
  if (!viewport || !track) return;
  const cards = [...track.querySelectorAll<HTMLElement>("[data-speaker-card]")];
  // The depth is drawn on the card inside each slot; the slot keeps its
  // box, so snapping is never pulled off by a card turned away.
  const faces = cards.map(
    (c) => c.querySelector<HTMLElement>("[data-speaker-face]") ?? c,
  );
  const perCopy = cards.filter((c) => c.dataset.copy === "1").length;
  if (!perCopy) return;

  // The arrows may sit in the section head, outside the rail itself.
  const scope = root.closest("section") ?? root;
  const prev = scope.querySelector<HTMLButtonElement>("[data-speaker-prev]");
  const next = scope.querySelector<HTMLButtonElement>("[data-speaker-next]");
  const pause = root.querySelector<HTMLButtonElement>("[data-speaker-pause]");
  const pauseLabel = root.querySelector<HTMLElement>(
    "[data-speaker-pause-label]",
  );
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");

  // Layout, measured once and again on resize.
  let lefts: number[] = [];
  let width = 0;
  let step = 0;
  let copyWidth = 0;
  let peek = 0;

  function measure(): void {
    lefts = cards.map((c) => c.offsetLeft);
    width = cards[0]!.offsetWidth;
    step = cards.length > 1 ? lefts[1]! - lefts[0]! : width;
    copyWidth = step * perCopy;
    peek = parseFloat(getComputedStyle(track!).paddingLeft) || 0;
  }

  /** Puts the view back into the middle copy, at the same cards. */
  function recenter(): void {
    const x = viewport!.scrollLeft;
    // At rest the first sharp card is always one of the real ones, so the
    // copies only ever show at the edges and while the row moves.
    if (x < copyWidth - step / 2) viewport!.scrollLeft = x + copyWidth;
    else if (x >= copyWidth * 2 - step / 2) {
      viewport!.scrollLeft = x - copyWidth;
    }
  }

  // ---- depth, one write per visible card per frame
  let frame = 0;
  let shaded = new Set<HTMLElement>();

  function shade(): void {
    frame = 0;
    if (reduced.matches) return;
    const x = viewport!.scrollLeft;
    const view = viewport!.clientWidth;
    const from = peek;
    const to = view - peek;
    const now = new Set<HTMLElement>();
    cards.forEach((_, i) => {
      const card = faces[i]!;
      const left = lefts[i]! - x;
      const right = left + width;
      if (right < -width || left > view + width) return;
      // How far the card has left the sharp zone, in card widths.
      const out =
        left < from - 1
          ? Math.min(1, (from - left) / width)
          : right > to + 1
            ? Math.min(1, (right - to) / width)
            : 0;
      now.add(card);
      if (out === 0) {
        card.style.transform = "";
        card.style.opacity = "";
        card.style.filter = "";
        return;
      }
      const side = left < from ? 1 : -1;
      card.style.transformOrigin = side > 0 ? "100% 50%" : "0% 50%";
      card.style.transform = `perspective(1200px) rotateY(${(
        side *
        TURN_DEG *
        out
      ).toFixed(2)}deg) scale(${(1 - SHRINK * out).toFixed(3)})`;
      card.style.opacity = (1 - DIM * out).toFixed(3);
      // Whole pixels only, so the blur changes a few times per card, not
      // for every pixel the row moves.
      const blur = Math.round(BLUR_PX * out);
      card.style.filter = blur > 0 ? `blur(${blur}px)` : "";
    });
    // Cards that left the window drop their styles.
    for (const card of shaded) {
      if (now.has(card)) continue;
      card.style.transform = "";
      card.style.opacity = "";
      card.style.filter = "";
    }
    shaded = now;
  }

  function requestShade(): void {
    if (!frame) frame = requestAnimationFrame(shade);
  }

  // ---- stepping
  /** Where the view stands when card `index` is the first sharp one. */
  const snapLeft = (index: number): number => lefts[0]! - peek + index * step;
  /** The card at the left edge of the sharp zone, as a fraction. */
  const position = (): number =>
    (viewport!.scrollLeft - (lefts[0]! - peek)) / step;

  function scrollToCard(index: number): void {
    viewport!.scrollTo({
      left: snapLeft(index),
      behavior: reduced.matches ? "auto" : "smooth",
    });
  }

  function go(dir: 1 | -1): void {
    recenter();
    scrollToCard(Math.round(position()) + dir);
  }

  // ---- auto advance
  // The rail may advance by itself only where the page asks for it.
  const autoplay = root.dataset.autoplay !== "off";
  let stopped = reduced.matches || !autoplay;
  let hovered = false;
  let focused = false;
  let onScreen = false;
  let timer = 0;

  function schedule(): void {
    window.clearTimeout(timer);
    if (stopped || hovered || focused || !onScreen || document.hidden) return;
    timer = window.setTimeout(() => {
      go(1);
      schedule();
    }, STEP_MS);
  }

  function stop(): void {
    stopped = true;
    window.clearTimeout(timer);
    pause?.setAttribute("aria-pressed", "true");
    if (pauseLabel) pauseLabel.textContent = pauseLabel.dataset.play ?? "";
  }

  pause?.addEventListener("click", () => {
    if (stopped) {
      stopped = false;
      pause.setAttribute("aria-pressed", "false");
      if (pauseLabel) pauseLabel.textContent = pauseLabel.dataset.pause ?? "";
      go(1);
      schedule();
    } else {
      stop();
    }
  });
  prev?.addEventListener("click", () => {
    stop();
    go(-1);
  });
  next?.addEventListener("click", () => {
    stop();
    go(1);
  });

  root.addEventListener("pointerenter", () => {
    hovered = true;
    schedule();
  });
  root.addEventListener("pointerleave", () => {
    hovered = false;
    schedule();
  });
  root.addEventListener("focusin", (event) => {
    // The controls stay usable for a keyboard; only the row itself holds.
    if (event.target === viewport) focused = true;
    schedule();
  });
  root.addEventListener("focusout", () => {
    focused = false;
    schedule();
  });
  // A finger or a wheel on the row is a hand on it.
  viewport.addEventListener("touchstart", stop, { passive: true });
  viewport.addEventListener(
    "wheel",
    (event) => {
      if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) stop();
    },
    { passive: true },
  );
  viewport.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") stop();
  });

  // ---- mouse drag (touch and pen scroll natively)
  let dragX = 0;
  let dragLeft = 0;
  let dragging = false;
  let moved = false;

  viewport.addEventListener("pointerdown", (event) => {
    if (event.pointerType !== "mouse" || event.button !== 0) return;
    dragging = true;
    moved = false;
    dragX = event.clientX;
    dragLeft = viewport.scrollLeft;
  });
  viewport.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    const dx = event.clientX - dragX;
    if (!moved && Math.abs(dx) < 4) return;
    if (!moved) {
      moved = true;
      stop();
      viewport.classList.add("is-dragging");
      viewport.setPointerCapture(event.pointerId);
    }
    viewport.scrollLeft = dragLeft - dx;
  });
  const endDrag = (event: PointerEvent): void => {
    if (!dragging) return;
    dragging = false;
    if (!moved) return;
    if (viewport.hasPointerCapture(event.pointerId)) {
      viewport.releasePointerCapture(event.pointerId);
    }
    // Settle on a card in the direction of the drag: a pull of a sixth of
    // a card is enough to move on, so a short flick is never lost.
    const x = viewport.scrollLeft;
    const at = position();
    const index =
      x > dragLeft
        ? Math.floor(at) + (at - Math.floor(at) > 0.16 ? 1 : 0)
        : Math.ceil(at) - (Math.ceil(at) - at > 0.16 ? 1 : 0);
    viewport.classList.remove("is-dragging");
    viewport.scrollLeft = x;
    scrollToCard(index);
  };
  viewport.addEventListener("pointerup", endDrag);
  viewport.addEventListener("pointercancel", endDrag);
  // A drag must not start the browser's own image drag.
  viewport.addEventListener("dragstart", (event) => event.preventDefault());

  // ---- scroll bookkeeping
  let restTimer = 0;
  // Browsers without the scrollend event get a short quiet period instead.
  const hasScrollEnd = "onscrollend" in window;
  const onRest = (): void => {
    if (dragging) return;
    recenter();
    requestShade();
  };
  viewport.addEventListener(
    "scroll",
    () => {
      requestShade();
      if (!hasScrollEnd) {
        window.clearTimeout(restTimer);
        restTimer = window.setTimeout(onRest, 140);
      }
    },
    { passive: true },
  );
  viewport.addEventListener("scrollend", onRest);

  // ---- start
  measure();
  // Open on the first real card (the start of the middle copy).
  viewport.scrollLeft = snapLeft(perCopy);
  shade();
  root.setAttribute("data-ready", "");

  let resizeFrame = 0;
  new ResizeObserver(() => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => {
      // Keep the same first card in place across a resize.
      const first = Math.round(position());
      measure();
      viewport.scrollLeft = snapLeft(first);
      shade();
    });
  }).observe(viewport);

  document.addEventListener("visibilitychange", schedule);
  // Before the row comes into view, load and decode every portrait (the
  // copies at the edges too), so no card stalls a frame with its first
  // decode when it slides in.
  const warm = (): void => {
    for (const img of track.querySelectorAll<HTMLImageElement>("img")) {
      img.loading = "eager";
      img.decode?.().catch(() => {});
    }
  };
  if ("IntersectionObserver" in window) {
    const near = new IntersectionObserver(
      ([entry]) => {
        if (!entry!.isIntersecting) return;
        near.disconnect();
        warm();
      },
      { rootMargin: "800px 0px" },
    );
    near.observe(root);
    new IntersectionObserver(([entry]) => {
      onScreen = entry!.isIntersecting;
      schedule();
    }).observe(root);
  }
  reduced.addEventListener("change", () => {
    if (reduced.matches) {
      stop();
      for (const card of faces) {
        card.style.transform = "";
        card.style.opacity = "";
        card.style.filter = "";
      }
    } else {
      shade();
    }
  });
}

document
  .querySelectorAll<HTMLElement>("[data-speaker-carousel]:not([data-ready])")
  .forEach(initCarousel);
