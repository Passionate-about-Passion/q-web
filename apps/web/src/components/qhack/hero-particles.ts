// Hero: the Q-hack lockup as a solid body made of characters.
//
// Every character is a particle with a home: the front face of the lockup, the
// extruded side walls behind it, and loose dust in the depth around it. The
// particles are held in place by springs, so the body can be pushed around:
//   hover        the characters under the cursor lift, scramble and light up
//   press + hold a blast at the cursor tears the body apart; the longer the
//                hold, the wider the damage. Dragging smears it.
//   release      everything is pulled back into shape, overshoots a little
//                and settles
//   scroll away  the body crumbles downwards, towards the machine below
// One draw call of point sprites (plus a soft second pass for the glow); the
// physics is a plain loop over typed arrays.

const GLYPHS = "Q#@8&%$X0O+=*<>/:;-.";
const ATLAS_CELL = 64;
const ATLAS_SLOTS = 32; // power of two, so the atlas can have mipmaps

const VERT = `
attribute vec3 aPos, aHome;
attribute vec4 aData; // glyph, size, shade (0 front .. 1 back, -1 dust), seed
uniform mat3 uRot;
uniform vec2 uScale, uOffset;
uniform vec3 uMouse;
uniform float uCam, uSize, uTime, uHover, uFade, uN, uLit;
uniform mediump float uPass; // shared with the fragment shader, so the precision must match
varying float vGlyph, vAlpha;
varying vec3 vCol;
void main(){
  vec3 p = aPos;
  float seed = aData.w;
  float dust = step(aData.z, -.5);
  p.xy += dust * .035 * vec2(sin(uTime * .21 + seed * 40.), cos(uTime * .17 + seed * 31.));

  vec2 dm = p.xy - uMouse.xy;
  float near = exp(-dot(dm, dm) / .022) * uHover * (1. - dust * .6);
  p.z += near * .09;
  float heat = clamp(length(aPos - aHome) * 2.4, 0., 1.) * (1. - dust);

  vec3 q = uRot * p;
  float persp = uCam / (uCam - q.z);
  gl_Position = vec4(q.xy * persp * uScale + uOffset, 0., 1.);

  float shade = max(aData.z, 0.);
  float front = (1. - dust) * step(shade, .001);
  float shimmer = .86 + .14 * sin(uTime * 1.7 + seed * 50. + aHome.x * 6.);
  vec3 cFront = mix(vec3(.81, .68, 1.), vec3(1.), shimmer * .75 + uLit * .25);
  vec3 cSide = mix(vec3(.6, .32, .98), vec3(.2, .05, .46), shade);
  vec3 col = mix(cSide, cFront, front);
  col = mix(col, vec3(.42, .2, .8), dust);
  col = mix(col, vec3(1., .56, .84), heat * .75);
  col = mix(col, vec3(1.), near * .45);
  vCol = col;

  float a = mix(.8 - shade * .35, 1., front);
  a = mix(a, .34 + .3 * sin(uTime * .6 + seed * 20.), dust);
  vAlpha = a * uFade;

  // at rest each cell keeps its character; disturbed ones scramble
  float busy = step(.18, near + heat);
  vGlyph = mod(aData.x + busy * floor(uTime * 16. + seed * 23.), uN);

  float size = uSize * aData.y * persp * (1. + near * .3 + heat * .35);
  if (uPass > .5) {
    // glow pass: only the front face and whatever is flying around
    float g = max(front, heat);
    size *= 3.2;
    vAlpha *= g * (.05 + near * .045 + heat * .03 + uLit * .015);
    if (g < .01) gl_Position = vec4(2., 2., 2., 1.);
  }
  gl_PointSize = size;
}`;

