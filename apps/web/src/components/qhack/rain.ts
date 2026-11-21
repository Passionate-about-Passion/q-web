// Q rain for the Q-Hack page (DESIGN.md HACK-1): the code rain of the
// films, but every glyph is a Q in the Q-Hack violet. Classic trail
// technique: each step dims the whole canvas a little and draws only the new
// heads, so the cost is one glyph per column per step.
import { rgba, token } from "./palette";

interface RainOptions {
  fontSize?: number;
  stepsPerSecond?: number;
  fade?: number;
  /** Keep the pixels in CPU memory. A GPU backed 2D canvas that is copied
   *  into a WebGL texture every frame stalls integrated graphics. */
  software?: boolean;
  /** The mono face, as the page resolved it. */
  fontFamily?: string;
}

export class QRain {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly fontSize: number;
  private readonly interval: number;
  private readonly fade: number;
  private readonly font: string;
  private readonly head: HTMLCanvasElement;
  private readonly pad: number;
  private acc = 0;
  private colW = 0;
  private rowH = 0;
  private cols = 0;
  private rows = 0;
  private heads: number[] = [];
  private speed: number[] = [];

  constructor(
    canvas: HTMLCanvasElement,
    {
      fontSize = 26,
      stepsPerSecond = 18,
      fade = 0.075,
      software = false,
      fontFamily = "monospace",
    }: RainOptions = {},
  ) {
    this.canvas = canvas;
    const ctx = canvas.getContext(
      "2d",
      software ? { willReadFrequently: true } : undefined,
    );
    if (!ctx) throw new Error("2D canvas is not available");
    this.ctx = ctx;
    this.fontSize = fontSize;
    this.interval = 1 / stepsPerSecond;
    this.fade = fade;
    this.font = `700 ${fontSize}px ${fontFamily}`;
    // The glowing head, drawn once: shadowBlur per glyph per step is far too slow.
    const pad = Math.ceil(fontSize * 0.9);
    const head = document.createElement("canvas");
    head.width = Math.ceil(fontSize * 0.86) + pad * 2;
    head.height = Math.ceil(fontSize * 1.08) + pad * 2;
    const h = head.getContext("2d");
    if (h) {
      h.font = this.font;
      h.textBaseline = "top";
      h.shadowColor = token("hack-glow");
      h.shadowBlur = fontSize * 0.7;
      h.fillStyle = token("hack-mist");
      h.fillText("Q", pad, pad);
      h.fillText("Q", pad, pad);
    }
    this.head = head;
    this.pad = pad;
    this.reset();
  }

  reset(): void {
    const { canvas, fontSize } = this;
    this.colW = fontSize * 0.86;
    this.rowH = fontSize * 1.08;
    this.cols = Math.ceil(canvas.width / this.colW);
    this.rows = Math.ceil(canvas.height / this.rowH);
    // Start above the top at random heights so the rain arrives staggered.
    this.heads = Array.from(
      { length: this.cols },
      () => -Math.random() * this.rows * 1.2,
    );
    this.speed = Array.from(
      { length: this.cols },
      () => 0.55 + Math.random() * 0.75,
    );
    this.ctx.fillStyle = token("hack-night");
    this.ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  /** Advance by `dt` seconds. Returns true when the canvas changed. */
  update(dt: number): boolean {
    this.acc += dt;
    if (this.acc < this.interval) return false;
    this.acc %= this.interval;
    this.step();
    return true;
  }

  /** Run ahead, so the rain is already falling everywhere when it is first shown. */
  prewarm(steps = this.rows * 2): void {
    for (let i = 0; i < steps; i++) this.step();
  }

  step(): void {
    const { ctx, canvas, colW, rowH } = this;
    ctx.fillStyle = rgba("hack-night", this.fade);
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = this.font;
    ctx.textBaseline = "top";
    const night = token("hack-night");
    const trailA = token("hack-glow");
    const trailB = token("hack-mid");
    for (let c = 0; c < this.cols; c++) {
      const before = this.heads[c] ?? 0;
      const prev = Math.floor(before);
      const next = before + (this.speed[c] ?? 1);
      this.heads[c] = next;
      const row = Math.floor(next);
      if (row === prev) continue;
      const x = c * colW;
      // The glyph the head just left turns violet, the new head is almost white.
      if (prev >= 0) {
        ctx.fillStyle = night;
        ctx.fillRect(x, prev * rowH, colW, rowH);
        ctx.fillStyle = Math.random() < 0.5 ? trailA : trailB;
        ctx.fillText(Math.random() < 0.82 ? "Q" : "q", x, prev * rowH);
      }
      if (row >= 0) {
        ctx.drawImage(this.head, x - this.pad, row * rowH - this.pad);
      }
      if (row > this.rows + 4 && Math.random() < 0.3) {
        this.heads[c] = -Math.random() * 8;
        this.speed[c] = 0.55 + Math.random() * 0.75;
      }
    }
  }
}
