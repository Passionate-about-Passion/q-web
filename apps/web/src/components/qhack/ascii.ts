// ASCII helpers for the Q-Hack page (DESIGN.md HACK-1): turn anything drawn
// on a canvas into characters. A character cell is 0.6em wide and 1em tall
// (JetBrains Mono, line-height 1).

export const RAMP = " .:-=+*#";
const CELL_ASPECT = 0.6;

type Draw = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
) => void;

/** Sample a drawing into `cols` x `rows` characters. `draw` paints white on clear. */
export function asciiFrom(
  draw: Draw,
  cols: number,
  rows: number,
  ramp = RAMP,
): string[] {
  const S = 4; // source pixels per character column
  const w = cols * S;
  const h = Math.round((rows * S) / CELL_ASPECT);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return [];
  draw(ctx, w, h);
  return sample(ctx.getImageData(0, 0, w, h).data, w, h, cols, rows, ramp, 3);
}

/** Average one channel (0 r, 1 g, 2 b, 3 alpha) per cell and map it to the ramp. */
export function sample(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  cols: number,
  rows: number,
  ramp = RAMP,
  channel = 0,
): string[] {
  const cw = w / cols;
  const ch = h / rows;
  const lines: string[] = [];
  for (let r = 0; r < rows; r++) {
    let line = "";
    const y0 = Math.floor(r * ch);
    const y1 = Math.max(y0 + 1, Math.floor((r + 1) * ch));
    for (let c = 0; c < cols; c++) {
      const x0 = Math.floor(c * cw);
      const x1 = Math.max(x0 + 1, Math.floor((c + 1) * cw));
      let sum = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++)
          sum += data[(y * w + x) * 4 + channel] ?? 0;
      }
      const v = sum / ((y1 - y0) * (x1 - x0) * 255);
      line += ramp[Math.min(ramp.length - 1, Math.floor(v * ramp.length))];
    }
    lines.push(line);
  }
  return lines;
}

/** A word in the display face (Montserrat Black), as `rows` lines of characters. */
export function banner(
  text: string,
  rows = 13,
  { weight = 900, caps = true }: { weight?: number; caps?: boolean } = {},
): string[] {
  const S = 4;
  const h = Math.round((rows * S) / CELL_ASPECT);
  // Capitals fill the full height (cap height of Montserrat is 0.7 em), which
  // keeps the letterforms readable at few rows; lower case needs room below.
  const word = caps ? text.toUpperCase() : text;
  // the site's display face, by the name the page itself resolved it to
  const family = getComputedStyle(document.body).fontFamily || "sans-serif";
  const font = `${weight} ${Math.round(caps ? h / 0.7 : h * 0.86)}px ${family}`;
  const probe = document.createElement("canvas").getContext("2d");
  if (!probe) return [];
  probe.font = font;
  const cols = Math.ceil(probe.measureText(word).width / S) + 2;
  return asciiFrom(
    (ctx, _w, hh) => {
      ctx.font = font;
      ctx.fillStyle = "#fff";
      ctx.textBaseline = "alphabetic";
      ctx.fillText(word, S, caps ? hh : hh * 0.74);
    },
    cols,
    rows,
  );
}

/** Reveal lines of characters with a short decrypt effect, then settle. */
export function decrypt(
  el: HTMLElement,
  lines: string[],
  { duration = 700 }: { duration?: number } = {},
): void {
  const final = lines.join("\n");
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
    el.textContent = final;
    return;
  }
  const noise = ".:-=+*";
  const seed = Array.from(final, () => Math.random());
  const t0 = performance.now();
  const tick = (now: number) => {
    const p = Math.min(1, (now - t0) / duration);
    let out = "";
    for (let i = 0; i < final.length; i++) {
      const ch = final[i];
      const s = seed[i] ?? 0;
      if (ch === "\n" || ch === " " || s < p) out += ch;
      else
        out += s - p < 0.25 ? noise[(Math.random() * noise.length) | 0] : " ";
    }
    el.textContent = out;
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
