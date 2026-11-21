// Q-Hack 2027, the /hackathon page (DESIGN.md HACK-1): page logic.
//
// Everything on the page is HTML first (copy, programme, photos, questions
// and answers come from the CMS at build time); this script adds the
// behavior: typed text, the header menu, the countdown, the programme's
// light line, the "applications open soon" window, the status line and the
// fade into the footer. The heavy pieces (hero particles, laptop, aftermovie,
// film roll) live in their own modules and are loaded so that a failure in
// one never blanks the page; the two that need Three.js (laptop, film roll)
// load by dynamic import after the hero has assembled (ADR-0009).
import { banner, decrypt } from "./ascii";
import { initAsk, type AskTopic } from "./ask";
import type { FilmPhoto } from "./film-roll";
import { initHero } from "./hero-particles";
import type { LaptopSticker, LaptopTexts } from "./laptop";
import { initMovie } from "./movie";
import { rgb } from "./palette";
import { initPartners, type BandPartner } from "./partner-band";
import { QRain } from "./rain";

/** What the page hands to this script (hackathon.astro writes it as JSON). */
export interface QhackData {
  /** Hack start as an ISO date-time, or "" while it is not set. */
  startsAt: string;
  applyOpen: boolean;
  /** The white Q-Hack lockup, for the hero and the laptop display. */
  logo: string;
  partners: BandPartner[];
  photos: FilmPhoto[];
  topics: AskTopic[];
  contactEmail: string;
  laptop: { model: string; stickers: LaptopSticker[]; texts: LaptopTexts };
  /** The status line once the laptop has been taken over. */
  hackedMessage: string;
}

const $ = <T extends Element = HTMLElement>(
  selector: string,
  root: ParentNode = document,
): T | null => root.querySelector<T>(selector);
const $$ = <T extends Element = HTMLElement>(
  selector: string,
  root: ParentNode = document,
): T[] => [...root.querySelectorAll<T>(selector)];
const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));

let reduce = false;
/** The mono face as the page resolved it, for text drawn on a canvas. */
let monoFamily = "monospace";

/* ------------------------------------------------------------------ typing */
// Text is typed as if someone else were at the keyboard. The untyped rest is
// laid out invisibly from the start, so nothing shifts while it runs, and the
// full text is there for assistive tech from the first frame.
function prepareType(el: HTMLElement): void {
  if (el.dataset.typeReady) return;
  el.dataset.typeReady = "1";
  const html = el.innerHTML;
  el.setAttribute("aria-label", (el.textContent ?? "").trim());
  el.innerHTML = `<span class="t-done" aria-hidden="true"></span><span class="t-rest" aria-hidden="true">${html}</span>`;
  if (el.dataset.typeCaret === "keep") el.classList.add("keeps-caret");
}

function typeEl(el: HTMLElement): Promise<void> {
  prepareType(el);
  const done = el.firstElementChild as HTMLElement;
  const rest = el.lastElementChild as HTMLElement;
  if (el.classList.contains("is-typed") || el.classList.contains("is-typing"))
    return Promise.resolve();
  if (reduce) {
    done.innerHTML = rest.innerHTML;
    rest.remove();
    el.classList.add("is-typed");
    return Promise.resolve();
  }
  const speed = Number(el.dataset.typeSpeed || 22);
  // walk the text nodes of the rest and move them over, character by character
  const walker = document.createTreeWalker(rest, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  const twins = new WeakMap<Node, Node>();
  el.classList.add("is-typing");
  return new Promise((resolve) => {
    let ni = 0;
    let target: { src: Text; text: Text } | null = null;
    const step = () => {
      let budget = speed < 10 ? 3 : 1; // fast lines move several characters per tick
      while (budget-- > 0) {
        while (ni < nodes.length && nodes[ni].data.length === 0) ni++;
        if (ni >= nodes.length) {
          rest.remove();
          el.classList.remove("is-typing");
          el.classList.add("is-typed");
          return resolve();
        }
        const node = nodes[ni];
        if (!target || target.src !== node) {
          // recreate the element chain (colored spans, links) inside the typed part
          let parent: Node = done;
          const chain: Node[] = [];
          for (let p = node.parentNode; p && p !== rest; p = p.parentNode)
            chain.unshift(p);
          for (const p of chain) {
            let twin = twins.get(p);
            if (!twin) {
              twin = p.cloneNode(false);
              twins.set(p, twin);
              parent.appendChild(twin);
            }
            parent = twin;
          }
          const text = document.createTextNode("");
          parent.appendChild(text);
          target = { src: node, text };
        }
        target.text.data += node.data[0];
        node.data = node.data.slice(1);
      }
      setTimeout(
        step,
        speed + (Math.random() < 0.08 ? 90 : Math.random() * 18),
      );
    };
    setTimeout(step, Number(el.dataset.typeDelay || 0));
  });
}

function initTyping(root: HTMLElement): void {
  const all = $$("[data-type]", root);
  all.forEach(prepareType);
  const seqChildren = new Set($$("[data-type-seq] [data-type]", root));
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        io.unobserve(e.target);
        const target = e.target as HTMLElement;
        if (target.matches("[data-type-seq]")) {
          void $$("[data-type]", target).reduce(
            (p, el) => p.then(() => typeEl(el)),
            Promise.resolve(),
          );
        } else void typeEl(target);
      }
    },
    { rootMargin: "0px 0px -12% 0px", threshold: 0.2 },
  );
  all
    .filter((el) => !seqChildren.has(el) && !el.closest("[data-program]"))
    .forEach((el) => io.observe(el));
  $$("[data-type-seq]", root).forEach((el) => io.observe(el));
}

