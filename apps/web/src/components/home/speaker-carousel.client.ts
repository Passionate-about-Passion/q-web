/**
 * The speaker ring on the home page (SpeakerGrid.astro, DESIGN.md HOME-1).
 *
 * The row holds the cards five times over (`data-copies`); the view is
 * kept inside the middle copy, so it never ends. Whenever the view rests,
 * and also while it is still moving once it has run more than a copy away
 * from the middle (several fast swipes in a row never let it rest), it
 * jumps by whole copies, which show the very same cards: the ring has no
 * edge to run into, in either direction.
 *
 * With no hand on it, the ring runs slowly and evenly to the left, at the
 * partner strip's pace (PartnerLogos.astro), like a marquee. It holds while
 * the pointer is over it, while focus is inside, while it is off screen or
 * the tab is hidden, and from the moment somebody touches, drags, scrolls
 * or steps it; a few seconds after the last hand it runs on. Reduced motion
 * never runs it.
 *
 * Scrolling itself is native: touch, trackpad and keyboard keep their own
 * momentum. While the ring may run, the row has no CSS snapping (it would
 * pull the slow run back to a card every frame), so the script settles it
 * on a card once a hand lets go; with reduced motion the browser snaps. A
 * mouse drags the row (free while held, settled on release). The arrows
 * step one card.
 *
 * Depth: the page width is where cards stand sharp. A card that leaves it
 * turns away from the middle, shrinks a little, dims and blurs, more the
 * further out it is. Only transform, opacity and filter are written, once
 * per frame and only while the row moves; positions come from offsetLeft,
 * which transforms do not change, so no frame reads layout it has just
 * dirtied.
 */

