/**
 * A visitor's name on the hanging pass (DESIGN.md HOME-1, after the team's
 * mockup: "Put your name on it"). The printed front (card-front.webp) is
 * drawn from card art whose headline reads "Your pass to the 10th
 * edition."; card-front-blank.webp is the same art without its kicker and
 * headline. This draws the kicker and the name onto the blank front in
 * the same type and place, bottom-aligned to where the headline ends, so
 * a short name sits right above the rule as the headline did. As in the
 * headline ("Your pass to" white, "the 10th edition." ice), a name on two
 * or three lines turns ice after its first line.
 *
 * Measured from the card art (1024 x 1456 card pixels; render-blank.mjs
 * in the reference package): headline 124px Montserrat 800, line height
 * 0.92, letter spacing -0.035em, left 63, last baseline 1011.7, at most
 * 898 wide; the kicker 36.5px 800, 0.1em, uppercase, near white, left 71,
 * 11.5px above it.
 */

export const BLANK_FRONT = "/home/pass/card-front-blank.webp";

const W = 1024;
const H = 1456;
/** The card art is drawn at twice its card pixels (2048 x 2912). */
const SCALE = 2;
const LEFT = 63;
const KICKER_LEFT = 71;
const MAX_W = 898;
const LAST_BASELINE = 1011.7;
const NAME_SIZE = 124;
const MIN_SIZE = 64;
const LINE = 0.92;
const KICKER = "All access · Q27";
const KICKER_SIZE = 36.5;
const KICKER_GAP = 11.5;
/** Baseline of the kicker below its box top (36.5px box, line height 1). */
const KICKER_BASE = 31.3;
/** A headline line's baseline below its box top, per pixel of size. */
const BASE_IN_LINE = 0.8185;

/** A color token from the page, with the card art's value as fallback. */
const token = (name: string, fallback: string): string =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() ||
  fallback;

/** Splits a name into at most three lines that fit at the given size. */
function layout(
  ctx: CanvasRenderingContext2D,
  name: string,
  family: string,
): { size: number; lines: string[] } {
  const words = name.split(/\s+/).filter(Boolean);
  for (let size = NAME_SIZE; size >= MIN_SIZE; size -= 4) {
    ctx.font = `800 ${size}px ${family}`;
    const lines: string[] = [];
    let line = "";
    let fits = true;
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width <= MAX_W) {
        line = next;
        continue;
      }
      if (line) lines.push(line);
      line = word;
      if (ctx.measureText(word).width > MAX_W) fits = false;
    }
    if (line) lines.push(line);
    if (fits && lines.length <= 3) return { size, lines };
  }
  ctx.font = `800 ${MIN_SIZE}px ${family}`;
  return { size: MIN_SIZE, lines: [name] };
}

/**
 * Draws the front with the name into `canvas` (created when missing) and
 * returns it. `family` is the page's font stack, already loaded.
 */
export function drawNamedFront(
  blank: CanvasImageSource,
  name: string,
  family: string,
  canvas: HTMLCanvasElement = document.createElement("canvas"),
): HTMLCanvasElement {
  canvas.width = W * SCALE;
  canvas.height = H * SCALE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.drawImage(blank, 0, 0, W, H);

  const { size, lines } = layout(ctx, name, family);
  const step = size * LINE;
  const top = LAST_BASELINE - (lines.length - 1) * step;

  // The name: its first line white, the rest ice, as the headline.
  const white = token("--color-white", "white");
  const ice = token("--color-ticket-ice", "lightblue");
  ctx.save();
  ctx.font = `800 ${size}px ${family}`;
  ctx.textBaseline = "alphabetic";
  if ("letterSpacing" in ctx) ctx.letterSpacing = `${-0.035 * size}px`;
  lines.forEach((text, i) => {
    ctx.fillStyle = i === 0 ? white : ice;
    ctx.fillText(text, LEFT, top + i * step);
  });
  ctx.restore();

  // The kicker, 11.5px above the name's first line box.
  const firstBoxTop = top - BASE_IN_LINE * size;
  const kickerBaseline = firstBoxTop - KICKER_GAP - KICKER_SIZE + KICKER_BASE;
  ctx.save();
  ctx.font = `800 ${KICKER_SIZE}px ${family}`;
  ctx.fillStyle = white;
  ctx.globalAlpha = 0.92;
  ctx.textBaseline = "alphabetic";
  if ("letterSpacing" in ctx) ctx.letterSpacing = `${0.1 * KICKER_SIZE}px`;
  ctx.fillText(KICKER.toUpperCase(), KICKER_LEFT, kickerBaseline);
  ctx.restore();
  return canvas;
}