/* ------------------------------------------------------------------ header */
// The page's header: the "why q" submenu, and the menu sheet on a phone.
function initHeader(): void {
  const top = $("[data-top]");
  const menu = top && $<HTMLButtonElement>("[data-menu]", top);
  if (!top || !menu) return;
  const label = $("[data-menu-label]", menu);
  const groups = $$("[data-sub]", top);
  const wide = matchMedia("(min-width: 961px)");
  const setMenu = (open: boolean) => {
    top.classList.toggle("is-open", open);
    menu.setAttribute("aria-expanded", String(open));
    if (label) label.textContent = open ? "close" : "menu";
  };
  const setSub = (group: HTMLElement, open: boolean) => {
    group.classList.toggle("is-open", open);
    $("button", group)?.setAttribute("aria-expanded", String(open));
  };
  menu.addEventListener("click", () =>
    setMenu(!top.classList.contains("is-open")),
  );
  for (const group of groups) {
    $("button", group)?.addEventListener("click", () =>
      setSub(group, !group.classList.contains("is-open")),
    );
    // with a mouse the submenu also opens on hover
    group.addEventListener("pointerenter", (ev) => {
      if (ev.pointerType === "mouse" && wide.matches) setSub(group, true);
    });
    group.addEventListener("pointerleave", (ev) => {
      if (ev.pointerType === "mouse" && wide.matches) setSub(group, false);
    });
    group.addEventListener("focusout", (ev) => {
      if (!group.contains(ev.relatedTarget as Node | null) && wide.matches)
        setSub(group, false);
    });
  }
  const closeAll = () => {
    setMenu(false);
    groups.forEach((g) => setSub(g, false));
  };
  addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") closeAll();
  });
  document.addEventListener("click", (ev) => {
    const target = ev.target as Element | null;
    if (!target || !top.contains(target) || target.closest("a")) closeAll();
  });
}