const RUN_PX_S = 28;
const RESUME_MS = 3200;
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
  // box, so settling is never pulled off by a card turned away.
  const faces = cards.map(
    (c) => c.querySelector<HTMLElement>("[data-speaker-face]") ?? c,
  );
  const copies = Number(root.dataset.copies) || 3;
  const middle = Math.floor(copies / 2);
  const perCopy = cards.filter((c) => c.dataset.copy === "0").length;
  if (!perCopy) return;

  // The arrows may sit in the section head, outside the rail itself.
  const scope = root.closest("section") ?? root;
  const prev = scope.querySelector<HTMLButtonElement>("[data-speaker-prev]");
  const next = scope.querySelector<HTMLButtonElement>("[data-speaker-next]");
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  const runs = root.dataset.autoplay !== "off";

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

  /** Where the view stands when card `index` is the first sharp one. */
  const snapLeft = (index: number): number => lefts[0]! - peek + index * step;
  /** The card at the left edge of the sharp zone, as a fraction. */
  const position = (): number =>
    (viewport!.scrollLeft - (lefts[0]! - peek)) / step;

  // The run keeps its own exact position (a browser may round scrollLeft).
  let runX = 0;

  /** Moves the view by whole copies, back into the middle one, at the
   *  same cards. `always`: at rest, into the middle copy itself; while
   *  moving, only once the view is more than a copy away from it. */
  function recenter(always: boolean): void {
    const from = middle * perCopy;
    const off = (position() - from) / perCopy;
    const limit = always ? 0.5 : 1.25;
    if (off >= -limit && off < limit) return;
    const shift = Math.round(off) * copyWidth;
    viewport!.scrollLeft -= shift;
    runX -= shift;
  }

  // ---- depth, one write per visible card per frame
  let frame = 0;
  let shaded = new Set<HTMLElement>();

  function clearFace(card: HTMLElement): void {
    card.style.transform = "";
    card.style.opacity = "";
    card.style.filter = "";
  }

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
        clearFace(card);
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
    for (const card of shaded) if (!now.has(card)) clearFace(card);
    shaded = now;
  }

  function requestShade(): void {
    if (!frame) frame = requestAnimationFrame(shade);
  }

  // ---- settling on a card
  function scrollToCard(index: number): void {
    viewport!.scrollTo({
      left: snapLeft(index),
      behavior: reduced.matches ? "auto" : "smooth",
    });
  }

  function go(dir: 1 | -1): void {
    recenter(true);
    scrollToCard(Math.round(position()) + dir);
  }

  // ---- hands on the ring
  // A mouse drag in progress (touch and pen scroll natively).
  let dragX = 0;
  let dragLeft = 0;
  let dragging = false;
  let moved = false;
  let hovered = false;
  let focused = false;
  let onScreen = false;
  // A hand is on the ring (or was, a moment ago).
  let held = false;
  let resumeTimer = 0;

  const mayRun = (): boolean =>
    runs &&
    !reduced.matches &&
    onScreen &&
    !document.hidden &&
    !hovered &&
    !focused &&
    !held &&
    !dragging;

  /** Somebody uses the ring: it holds until they have let go a while. */
  function hold(): void {
    held = true;
    window.clearTimeout(resumeTimer);
    track!.style.translate = "";
  }

  /** The hand has let go: run on after a pause. */
  function release(): void {
    window.clearTimeout(resumeTimer);
    resumeTimer = window.setTimeout(() => {
      held = false;
      wake();
    }, RESUME_MS);
  }

  // ---- the slow run
  let runFrame = 0;
  let lastT = 0;

  function tick(t: number): void {
    runFrame = 0;
    if (!mayRun()) {
      lastT = 0;
      track!.style.translate = "";
      return;
    }
    // A long gap (a frame dropped, the tab back) never jumps the row.
    const dt = lastT ? Math.min(64, t - lastT) : 0;
    lastT = t;
    runX += (RUN_PX_S * dt) / 1000;
    // Browsers keep scroll positions in whole (device) pixels, which would
    // make a run this slow tick; the part of a pixel left over moves the
    // track itself, so the run is perfectly even.
    const whole = Math.floor(runX);
    viewport!.scrollLeft = whole;
    track!.style.translate = `${(whole - runX).toFixed(3)}px 0`;
    recenter(false);
    runFrame = requestAnimationFrame(tick);
  }

  function wake(): void {
    if (runFrame || !mayRun()) return;
    runX = viewport!.scrollLeft;
    lastT = 0;
    runFrame = requestAnimationFrame(tick);
  }

  /** Free rows (no CSS snapping) while the ring may run. */
  function setFree(): void {
    viewport!.classList.toggle("is-free", runs && !reduced.matches);
  }

  prev?.addEventListener("click", () => {
    hold();
    go(-1);
  });
  next?.addEventListener("click", () => {
    hold();
    go(1);
  });

  root.addEventListener("pointerenter", (event) => {
    if (event.pointerType !== "mouse") return;
    hovered = true;
  });
  root.addEventListener("pointerleave", (event) => {
    if (event.pointerType !== "mouse") return;
    hovered = false;
    wake();
  });
  root.addEventListener("focusin", (event) => {
    // The controls stay usable for a keyboard; only the row itself holds.
    if (event.target === viewport) focused = true;
  });
  root.addEventListener("focusout", () => {
    focused = false;
    wake();
  });

  // A finger on the row stops any momentum, so the view can be put back
  // into the middle copy right there, before the next swipe.
  let touching = false;
  viewport.addEventListener(
    "touchstart",
    () => {
      touching = true;
      hold();
      recenter(true);
    },
    { passive: true },
  );
  const endTouch = (): void => {
    touching = false;
    release();
    // A swipe that stops dead may end with no scrollend at all: look again
    // once it has been quiet for a moment.
    quiet();
  };
  viewport.addEventListener("touchend", endTouch, { passive: true });
  viewport.addEventListener("touchcancel", endTouch, { passive: true });
  viewport.addEventListener(
    "wheel",
    (event) => {
      if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) hold();
    },
    { passive: true },
  );
  viewport.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") hold();
  });

  // ---- mouse drag (touch and pen scroll natively)
  viewport.addEventListener("pointerdown", (event) => {
    if (event.pointerType !== "mouse" || event.button !== 0) return;
    dragging = true;
    moved = false;
    dragX = event.clientX;
    dragLeft = viewport.scrollLeft;
    hold();
  });
  viewport.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    const dx = event.clientX - dragX;
    if (!moved && Math.abs(dx) < 4) return;
    if (!moved) {
      moved = true;
      viewport.classList.add("is-dragging");
      viewport.setPointerCapture(event.pointerId);
    }
    viewport.scrollLeft = dragLeft - dx;
    // A long drag may cross a copy: keep the drag's own origin with it.
    const before = viewport.scrollLeft;
    recenter(false);
    dragLeft += viewport.scrollLeft - before;
  });
  const endDrag = (event: PointerEvent): void => {
    if (!dragging) return;
    dragging = false;
    if (!moved) {
      release();
      return;
    }
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
  // Rest is the scrollend event, and also a short quiet period after the
  // last scroll (for browsers without scrollend, and for a swipe that stops
  // dead, which may never send one). Never while a finger is down.
  let restTimer = 0;
  function quiet(): void {
    window.clearTimeout(restTimer);
    restTimer = window.setTimeout(onRest, 180);
  }
  const onRest = (): void => {
    if (dragging || runFrame || touching) return;
    recenter(true);
    requestShade();
    if (!held) return;
    // A hand moved the free row: settle it on the nearest card first.
    const at = position();
    if (
      viewport.classList.contains("is-free") &&
      Math.abs(at - Math.round(at)) > 0.01
    ) {
      scrollToCard(Math.round(at));
      return;
    }
    release();
  };
  viewport.addEventListener(
    "scroll",
    () => {
      requestShade();
      // Fast swipes in a row never come to rest: never let the view reach
      // the outer copies on the way.
      if (!runFrame && !dragging) recenter(false);
      if (!runFrame) quiet();
    },
    { passive: true },
  );
  viewport.addEventListener("scrollend", onRest);

  // ---- start
  measure();
  setFree();
  // Open on the first real card (the start of the middle copy).
  viewport.scrollLeft = snapLeft(middle * perCopy);
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
      runX = viewport.scrollLeft;
      shade();
    });
  }).observe(viewport);

  document.addEventListener("visibilitychange", wake);
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
      wake();
    }).observe(root);
  }
  reduced.addEventListener("change", () => {
    setFree();
    if (reduced.matches) {
      faces.forEach(clearFace);
    } else {
      shade();
      wake();
    }
  });
}

document
  .querySelectorAll<HTMLElement>("[data-speaker-carousel]:not([data-ready])")
  .forEach(initCarousel);
