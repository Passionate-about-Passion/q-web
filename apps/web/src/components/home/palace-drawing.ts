/**
 * Mannheim Palace as a line drawing (DESIGN.md HOME-1), after the team's
 * second 2027 mockup: the centre pavilion with its attic and crest, two
 * long wings with dormers, the windows as small shapes of their own.
 * Built at build time, so the page needs no script to show it. The canvas
 * is 1600 x 420; the building stands on y = 404 (GROUND_SHARE of the
 * height above the canvas foot, so a stage can set it flush on an edge).
 *
 * Every window carries a threshold `t` (0 to 1): the order in which it
 * lights while the palace stage is scrolled, from the centre outwards with
 * a little scatter (a fixed seed, so every build lights the same way).
 */

export const PALACE_VIEW_BOX = "0 0 1600 420";

export interface PalaceWindow {
  /** Path data of the window shape. */
  d: string;
  /** When it lights, 0 (first) to 1 (last). */
  t: number;
}

export interface PalaceDrawing {
  lines: string[];
  /** The ground the building stands on, across the whole canvas. */
  ground: string;
  windows: PalaceWindow[];
}

const GROUND = 404;

/** The part of the canvas height under the ground line (16 of 420). */
export const GROUND_SHARE = (420 - GROUND) / 420;

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
  arch: boolean;
}

const n = (v: number) => Number(v.toFixed(1));

function windowPath({ x, y, w, h, arch }: Box): string {
  const r = w / 2;
  return arch
    ? `M${n(x)} ${n(y + h)}V${n(y + r)}a${n(r)} ${n(r)} 0 0 1 ${n(w)} 0V${n(y + h)}Z`
    : `M${n(x)} ${n(y)}h${n(w)}v${n(h)}h-${n(w)}Z`;
}

export function drawPalace(): PalaceDrawing {
  const lines: string[] = [];
  const boxes: Box[] = [];
  const win = (x: number, y: number, w: number, h: number, arch: boolean) =>
    boxes.push({ x, y, w, h, arch });

  // The two wings: walls, the roof with a slope at the outer end, a cornice
  // and four storeys of twelve windows (dormers on top).
  for (const [x0, x1, right] of [
    [70, 600, false],
    [1000, 1530, true],
  ] as const) {
    lines.push(`M${x0} ${GROUND}V248H${x1}`);
    lines.push(
      right
        ? `M${x1} 248L${x1 - 24} 196H${x0}`
        : `M${x0} 248L${x0 + 24} 196H${x1}`,
    );
    lines.push(`M${x0} 296H${x1}`);
    for (let i = 0; i < 12; i++) {
      const cx = x0 + 40 + i * ((x1 - x0 - 80) / 11);
      win(cx - 7, 212, 14, 20, true);
      win(cx - 9, 260, 18, 24, false);
      win(cx - 9, 308, 18, 48, true);
      win(cx - 9, 370, 18, 24, false);
    }
  }

  // The centre pavilion: body, cornice, balustrade, pilasters, the band
  // above the ground floor, a balcony over the portal, the attic and crest.
  lines.push(`M600 ${GROUND}V170H1000V${GROUND}`);
  lines.push("M590 170H1010M600 156H1000");
  let balustrade = "";
  for (let bx = 607; bx < 1000; bx += 13) balustrade += `M${bx} 156V170`;
  lines.push(balustrade);
  lines.push(
    `M648 184V${GROUND}M752 184V${GROUND}M848 184V${GROUND}M952 184V${GROUND}`,
  );
  lines.push("M600 184H1000M600 330H1000");
  for (const cx of [624, 676, 724, 876, 924, 976]) {
    win(cx - 9, 200, 18, 28, false);
    win(cx - 10, 246, 20, 62, true);
    win(cx - 9, 346, 18, 38, false);
  }
  win(790, 198, 20, 26, false);
  win(780, 236, 40, 78, true);
  win(778, 346, 44, GROUND - 346, true);
  lines.push(
    "M762 316H838M768 316V328M784 316V328M800 316V328M816 316V328M832 316V328M762 328H838",
  );
  lines.push("M690 156V102H910V156M680 102H920M690 102L716 80H884L910 102");
  for (const cx of [722, 762, 838, 878]) win(cx - 9, 118, 18, 26, true);
  lines.push(
    "M784 140a16 18 0 1 0 32 0a16 18 0 1 0 -32 0M790 120l4 -9 6 7 6 -7 4 9",
  );

  // Lighting order: distance from the centre plus a seeded scatter.
  let seed = 7;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const raw = boxes.map((box) => {
    const cx = box.x + box.w / 2;
    return 0.62 * (Math.abs(cx - 800) / 740) + 0.38 * rnd();
  });
  const lo = Math.min(...raw);
  const hi = Math.max(...raw);

  return {
    lines,
    ground: `M0 ${GROUND}H1600`,
    windows: boxes.map((box, i) => ({
      d: windowPath(box),
      t: Number(((raw[i]! - lo) / (hi - lo)).toFixed(3)),
    })),
  };
}
