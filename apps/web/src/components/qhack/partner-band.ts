// The "previous partners" band. Every logo is redrawn in the page's own
// material: its exact outline, filled with tiny characters and edged with a
// fine line, all in white. The shapes stay the real logos (they are cut from
// the original files), only the color and the filling change.
//
// A partner without a logo file is set as its name in the display face and
// goes through the same treatment, so the band never has a hole.
//
// The band comes up while the hero lockup assembles, so it must not hold the
// page: every logo is drawn once, at a size not far above the one it is shown
// in, and the work is cut into slices of a few milliseconds.

import { breathe } from "./breathe";

export interface BandPartner {
  name: string;
  logo?: string;
  /** show the name beside a logo that is only a mark */
  label?: boolean;
  /** the partner's own site; the logo links to it */
  href?: string;
}

/** The faces the band draws with, by the names the page resolved them to. */
interface Faces {
  display: string;
  mono: string;
}

interface InkBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

const GLYPHS = "01<>/#*+=$%&@{}[]";
const SCALE = 2; // canvas pixels per CSS pixel, enough for every screen

function context2d(
  canvas: HTMLCanvasElement,
  options?: CanvasRenderingContext2DSettings,
): CanvasRenderingContext2D {
  const ctx = canvas.getContext("2d", options);
  if (!ctx) throw new Error("2D canvas is not available");
  return ctx;
}

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