const FRAG = `
precision mediump float;
uniform sampler2D uAtlas;
uniform float uSlots, uPass;
varying float vGlyph, vAlpha;
varying vec3 vCol;
void main(){
  float a;
  if (uPass > .5) {
    float d = length(gl_PointCoord - .5);
    a = smoothstep(.5, 0., d);
    a *= a;
  } else {
    a = texture2D(uAtlas, vec2((vGlyph + gl_PointCoord.x) / uSlots, gl_PointCoord.y)).r;
  }
  a *= vAlpha;
  gl_FragColor = vec4(vCol * a, a);
}`;

const UNIFORMS = [
  "uRot",
  "uScale",
  "uOffset",
  "uMouse",
  "uCam",
  "uSize",
  "uTime",
  "uHover",
  "uFade",
  "uPass",
  "uN",
  "uLit",
  "uAtlas",
  "uSlots",
] as const;
type Uniforms = Record<(typeof UNIFORMS)[number], WebGLUniformLocation | null>;

interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** How model units map to clip space, and where the lockup rests on the page. */
interface View {
  sx: number;
  sy: number;
  ox: number;
  oy: number;
  w: number;
  h: number;
  rect?: Rect;
}

/** What `?debug` exposes to the test tools as `window.qhero`. */
interface HeroDebug {
  readonly count: number;
  readonly blast: boolean;
  /** the lockup at rest, in CSS px relative to the hero */
  readonly box: Rect | undefined;
  /** mean distance of the lockup's characters from their homes, in model units */
  spread(): number;
}

declare global {
  interface Window {
    qhero?: HeroDebug;
  }
}

const clamp = (v: number, a = 0, b = 1): number => Math.min(b, Math.max(a, v));
const smooth = (a: number, b: number, x: number): number => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

function context2d(
  canvas: HTMLCanvasElement,
  options?: CanvasRenderingContext2DSettings,
): CanvasRenderingContext2D {
  const ctx = canvas.getContext("2d", options);
  if (!ctx) throw new Error("2D canvas is not available");
  return ctx;
}

/**
 * The hero lockup. `canvas` sits in the hero section (its parent), which may
 * hold `.hero__status` and `.hero__foot`: the lockup is fitted between them.
 * The characters are set in the mono face the page gives the canvas.
 */