/* ------------------------------------------------------------------ countdown */
function initCountdown(startsAt: string): void {
  const els = $$("[data-countdown]");
  const start = Date.parse(startsAt);
  if (!els.length || Number.isNaN(start)) return;
  const pad = (n: number, l = 2) => String(n).padStart(l, "0");
  const tick = () => {
    let s = Math.floor((start - Date.now()) / 1000);
    const sign = s >= 0 ? "T-" : "T+";
    s = Math.abs(s);
    const text = `${sign}${pad(Math.floor(s / 86400), 3)}d ${pad(Math.floor(s / 3600) % 24)}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
    els.forEach((el) => (el.textContent = text));
  };
  tick();
  setInterval(tick, 1000);
}

/* ------------------------------------------------------------------ program */
// One straight line runs down the programme; every entry has a diamond on it.
// The line is lit as far as the page is scrolled, with a bright point at its
// tip. When the point reaches a diamond it sinks into it, the diamond lights
// up with a small burst and its entry is typed; further down the point comes
// out again. Small signals keep running along the lit part.
function initProgram(): void {
  const list = $("[data-program]");
  if (!list) return;
  $$("[data-type]", list).forEach(prepareType);

  // the line lives in an SVG under the list
  const SVG = "http://www.w3.org/2000/svg";
  const wrap = document.createElement("div");
  wrap.className = "log-wrap";
  list.replaceWith(wrap);
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("class", "log__trace");
  svg.setAttribute("aria-hidden", "true");
  const make = <K extends "line" | "circle">(
    tag: K,
    cls: string,
    r?: number,
  ): SVGElementTagNameMap[K] => {
    const el = document.createElementNS(SVG, tag) as SVGElementTagNameMap[K];
    el.setAttribute("class", cls);
    if (r) el.setAttribute("r", String(r));
    svg.appendChild(el);
    return el;
  };
  const rail = make("line", "trace__rail");
  const bloom = make("line", "trace__bloom");
  const glow = make("line", "trace__glow");
  const lit = make("line", "trace__lit");
  const packets = Array.from({ length: 3 }, () =>
    make("circle", "trace__packet", 1.8),
  );
  const halo = make("circle", "trace__halo", 11);
  const head = make("circle", "trace__head", 3.6);
  wrap.append(svg, list);

  const clock = $("[data-clock]");
  const smooth = (a: number, b: number, v: number) => {
    const t = clamp((v - a) / (b - a));
    return t * t * (3 - 2 * t);
  };
  interface Node {
    el: HTMLElement;
    /** how far down the line the diamond sits */
    at: number;
    on: boolean;
  }
  let x = 0; // the line, in the wrap's coordinates
  let y0 = 0;
  let total = 0;
  let nodes: Node[] = [];
  let drawn = 0;
  let visible = false;
  let raf = 0;
  let last = 0;
  let nearEl: HTMLElement | null = null;

  function layout(): void {
    const W = wrap.clientWidth;
    const H = wrap.clientHeight;
    if (!W || !H || !list) return;
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    // layout positions (offset*), not client rects: the window may still be
    // scaled by its entrance transition when this runs
    const mids = $$(".log__item", list).flatMap((el) => {
      const node = $(".log__node", el);
      if (!node) return [];
      return [
        {
          el,
          x:
            list.offsetLeft +
            el.offsetLeft +
            node.offsetLeft +
            node.offsetWidth / 2,
          y:
            list.offsetTop +
            el.offsetTop +
            node.offsetTop +
            node.offsetHeight / 2,
        },
      ];
    });
    if (!mids.length) return;
    x = mids[0].x;
    // from the bottom of the first day label (or the first diamond) to the last diamond
    const first = list.firstElementChild as HTMLElement | null;
    y0 =
      first && first.classList.contains("log__day")
        ? list.offsetTop + first.offsetTop + first.offsetHeight
        : mids[0].y;
    const before = total;
    total = mids[mids.length - 1].y - y0;
    nodes = mids.map((m) => ({
      el: m.el,
      at: m.y - y0,
      on: m.el.classList.contains("is-on"),
    }));
    for (const l of [rail, bloom, glow, lit]) {
      l.setAttribute("x1", String(x));
      l.setAttribute("x2", String(x));
      l.setAttribute("y1", y0.toFixed(1));
    }
    rail.setAttribute("y2", (y0 + total).toFixed(1));
    drawn = reduce ? total : before ? (drawn / before) * total : 0;
    paint(performance.now());
    kick();
  }

  function paint(now: number): void {
    const tip = y0 + drawn;
    for (const l of [bloom, glow, lit]) l.setAttribute("y2", tip.toFixed(1));
    const lines = drawn > 0.5 ? "1" : "0";
    for (const l of [bloom, glow, lit]) l.style.opacity = lines;

    // diamonds switch on and off with the line; an entry that was reached once stays readable
    let nearest: HTMLElement | null = null;
    let reached: HTMLElement | null = null;
    let gap = Infinity;
    for (const n of nodes) {
      const on = drawn >= n.at - 1;
      if (on) reached = n.el;
      if (on !== n.on) {
        n.on = on;
        n.el.classList.toggle("is-on", on);
        if (on && !n.el.classList.contains("is-seen")) {
          n.el.classList.add("is-seen");
          const [title, text] = $$("[data-type]", n.el);
          if (title) void typeEl(title).then(() => text && typeEl(text));
        }
      }
      const d = Math.abs(drawn - n.at);
      if (d < gap) {
        gap = d;
        nearest = n.el;
      }
    }

    // the point at the tip: it shrinks into a diamond and grows out of it again
    const free = smooth(3, 20, gap); // 0 inside a diamond, 1 on the open line
    const running = !reduce && drawn > 0.5;
    head.style.opacity = halo.style.opacity = running ? "1" : "0";
    if (running) {
      for (const c of [head, halo]) {
        c.setAttribute("cx", String(x));
        c.setAttribute("cy", tip.toFixed(1));
      }
      head.setAttribute("r", (3.6 * free).toFixed(2));
      halo.setAttribute(
        "r",
        ((10 + 3 * Math.sin(now / 240)) * free).toFixed(2),
      );
    }
    if (nearEl && nearEl !== nearest) nearEl.style.removeProperty("--near");
    nearEl = nearest;
    if (nearest)
      nearest.style.setProperty(
        "--near",
        running ? (1 - free).toFixed(2) : "0",
      );

    packets.forEach((c, k) => {
      if (reduce || drawn < 90) {
        c.style.opacity = "0";
        return;
      }
      const at = (now * 0.11 + (k * drawn) / packets.length) % drawn;
      c.setAttribute("cx", String(x));
      c.setAttribute("cy", (y0 + at).toFixed(1));
      c.style.opacity = (Math.sin((Math.PI * at) / drawn) * 0.85).toFixed(2);
    });

    // the window clock follows the point: it shows the entry reached last
    if (clock) {
      const stamp = (reached ?? nodes[0]?.el)?.dataset.clock;
      if (stamp && clock.textContent !== stamp) clock.textContent = stamp;
    }
  }

  function frame(now: number): void {
    raf = 0;
    // the real step: a slow device must not lag behind the scroll
    const dt = Math.min(0.25, (now - (last || now)) / 1000);
    last = now;
    // the point sits at two thirds of the window height
    const want = innerHeight * 0.66 - wrap.getBoundingClientRect().top;
    const target = reduce ? total : clamp(want - y0, 0, total);
    drawn += (target - drawn) * (1 - Math.exp(-dt * 6));
    if (Math.abs(target - drawn) < 0.3) drawn = target;
    paint(now);
    if (visible && !reduce) raf = requestAnimationFrame(frame);
  }
  const kick = () => {
    last = 0;
    if (!raf && total) raf = requestAnimationFrame(frame);
  };

  new ResizeObserver(layout).observe(wrap);
  new IntersectionObserver(
    ([e]) => {
      visible = Boolean(e?.isIntersecting);
      if (visible) kick();
    },
    { rootMargin: "20% 0px" },
  ).observe(wrap);
  layout();
  addEventListener("load", layout);
  void document.fonts.ready.then(layout);

  if (new URLSearchParams(location.search).has("debug")) {
    (window as unknown as Record<string, unknown>).qprogram = {
      get drawn() {
        return drawn;
      },
      get total() {
        return total;
      },
      get x() {
        return x;
      },
      get nodes() {
        return nodes.map((n) => ({ at: Math.round(n.at), on: n.on }));
      },
    };
  }
}

/* ------------------------------------------------------------------ apply gate */
// While applications are closed, every apply button "breaks in" for a moment:
// the page tears, Q rain falls behind a terminal, and the terminal says soon.
// Once they are open the buttons are plain links and this does nothing.
function initApplyGate(applyOpen: boolean): void {
  const dialog = $<HTMLDialogElement>("[data-denied]");
  if (applyOpen || !dialog) return;
  const log = $("[data-denied-log]", dialog);
  const art = $("[data-denied-art]", dialog);
  const canvas = $<HTMLCanvasElement>("canvas", dialog);
  if (!log || !art || !canvas) return;
  // the lines the terminal types, written into the page by the server
  const lines = $$<HTMLTemplateElement>("template[data-denied-line]", dialog);
  let run = 0;

  const open = async () => {
    if (dialog.open) return;
    const me = ++run;
    log.innerHTML = "";
    art.textContent = "";
    dialog.showModal();
    dialog.classList.remove("is-in");
    void dialog.offsetWidth; // restart the tear animation
    dialog.classList.add("is-in");

    if (!reduce) {
      canvas.width = Math.round(innerWidth * 0.5);
      canvas.height = Math.round(innerHeight * 0.5);
      const rain = new QRain(canvas, {
        fontSize: Math.max(14, Math.round(canvas.width / 44)),
        stepsPerSecond: 22,
        fontFamily: monoFamily,
      });
      let last = performance.now();
      const loop = (now: number) => {
        if (!dialog.open || me !== run) return;
        rain.update(Math.min(0.1, (now - last) / 1000));
        last = now;
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    }

    for (const line of lines) {
      if (me !== run || !dialog.open) return;
      const el = document.createElement("p");
      el.dataset.type = "";
      el.dataset.typeSpeed = "12";
      el.innerHTML = line.innerHTML;
      log.appendChild(el);
      await typeEl(el);
    }
    if (me !== run || !dialog.open) return;
    const width = art.clientWidth;
    const words = (art.dataset.words ?? "open soon|soon").split("|");
    const rows = banner(
      width < 520 ? (words[1] ?? words[0]) : words[0],
      width < 520 ? 9 : 11,
    );
    if (!rows.length) return;
    art.style.fontSize = `${Math.min(9, width / (rows[0].length * 0.6)).toFixed(2)}px`;
    decrypt(art, rows, { duration: 800 });
  };

  document.addEventListener("click", (ev) => {
    const trigger = (ev.target as Element | null)?.closest("[data-apply]");
    if (!trigger) return;
    ev.preventDefault();
    void open();
  });
  $("[data-denied-close]", dialog)?.addEventListener("click", () =>
    dialog.close(),
  );
  $("[data-denied-details]", dialog)?.addEventListener("click", () =>
    dialog.close(),
  );
  // a click on the backdrop
  dialog.addEventListener("click", (ev) => {
    if (ev.target === dialog) dialog.close();
  });
  dialog.addEventListener("close", () => run++);
}

/* ------------------------------------------------------------------ reveals */
// Terminal windows and the film stage rise into place the first time they
// come into view.
function initReveal(root: HTMLElement): void {
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        io.unobserve(e.target);
        e.target.classList.add("is-in");
      }
    },
    { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
  );
  $$("[data-reveal]", root).forEach((el) => io.observe(el));
}

/* ------------------------------------------------------------------ footer */
// The white site footer under a page that is dark everywhere else: the dark
// header bar steps aside as soon as the white reaches it, and the footer's
// content comes in softly once.
function initFooter(root: HTMLElement): void {
  const footer = $(".site-footer");
  const top = $("[data-top]");
  if (footer && top) {
    // the root is the strip of the window the header sits in
    new IntersectionObserver(
      ([e]) => top.classList.toggle("is-away", Boolean(e?.isIntersecting)),
      { rootMargin: "0px 0px -91% 0px" },
    ).observe(footer);
  }
  const inner = footer && $(".footer-inner", footer);
  if (inner && !reduce) {
    inner.classList.add("is-waiting");
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e?.isIntersecting) return;
        io.disconnect();
        inner.classList.add("is-coming");
        inner.classList.remove("is-waiting");
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
    );
    io.observe(inner);
  }
  const fade = $(".page-fade", root);
  if (fade) ditherFade(fade);
}

// The fade into the footer, painted with dither. CSS quantizes a gradient to
// 8 bit without any, and a long run out of near black then shows as bands
// (clearly so on OLED phones). Same curve as the CSS fallback in
// qhack-theme.css: ground to the middle violet eased in, the middle violet to
// white eased out.
function ditherFade(el: HTMLElement): void {
  const from = rgb("hack-night");
  const violet = rgb("hack-violet");
  const haze = rgb("hack-haze");
  // --fade-mid: 55 % violet, 45 % haze
  const mid = violet.map((v, i) => v * 0.55 + haze[i] * 0.45);
  const W = 128; // device pixels; the strip repeats sideways
  let url = "";
  let drawn = "";
  const draw = () => {
    const dpr = devicePixelRatio || 1;
    const h = Math.round(el.offsetHeight * dpr);
    if (!h || drawn === `${h}/${dpr}`) return;
    drawn = `${h}/${dpr}`;
    const c = document.createElement("canvas");
    c.width = W;
    c.height = h;
    const g = c.getContext("2d");
    if (!g) return;
    const img = g.createImageData(W, h);
    const d = img.data;
    for (let y = 0; y < h; y++) {
      const t = (y + 0.5) / h;
      const row = [0, 1, 2].map((k) => {
        if (t < 0.5) return from[k] + (mid[k] - from[k]) * (2 * t) ** 2;
        return mid[k] + (255 - mid[k]) * (1 - (2 - 2 * t) ** 2);
      });
      for (let px = 0; px < W; px++) {
        const i = (y * W + px) * 4;
        // triangular, one step wide: after rounding no band is left
        const n = Math.random() - Math.random();
        d[i] = row[0] + n;
        d[i + 1] = row[1] + n;
        d[i + 2] = row[2] + n;
        d[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    c.toBlob((blob) => {
      if (!blob) return;
      if (url) URL.revokeObjectURL(url);
      url = URL.createObjectURL(blob);
      el.style.backgroundImage = `url(${url})`;
      el.style.backgroundSize = `${W / dpr}px 100%`;
    });
  };
  draw();
  let timer = 0;
  addEventListener("resize", () => {
    clearTimeout(timer);
    timer = window.setTimeout(draw, 200);
  });
}

/* ------------------------------------------------------------------ aftermovie */
// The play button names the film's length once the browser knows it, and
// the whole section leaves if the film cannot be loaded at all (it is not
// part of the build: it is fetched from /media at run time).
function initMovieFacts(stage: HTMLElement): void {
  const video = $<HTMLVideoElement>("video", stage);
  if (!video) return;
  const length = $("[data-movie-length]", stage);
  const show = () => {
    const s = Math.round(video.duration);
    if (!length || !Number.isFinite(s) || s <= 0) return;
    length.textContent = ` · ${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  };
  if (video.readyState >= 1) show();
  else video.addEventListener("loadedmetadata", show, { once: true });
  video.addEventListener(
    "error",
    () => stage.closest("section")?.setAttribute("hidden", ""),
    { once: true },
  );
}

/* ------------------------------------------------------------------ status line */
function initStatus(root: HTMLElement): void {
  const sections = $$("[data-win]", root);
  const links = $$("[data-wins] a", root);
  if (!sections.length || !links.length) return;
  const onScroll = () => {
    const mid = innerHeight * 0.5;
    let current = 0;
    sections.forEach((s, i) => {
      if (s.getBoundingClientRect().top <= mid) current = i;
    });
    links.forEach((a, i) => {
      a.setAttribute("aria-current", i === current ? "true" : "false");
      a.parentElement?.classList.toggle("is-current", i === current);
    });
  };
  addEventListener("scroll", onScroll, { passive: true });
  onScroll();
}

/* ------------------------------------------------------------------ page rain */
// The Q rain that starts on the laptop screen carries on behind the page for
// a moment after the laptop is gone, then thins out over the programme.
function initPageRain(root: HTMLElement): (value: number) => void {
  const canvas = $<HTMLCanvasElement>("[data-rain]", root);
  if (!canvas) return () => {};
  let rain: QRain | null = null;
  let opacity = 0;
  let raf = 0;
  let last = 0;
  const size = () => {
    canvas.width = Math.round(innerWidth * 0.75);
    canvas.height = Math.round(innerHeight * 0.75);
    rain = new QRain(canvas, {
      fontSize: Math.max(16, Math.round(canvas.width / 46)),
      stepsPerSecond: 16,
      fontFamily: monoFamily,
    });
    // already in full fall when it fades in: it takes over from the rain on the
    // laptop display, it must not start again from the top edge
    rain.prewarm();
  };
  const loop = (now: number) => {
    raf = 0;
    if (opacity <= 0.01 || !rain) return;
    rain.update(Math.min(0.1, (now - last) / 1000));
    last = now;
    raf = requestAnimationFrame(loop);
  };
  addEventListener("resize", size);
  size();
  return (value: number) => {
    opacity = reduce ? 0 : value;
    canvas.style.opacity = opacity.toFixed(3);
    if (opacity > 0.01 && !raf) {
      last = performance.now();
      raf = requestAnimationFrame(loop);
    }
  };
}

// A moment in which the page has nothing more urgent to do.
const idle = (): Promise<void> =>
  new Promise((resolve) => {
    if ("requestIdleCallback" in window)
      requestIdleCallback(() => resolve(), { timeout: 600 });
    else setTimeout(resolve, 120);
  });

/* ------------------------------------------------------------------ boot */
export async function initQhackPage(): Promise<void> {
  const root = $("[data-qhack]");
  const source = $("[data-qhack-data]");
  if (!root || !source) return;
  const data = JSON.parse(source.textContent ?? "{}") as QhackData;

  // The visual regression gallery freezes animation and has no GPU to speak
  // of: it gets the page as it is without this script.
  if (document.documentElement.hasAttribute("data-vrt")) return;

  // The inline flag in QhackPage.astro set this class before the first paint
  // and waits for this mark: without it the page falls back to its plain form.
  document.documentElement.classList.add("qhack-js");
  document.documentElement.setAttribute("data-qhack-ready", "");
  reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  monoFamily = getComputedStyle(root).fontFamily || "monospace";

  // the faces that are drawn into canvases must be there before the first draw
  await Promise.all([
    document.fonts.load(
      `900 40px ${getComputedStyle(document.body).fontFamily}`,
    ),
    document.fonts.load(`700 16px ${monoFamily}`),
  ]).catch(() => {});

  initCountdown(data.startsAt);
  initStatus(root);
  initHeader();
  initFooter(root);
  initProgram();
  initTyping(root);
  const ask = $("[data-ask]", root);
  if (ask && data.topics.length) {
    // the answers were all written out for readers without the script: the
    // terminal starts empty and types them on request
    $$("[data-chat-static]", ask).forEach((el) => el.remove());
    $("[data-chat-empty]", ask)?.removeAttribute("hidden");
    initAsk(ask, {
      topics: data.topics,
      typeEl,
      contactEmail: data.contactEmail,
    });
  }
  initApplyGate(data.applyOpen);
  initReveal(root);
  const setRain = initPageRain(root);

  // The entrance belongs to the lockup: it starts as soon as it can, and
  // nothing heavy runs while it flies together. The partner band is light
  // and drawn in slices beside it; the film preview, the laptop and the
  // photo roll wait until the lockup stands (or until somebody scrolls on).
  const heroCanvas = $<HTMLCanvasElement>("[data-hero-canvas]", root);
  const hero = heroCanvas
    ? await initHero(heroCanvas, data.logo).catch((err: unknown) => {
        console.error(err);
        return null;
      })
    : null;
  const track = $("[data-partners]", root);
  if (track && data.partners.length) {
    initPartners(track, data.partners, {
      height: innerWidth < 760 ? 30 : 40,
    }).catch((err: unknown) => console.error(err));
  }
  await new Promise<void>((resolve) => {
    void hero?.assembled.then(resolve);
    setTimeout(resolve, !hero || scrollY > 40 ? 0 : 6000);
    for (const type of ["scroll", "wheel", "keydown", "touchmove"])
      addEventListener(type, () => resolve(), { once: true, passive: true });
  });
  await idle();

  const stage = $("[data-movie]", root);
  if (stage) {
    initMovie(stage, { reduce });
    initMovieFacts(stage);
  }

  let hacked = false;
  const setHacked = () => {
    if (hacked) return;
    hacked = true;
    $(".status", root)?.classList.add("is-hacked");
    const msg = $("[data-status-msg]", root);
    if (!msg) return;
    msg.dataset.type = "";
    msg.dataset.typeSpeed = "18";
    msg.textContent = data.hackedMessage;
    void typeEl(msg);
  };

  // The 3D pieces. Setting them up (the 3D library, studio lighting, shaders)
  // is heavy work on a cold start, which is why they come last: the entrance
  // must not stutter. The laptop comes first, the film roll further down
  // after it.
  const film = $("[data-film]", root);
  const machine = $("[data-machine]", root);
  if (reduce) {
    film?.classList.add("is-static");
    machine?.classList.add("is-static");
    return;
  }
  await idle();
  const laptopCanvas = machine && $<HTMLCanvasElement>("canvas", machine);
  if (machine && laptopCanvas) {
    await import("./laptop")
      .then((m) =>
        m.initLaptop({
          section: machine,
          canvas: laptopCanvas,
          assets: {
            model: data.laptop.model,
            logo: data.logo,
            stickers: data.laptop.stickers,
          },
          texts: data.laptop.texts,
          onHacked: setHacked,
          setRain,
        }),
      )
      .catch((err: unknown) => {
        console.error(err);
        machine.classList.add("is-static");
      });
  }
  const filmCanvas = film && $<HTMLCanvasElement>("canvas", film);
  const caption = film && $("[data-film-caption]", film);
  const prev = film && $("[data-film-prev]", film);
  const next = film && $("[data-film-next]", film);
  if (film && filmCanvas && caption && prev && next && data.photos.length) {
    await import("./film-roll")
      .then((m) =>
        m.initFilm({
          canvas: filmCanvas,
          photos: data.photos,
          caption,
          prev,
          next,
        }),
      )
      .catch((err: unknown) => {
        console.error(err);
        film.classList.add("is-static");
      });
  } else film?.classList.add("is-static");
}