// Many SVG logos carry only a viewBox and no size. Give them one, or the
// browser has nothing to rasterize them by.
async function loadLogo(src: string): Promise<HTMLImageElement> {
  if (!/\.svg(?:$|[?#])/i.test(src)) return loadImage(src);
  const text = await (await fetch(src)).text();
  const svg = new DOMParser().parseFromString(
    text,
    "image/svg+xml",
  ).documentElement;
  if (svg.nodeName !== "svg") throw new Error(`${src} is not an SVG`);
  const box = (svg.getAttribute("viewBox") || "").split(/[\s,]+/).map(Number);
  let w = parseFloat(svg.getAttribute("width") ?? "");
  let h = parseFloat(svg.getAttribute("height") ?? "");
  if (box.length === 4 && box[2] > 0 && box[3] > 0) [w, h] = [box[2], box[3]];
  if (!(w > 0 && h > 0)) [w, h] = [300, 100];
  const k = 640 / Math.max(w, h);
  svg.setAttribute("width", (w * k).toFixed(1));
  svg.setAttribute("height", (h * k).toFixed(1));
  const url = URL.createObjectURL(
    new Blob([new XMLSerializer().serializeToString(svg)], {
      type: "image/svg+xml",
    }),
  );
  try {
    return await loadImage(url);
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
}

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * The logo as a mask: opaque where the logo has ink. White that sits inside a
 * colored logo (the letters in a badge) becomes a hole, so it still reads; a
 * logo that is white altogether keeps its shape.
 */
function maskOf(
  draw: (g: CanvasRenderingContext2D) => void,
  w: number,
  h: number,
): { mask: HTMLCanvasElement; box: InkBox | null } {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = context2d(c, { willReadFrequently: true });
  draw(g);
  const im = g.getImageData(0, 0, w, h);
  const d = im.data;
  const white = new Float32Array(w * h);
  let ink = 0;
  let pale = 0;
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    const a = d[i + 3] / 255;
    const max = Math.max(d[i], d[i + 1], d[i + 2]);
    const min = Math.min(d[i], d[i + 1], d[i + 2]);
    const luma = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
    const sat = max ? (max - min) / max : 0;
    white[p] = smooth(0.8, 0.96, luma) * (1 - smooth(0.08, 0.3, sat));
    ink += a;
    pale += a * white[p];
  }
  const allWhite = ink > 0 && pale / ink > 0.7;
  // the box that holds all the ink, found in the same pass
  let x0 = w,
    y0 = h,
    x1 = -1,
    y1 = -1;
  for (let y = 0, i = 0, p = 0; y < h; y++) {
    for (let x = 0; x < w; x++, i += 4, p++) {
      const a = d[i + 3] / 255;
      const out = Math.round(255 * (allWhite ? a : a * (1 - white[p])));
      d[i] = d[i + 1] = d[i + 2] = 255;
      d[i + 3] = out;
      if (out < 40) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  g.putImageData(im, 0, 0);
  return {
    mask: c,
    box: x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 },
  };
}

function render(
  partner: BandPartner,
  img: HTMLImageElement | null,
  height: number,
  faces: Faces,
): HTMLCanvasElement {
  // 1. where the ink is: the logo (or the name) drawn small. Many files
  // carry a margin, and the band sizes a logo by its ink, not by its file.
  const SMALL = 72;
  const font = `800 ${Math.round(SMALL * 0.7)}px ${faces.display}`;
  const probe = context2d(document.createElement("canvas"));
  probe.font = font;
  const textW = Math.ceil(probe.measureText(partner.name).width);
  const markW = img
    ? Math.round((SMALL * img.naturalWidth) / img.naturalHeight)
    : 0;
  const withName = !img || partner.label; // an icon-only logo is set beside the name
  const gap = img && withName ? Math.round(SMALL * 0.28) : 0;
  const draw = (g: CanvasRenderingContext2D): void => {
    g.imageSmoothingQuality = "high";
    if (img) g.drawImage(img, 0, 0, markW, SMALL);
    if (withName) {
      g.font = font;
      g.fillStyle = "#101010";
      g.textBaseline = "middle";
      g.fillText(partner.name, markW + gap, SMALL * 0.52);
    }
  };
  const fullW = markW + gap + (withName ? textW : 0) + 4;
  const box = maskOf(draw, fullW, SMALL).box || {
    x: 0,
    y: 0,
    w: fullW,
    h: SMALL,
  };

  // 2. its size in the band: wide wordmarks lower, compact marks taller, so
  // every partner carries about the same weight. Then the mask itself, drawn
  // from the original at exactly that size, so it is as sharp as the file.
  const aspect = box.w / box.h;
  const H = Math.round(
    height * SCALE * Math.min(1.2, Math.max(0.46, Math.sqrt(3.4 / aspect))),
  );
  const W = Math.round(H * aspect);
  const pad = 2 * SCALE;
  const k = H / box.h;
  const { mask } = maskOf(
    (g) => {
      g.translate(pad - box.x * k, pad - box.y * k);
      g.scale(k, k);
      draw(g);
    },
    W + pad * 2,
    H + pad * 2,
  );

  // 3. the filling: a faint solid tone under rows of small characters
  const out = document.createElement("canvas");
  out.width = mask.width;
  out.height = mask.height;
  const g = context2d(out);
  g.fillStyle = "rgba(207, 174, 255, 0.4)";
  g.fillRect(0, 0, out.width, out.height);
  const fs = 4.4 * SCALE;
  g.font = `700 ${fs}px ${faces.mono}`;
  g.textBaseline = "top";
  g.fillStyle = "#ffffff";
  const cols = Math.ceil(out.width / (fs * 0.6)) + 1;
  for (let y = 0; y < out.height; y += fs) {
    let row = "";
    for (let x = 0; x < cols; x++)
      row += GLYPHS[(Math.random() * GLYPHS.length) | 0];
    g.fillText(row, 0, y);
  }
  g.globalCompositeOperation = "destination-in";
  g.drawImage(mask, 0, 0);
  // 4. the outline: the shape grown by one pixel, minus the shape
  const edge = document.createElement("canvas");
  edge.width = out.width;
  edge.height = out.height;
  const e = context2d(edge);
  for (const [dx, dy] of [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
    [-1, -1],
    [1, 1],
    [-1, 1],
    [1, -1],
  ])
    e.drawImage(mask, (dx * SCALE) / 2, (dy * SCALE) / 2);
  e.globalCompositeOperation = "destination-out";
  e.drawImage(mask, 0, 0);
  g.globalCompositeOperation = "source-over";
  g.globalAlpha = 0.95;
  g.drawImage(edge, 0, 0);

  out.style.height = `${(out.height / SCALE / 16).toFixed(3)}rem`;
  out.style.width = `${(out.width / SCALE / 16).toFixed(3)}rem`;
  out.className = "plogo";
  out.setAttribute("role", "img");
  out.setAttribute("aria-label", partner.name);
  return out;
}

// A second copy of a drawn logo, for the other half of the loop.
function copyOf(logo: HTMLCanvasElement): HTMLCanvasElement {
  const copy = document.createElement("canvas");
  copy.width = logo.width;
  copy.height = logo.height;
  context2d(copy).drawImage(logo, 0, 0);
  copy.style.cssText = logo.style.cssText;
  copy.className = logo.className;
  return copy;
}

// The logo as the band shows it: a link to the partner's site when there is
// one. The links are for the pointer only (the band is hidden from assistive
// technology, which gets the list of names beside it).
function item(logo: HTMLCanvasElement, partner: BandPartner): HTMLElement {
  if (!partner.href) return logo;
  const link = document.createElement("a");
  link.className = "plink";
  link.href = partner.href;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.tabIndex = -1;
  link.title = partner.name;
  link.append(logo);
  return link;
}

/** Fill `track` with the partners' logos, twice over for the seamless loop. */
export async function initPartners(
  track: HTMLElement,
  partners: BandPartner[],
  { height = 40 }: { height?: number } = {},
): Promise<void> {
  const faces: Faces = {
    display: getComputedStyle(document.body).fontFamily || "sans-serif",
    mono: getComputedStyle(track).fontFamily || "monospace",
  };
  await document.fonts.load(`800 24px ${faces.display}`).catch(() => {});
  const logos = await Promise.all(
    partners.map(
      async (partner): Promise<[BandPartner, HTMLImageElement | null]> => {
        const img = partner.logo
          ? await loadLogo(partner.logo).catch(() => null)
          : null;
        return [partner, img];
      },
    ),
  );
  // drawn in slices: a few milliseconds of work, then the page gets a frame
  const drawn: [BandPartner, HTMLCanvasElement][] = [];
  let since = performance.now();
  for (const [partner, img] of logos) {
    if (performance.now() - since > 5) {
      await breathe();
      since = performance.now();
    }
    drawn.push([partner, render(partner, img, height, faces)]);
  }
  await breathe();
  track.textContent = "";
  for (const [partner, logo] of drawn) track.append(item(logo, partner));
  // the second half is only there for the loop
  for (const [partner, logo] of drawn) {
    const again = item(copyOf(logo), partner);
    again.setAttribute("aria-hidden", "true");
    track.append(again);
  }
  // one pace for any number of partners
  track.style.animationDuration = `${Math.max(30, logos.length * 3.4).toFixed(0)}s`;
  track.classList.add("is-ready");
}