export async function initHero(
  canvas: HTMLCanvasElement,
  logoSrc: string,
): Promise<void> {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const context = canvas.getContext("webgl", {
    alpha: true,
    premultipliedAlpha: true,
    antialias: false,
  });
  const logo = new Image();
  logo.src = logoSrc;
  await logo.decode().catch(() => {});
  if (!context || !logo.naturalWidth) return fallback(canvas, logoSrc);
  const gl = context; // checked: the functions below get it without the null

  const prog = gl.createProgram();
  for (const [type, src] of [
    [gl.VERTEX_SHADER, VERT],
    [gl.FRAGMENT_SHADER, FRAG],
  ] as const) {
    const s = gl.createShader(type);
    if (!s) return fallback(canvas, logoSrc);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error(gl.getShaderInfoLog(s));
      return fallback(canvas, logoSrc);
    }
    gl.attachShader(prog, s);
  }
  gl.bindAttribLocation(prog, 0, "aPos");
  gl.bindAttribLocation(prog, 1, "aHome");
  gl.bindAttribLocation(prog, 2, "aData");
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error(gl.getProgramInfoLog(prog));
    return fallback(canvas, logoSrc);
  }
  gl.useProgram(prog);
  const u = Object.fromEntries(
    UNIFORMS.map((n) => [n, gl.getUniformLocation(prog, n)]),
  ) as Uniforms;
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE); // additive: overlapping characters glow
  gl.clearColor(0, 0, 0, 0);

  // the mono face, by the name the page itself resolved it to
  const mono = getComputedStyle(canvas).fontFamily || "monospace";
  await document.fonts.load(`700 16px ${mono}`).catch(() => {});

  // glyph atlas, one square cell per character
  {
    const atlas = document.createElement("canvas");
    atlas.width = ATLAS_CELL * ATLAS_SLOTS;
    atlas.height = ATLAS_CELL;
    const a = context2d(atlas);
    a.fillStyle = "#000";
    a.fillRect(0, 0, atlas.width, atlas.height);
    a.fillStyle = "#fff";
    a.font = `700 ${Math.round(ATLAS_CELL * 0.92)}px ${mono}`;
    a.textAlign = "center";
    a.textBaseline = "middle";
    for (let i = 0; i < GLYPHS.length; i++)
      a.fillText(GLYPHS[i], (i + 0.5) * ATLAS_CELL, ATLAS_CELL * 0.54);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(
      gl.TEXTURE_2D,
      gl.TEXTURE_MIN_FILTER,
      gl.LINEAR_MIPMAP_LINEAR,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.uniform1i(u.uAtlas, 0);
    gl.uniform1f(u.uSlots, ATLAS_SLOTS);
    gl.uniform1f(u.uN, GLYPHS.length);
  }

  const bufPos = gl.createBuffer();
  const bufStatic = gl.createBuffer();
  const parent = canvas.parentElement;
  if (!parent) throw new Error("the hero canvas has no parent element");
  const host = parent;
  const CAM = 3.2;
  gl.uniform1f(u.uCam, CAM);

  // ---- particles
  let count = 0;
  let pos = new Float32Array(0);
  let vel = new Float32Array(0);
  let home = new Float32Array(0);
  let seed = new Float32Array(0);
  let loose = new Float32Array(0);
  let wait = new Float32Array(0);
  let stiff = new Float32Array(0);
  let view: View = { sx: 1, sy: 1, ox: 0, oy: 0, w: 1, h: 1 };
  let built = "";

  function build(scatter: boolean): void {
    const cssW = canvas.clientWidth;
    const cssH = canvas.clientHeight;
    if (!cssW || !cssH) return;

    // the lockup: 80% of the width (phone: 94%), but never taller than the free
    // band between the status block above and the tag line below, so it does
    // not sit on top of the text (the Q is as tall as the whole logo file)
    const portrait = cssH > cssW;
    const ratio = logo.naturalHeight / logo.naturalWidth;
    const box = host.getBoundingClientRect();
    const above = host.querySelector(".hero__status");
    const below = host.querySelector(".hero__foot");
    const st = above ? above.getBoundingClientRect() : null;
    const bandBottom =
      (below ? below.getBoundingClientRect().top - box.top : cssH * 0.72) - 18;
    const widest = (portrait ? 0.94 : 0.8) * cssW;
    // either below the status block ...
    let bandTop = (st ? st.bottom - box.top : cssH * 0.2) + 18;
    let markPx = Math.min(widest, Math.max(90, bandBottom - bandTop) / ratio);
    let shift = 0; // px to the right of the middle
    if (st) {
      // ... or beside it: taller, moved a little to the right and narrowed until
      // its left edge clears the status text
      const top = st.top - box.top + 12;
      const clear = st.right - box.left + 28;
      const push = Math.min(
        0.04 * cssW,
        Math.max(0, clear - (cssW - widest) / 2),
      );
      const beside = Math.min(
        widest,
        Math.max(90, bandBottom - top) / ratio,
        cssW - 2 * (clear - push),
      );
      if (beside > markPx) {
        markPx = beside;
        bandTop = top;
        shift = Math.max(0, clear - (cssW - markPx) / 2);
      }
    }
    const frac = markPx / cssW;
    // Buffer scale. A phone has far fewer characters to draw and may be sharp;
    // a very large window gets a coarser buffer instead of several times the
    // work (the cost grows with the area the lockup covers).
    const dpr = Math.min(
      devicePixelRatio || 1,
      cssW < 700 ? 2 : 1.5,
      Math.sqrt(1.9e6 / (cssW * cssH)),
      Math.max(0.5, 1150 / markPx),
    );
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
    const cols = Math.round(clamp(markPx / (portrait ? 4.9 : 7.2), 56, 170)); // finer on a phone, or the letters clump
    const rowsAll = Math.round((cols * logo.naturalHeight) / logo.naturalWidth);
    const cell = 2 / cols; // model units: the lockup spans x from -1 to 1

    // coverage per cell, from the logo's alpha
    const mask = document.createElement("canvas");
    mask.width = cols;
    mask.height = rowsAll;
    const m = context2d(mask, { willReadFrequently: true });
    m.drawImage(logo, 0, 0, cols, rowsAll);
    m.clearRect(cols * 0.34, rowsAll * 0.76, cols, rowsAll); // "University of Mannheim" cannot resolve at this grain
    const alpha = m.getImageData(0, 0, cols, rowsAll).data;
    const filled = (c: number, r: number): boolean =>
      c >= 0 &&
      r >= 0 &&
      c < cols &&
      r < rowsAll &&
      alpha[(r * cols + c) * 4 + 3] > 110;

    let rMin = rowsAll;
    let rMax = 0;
    const cells: number[] = [];
    for (let r = 0; r < rowsAll; r++)
      for (let c = 0; c < cols; c++)
        if (filled(c, r)) {
          const edge =
            !filled(c - 1, r) ||
            !filled(c + 1, r) ||
            !filled(c, r - 1) ||
            !filled(c, r + 1);
          cells.push(c, r, edge ? 1 : 0);
          rMin = Math.min(rMin, r);
          rMax = Math.max(rMax, r);
        }
    const rMid = (rMin + rMax + 1) / 2;

    // side walls behind the front face: the body is about 9% as deep as it is wide
    const gap = cell * 1.5;
    const layers = Math.max(3, Math.round(0.18 / gap));
    const depth = layers * gap;
    const nDust = portrait ? 520 : 1300;
    let n = cells.length / 3;
    for (let i = 0; i < cells.length; i += 3) if (cells[i + 2]) n += layers;
    n += nDust;

    count = n;
    pos = new Float32Array(n * 3);
    vel = new Float32Array(n * 3);
    home = new Float32Array(n * 3);
    seed = new Float32Array(n);
    loose = new Float32Array(n);
    wait = new Float32Array(n);
    stiff = new Float32Array(n);
    const data = new Float32Array(n * 4);
    const dense = 10; // the first glyphs are the heavy ones
    let k = 0;
    const put = (
      x: number,
      y: number,
      z: number,
      glyph: number,
      size: number,
      shade: number,
      spring: number,
    ): void => {
      home[k * 3] = x;
      home[k * 3 + 1] = y;
      home[k * 3 + 2] = z;
      const s = Math.random();
      seed[k] = s;
      stiff[k] = spring;
      data[k * 4] = glyph;
      data[k * 4 + 1] = size;
      data[k * 4 + 2] = shade;
      data[k * 4 + 3] = s;
      k++;
    };
    for (let i = 0; i < cells.length; i += 3) {
      const x = ((cells[i] + 0.5) / cols) * 2 - 1;
      const y = -(cells[i + 1] + 0.5 - rMid) * cell;
      put(x, y, depth / 2, Math.floor(Math.random() * dense), 1, 0, 1);
      if (cells[i + 2])
        for (let l = 1; l <= layers; l++)
          put(
            x,
            y,
            depth / 2 - l * gap,
            dense + Math.floor(Math.random() * (GLYPHS.length - dense)),
            0.86,
            l / layers,
            1,
          );
    }
    const aspect = cssH / cssW / frac; // half height of the view in model units
    for (let i = 0; i < nDust; i++) {
      put(
        (Math.random() * 2 - 1) * (1.15 / frac),
        (Math.random() * 2 - 1) * aspect * 1.1,
        -1.5 + Math.random() * 2.1,
        dense + 4 + Math.floor(Math.random() * (GLYPHS.length - dense - 4)),
        0.7 + Math.random() * 0.6,
        -1,
        0.12,
      );
    }

    // start: assembled, or scattered for the entrance (left to right)
    for (let i = 0; i < n; i++) {
      const j = i * 3;
      if (scatter && data[i * 4 + 2] >= 0) {
        const a = Math.random() * Math.PI * 2;
        const rad = 0.5 + Math.random() * 1.6;
        pos[j] = home[j] * 0.4 + Math.cos(a) * rad;
        pos[j + 1] = home[j + 1] + Math.sin(a) * rad * 0.7;
        pos[j + 2] = -1.2 - Math.random() * 2.2;
        loose[i] = 1;
        wait[i] = 0.2 + (home[j] + 1) * 0.42 + seed[i] * 0.4;
      } else {
        pos[j] = home[j];
        pos[j + 1] = home[j + 1];
        pos[j + 2] = home[j + 2];
      }
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, bufStatic);
    const stat = new Float32Array(n * 7);
    for (let i = 0; i < n; i++) {
      stat.set(home.subarray(i * 3, i * 3 + 3), i * 7);
      stat.set(data.subarray(i * 4, i * 4 + 4), i * 7 + 3);
    }
    gl.bufferData(gl.ARRAY_BUFFER, stat, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 28, 0);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 28, 12);
    gl.bindBuffer(gl.ARRAY_BUFFER, bufPos);
    gl.bufferData(gl.ARRAY_BUFFER, pos, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

    const bodyH = (rMax - rMin + 1) * (markPx / cols);
    view = {
      sx: frac,
      sy: (frac * cssW) / cssH,
      ox: (2 * shift) / cssW,
      oy: 1 - (bandTop + bandBottom) / cssH,
      w: cssW,
      h: cssH,
      rect: {
        left: (cssW - markPx) / 2 + shift,
        top: (bandTop + bandBottom) / 2 - bodyH / 2,
        width: markPx,
        height: bodyH,
      },
    };
    gl.uniform2f(u.uScale, view.sx, view.sy);
    gl.uniform2f(u.uOffset, view.ox, view.oy);
    gl.uniform1f(u.uSize, (markPx / cols) * 1.55 * dpr);
    built = `${cssW}x${cssH}`;
  }

  // ---- pointer
  const mouse = {
    x: 0,
    y: 0,
    mx: 9,
    my: 9,
    inside: false,
    hover: 0,
    rx: 0,
    ry: 0,
  };
  const blast = { on: false, since: 0, radius: 0, x: 0, y: 0 };
  const toModel = (ev: PointerEvent): void => {
    const r = canvas.getBoundingClientRect();
    const cx = ((ev.clientX - r.left) / r.width) * 2 - 1;
    const cy = 1 - ((ev.clientY - r.top) / r.height) * 2;
    mouse.x = cx;
    mouse.y = cy;
    mouse.mx = (cx - view.ox) / view.sx;
    mouse.my = (cy - view.oy) / view.sy;
  };
  host.addEventListener("pointermove", (ev) => {
    toModel(ev);
    mouse.inside = true;
    kick();
  });
  host.addEventListener("pointerleave", () => {
    mouse.inside = false;
    blast.on = false;
  });
  host.addEventListener("pointerdown", (ev) => {
    if (
      reduce ||
      ev.button > 0 ||
      (ev.target instanceof Element && ev.target.closest("a, button, input"))
    )
      return;
    toModel(ev);
    mouse.inside = true;
    blast.on = true;
    blast.since = performance.now();
    // the first hit: a kick outwards from the cursor
    for (let i = 0, j = 0; i < count; i++, j += 3) {
      const dx = pos[j] - mouse.mx;
      const dy = pos[j + 1] - mouse.my;
      const d = Math.hypot(dx, dy) + 1e-4;
      if (d > 0.34) continue;
      const f = (1 - d / 0.34) ** 2 * (1.5 + seed[i] * 1.7);
      vel[j] += (dx / d) * f;
      vel[j + 1] += (dy / d) * f;
      vel[j + 2] += (seed[i] - 0.35) * f * 2.2;
      loose[i] = 1;
      wait[i] = 0.1 + seed[i] * 0.45;
    }
    if (ev.pointerType === "mouse") ev.preventDefault(); // no text selection while holding
    kick();
  });
  const release = (): void => {
    blast.on = false;
  };
  addEventListener("pointerup", release);
  addEventListener("pointercancel", release);
  addEventListener("blur", release);

  // ---- frame
  let running = false;
  let raf = 0;
  let last = 0;
  const rot = new Float32Array(9);

  function physics(dt: number, t: number, crumble: number): void {
    const held = blast.on;
    const R = held
      ? 0.18 + 0.62 * smooth(0, 1800, performance.now() - blast.since)
      : 0;
    const R2 = R * R;
    const bx = mouse.mx;
    const by = mouse.my;
    const hov = mouse.inside && !held ? 1 : 0;
    for (let i = 0, j = 0; i < count; i++, j += 3) {
      const x = pos[j];
      const y = pos[j + 1];
      const z = pos[j + 2];
      const sd = seed[i];
      const dx = x - bx;
      const dy = y - by;
      const d2 = dx * dx + dy * dy;
      let ax = 0;
      let ay = 0;
      let az = 0;

      if (held && d2 < R2) {
        // inside the blast: pushed out, churned, and cut loose from its home
        const d = Math.sqrt(d2) + 1e-4;
        const f = (1 - d / R) * (1 - d / R) * 13;
        ax +=
          (dx / d) * f + Math.sin(y * 9 + t * 3.1 + sd * 6.3) * (f * 0.5 + 1.2);
        ay +=
          (dy / d) * f + Math.cos(x * 8 - t * 2.7 + sd * 5.1) * (f * 0.5 + 1.2);
        az += (sd - 0.45) * (f * 1.1 + 2.0);
        loose[i] = 1;
        wait[i] = 0.08 + sd * 0.5;
      } else if (loose[i] > 0) {
        if (wait[i] > 0) wait[i] -= dt;
        else loose[i] = Math.max(0, loose[i] - dt * 1.5);
      } else if (hov && d2 < 0.03) {
        // hovering: the characters lean away from the cursor a little
        const d = Math.sqrt(d2) + 1e-4;
        const f = (1 - d2 / 0.03) * 1.7;
        ax += (dx / d) * f;
        ay += (dy / d) * f;
      }

      const l = Math.max(loose[i], crumble * (0.55 + 0.45 * sd));
      const kSpring = 46 * stiff[i] * (1 - 0.965 * l);
      ax += (home[j] - x) * kSpring;
      ay += (home[j + 1] - y) * kSpring;
      az += (home[j + 2] - z) * kSpring;
      if (l > 0.01) {
        // loose particles drift: a slow churn, and gravity when the page scrolls on
        ax += Math.sin(y * 7 + t * 1.7 + sd * 20) * 0.5 * l;
        ay +=
          Math.cos(x * 6 - t * 1.3 + sd * 17) * 0.5 * l -
          crumble * (1.6 + sd * 2.4);
        az += Math.sin(x * 5 + y * 4 + t) * 0.4 * l;
      }
      const damp = Math.exp(-(5.4 - 3.9 * l) * dt);
      const vx = (vel[j] + ax * dt) * damp;
      const vy = (vel[j + 1] + ay * dt) * damp;
      const vz = (vel[j + 2] + az * dt) * damp;
      vel[j] = vx;
      vel[j + 1] = vy;
      vel[j + 2] = vz;
      pos[j] = x + vx * dt;
      pos[j + 1] = y + vy * dt;
      pos[j + 2] = Math.min(z + vz * dt, CAM - 1.5); // never close to the camera
    }
  }

  function frame(now: number): void {
    raf = 0;
    // real time, in steps the springs can take: a slow device must not show slow motion
    let left = Math.min(0.1, (now - (last || now)) / 1000);
    last = now;
    const t = now / 1000;

    // how far the hero has scrolled out: the body crumbles and fades
    const r = host.getBoundingClientRect();
    const gone = clamp(-r.top / r.height);
    const crumble = smooth(0.12, 0.75, gone);

    while (!reduce && left > 1e-4) {
      const dt = Math.min(1 / 30, left);
      physics(dt, t, crumble);
      left -= dt;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, bufPos);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, pos);

    // the body turns towards the cursor; without one it sways on its own
    const idle = reduce ? 0 : 1;
    const targetY = mouse.inside
      ? mouse.x * 0.36
      : Math.sin(t * 0.45) * 0.2 * idle;
    const targetX = mouse.inside
      ? -mouse.y * 0.17
      : Math.sin(t * 0.31) * 0.05 * idle;
    mouse.ry += (targetY - mouse.ry) * 0.06;
    mouse.rx += (targetX - mouse.rx) * 0.06;
    mouse.hover += ((mouse.inside ? 1 : 0) - mouse.hover) * 0.1;
    const cy = Math.cos(mouse.ry);
    const sy = Math.sin(mouse.ry);
    const cx = Math.cos(mouse.rx);
    const sx = Math.sin(mouse.rx);
    // column-major Ry * Rx
    rot.set([cy, 0, -sy, sy * sx, cx, cy * sx, sy * cx, -sx, cy * cx]);
    gl.uniformMatrix3fv(u.uRot, false, rot);
    gl.uniform3f(u.uMouse, mouse.mx, mouse.my, 0);
    gl.uniform1f(u.uHover, mouse.hover);
    gl.uniform1f(u.uLit, mouse.hover * (blast.on ? 1 : 0.6));
    gl.uniform1f(u.uTime, reduce ? 0 : t);
    gl.uniform1f(u.uFade, 1 - smooth(0.5, 0.98, gone));

    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform1f(u.uPass, 1);
    gl.drawArrays(gl.POINTS, 0, count);
    gl.uniform1f(u.uPass, 0);
    gl.drawArrays(gl.POINTS, 0, count);

    if (running && !reduce) raf = requestAnimationFrame(frame);
  }
  const kick = (): void => {
    if (!raf && count) raf = requestAnimationFrame(frame);
  };

  let resizeTimer = 0;
  new ResizeObserver(() => {
    if (built === `${canvas.clientWidth}x${canvas.clientHeight}`) return;
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(
      () => {
        build(false);
        kick();
      },
      built ? 160 : 0,
    );
  }).observe(canvas);
  new IntersectionObserver(([entry]) => {
    running = entry.isIntersecting;
    last = 0;
    if (running) kick();
  }).observe(canvas);
  document.addEventListener("visibilitychange", () => {
    last = 0;
    if (!document.hidden && running) kick();
  });

  build(!reduce);
  kick();

  if (new URLSearchParams(location.search).has("debug")) {
    window.qhero = {
      get count() {
        return count;
      },
      get blast() {
        return blast.on;
      },
      get box() {
        return view.rect;
      },
      spread() {
        let s = 0;
        let n = 0;
        for (let i = 0, j = 0; i < count; i++, j += 3) {
          if (stiff[i] < 1) continue;
          s += Math.hypot(
            pos[j] - home[j],
            pos[j + 1] - home[j + 1],
            pos[j + 2] - home[j + 2],
          );
          n++;
        }
        return s / n;
      },
    };
  }
}

function fallback(canvas: HTMLCanvasElement, logoSrc: string): void {
  const img = new Image();
  img.src = logoSrc;
  img.alt = "";
  img.style.cssText =
    "position:absolute;left:50%;top:46%;width:min(80%,60rem);height:auto;transform:translate(-50%,-50%);z-index:-1";
  canvas.replaceWith(img);
}
