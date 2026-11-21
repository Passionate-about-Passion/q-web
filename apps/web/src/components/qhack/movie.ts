// Aftermovie: until somebody presses play, the film runs muted as live ASCII
// in its own colors. One fullscreen quad; per character cell the shader
//   - averages the film's color,
//   - picks a character by brightness from a long ramp,
//   - replaces it with a stroke ( | / - \ ) where the picture has a contour,
// which is what makes faces and shapes readable at this grain.
// Under the cursor a lens shows the real film. Pressing play sends a wave out
// from the button: the characters scramble, burn out, and the film is there.
//
// The stage holds the `video`, a `canvas` and the `.movie__play` button. The
// window around it (`.term`) may carry a `[data-movie-state]` label.

import { rgb } from "./palette";

const FILL = " .`'-:;~+=*!?[]#%$&@8"; // light to heavy, measured by eye in JetBrains Mono
const STROKES = "|/-\\";
const SLOTS = FILL.length + STROKES.length;

const VERT = `attribute vec2 p; void main(){ gl_Position = vec4(p, 0., 1.); }`;

const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D uVideo, uAtlas;
uniform vec2 uRes, uCell, uOrigin, uMouse;
uniform vec4 uSrc;
uniform float uN, uSlots, uTime, uReveal, uLens;

vec3 film(vec2 uv){ return texture2D(uVideo, uSrc.xy + clamp(uv, 0., 1.) * uSrc.zw).rgb; }
float luma(vec3 c){ return dot(c, vec3(.299, .587, .114)); }
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }

void main(){
  vec2 frag = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  vec2 uv = frag / uRes;
  vec2 cell = floor(frag / uCell);
  vec2 local = fract(frag / uCell);
  vec2 px = uCell / uRes;
  vec2 cuv = (cell + .5) * px;

  vec3 c = (film(cuv + px * vec2(-.25, -.25)) + film(cuv + px * vec2(.25, -.25))
          + film(cuv + px * vec2(-.25, .25)) + film(cuv + px * vec2(.25, .25))) * .25;
  float l = luma(c);

  // contours: Sobel over the neighboring cells
  float l00 = luma(film(cuv + px * vec2(-1., -1.)));
  float l10 = luma(film(cuv + px * vec2( 0., -1.)));
  float l20 = luma(film(cuv + px * vec2( 1., -1.)));
  float l01 = luma(film(cuv + px * vec2(-1.,  0.)));
  float l21 = luma(film(cuv + px * vec2( 1.,  0.)));
  float l02 = luma(film(cuv + px * vec2(-1.,  1.)));
  float l12 = luma(film(cuv + px * vec2( 0.,  1.)));
  float l22 = luma(film(cuv + px * vec2( 1.,  1.)));
  float gx = (l20 + 2. * l21 + l22) - (l00 + 2. * l01 + l02);
  float gy = (l02 + 2. * l12 + l22) - (l00 + 2. * l10 + l20);
  float mag = length(vec2(gx, gy));

  float v = pow(clamp(l * 1.3, 0., 1.), .78);
  float gi = floor(min(v, .999) * uN);
  if (mag > .3 && l > .05) {
    float a = fract(atan(gy, gx) / 3.14159265 + 1.);
    gi = uN + mod(floor(a * 4. + .5), 4.);
  }

  // the play wave, and the lens under the cursor
  float rnd = hash(cell);
  float dist = length((frag - uOrigin) / uRes.x);
  float wave = clamp((uReveal * 1.95 - dist * 1.25 - rnd * .22) / .3, 0., 1.);
  float front = wave * (1. - wave) * 4.;
  float dm = length((frag - uMouse) / uRes.x);
  float lens = uLens * smoothstep(.1, .075, dm);
  if (front > .06) gi = floor(hash(cell + floor(uTime * 24.)) * (uN + 3.9));

  float glyph = texture2D(uAtlas, vec2((gi + local.x) / uSlots, local.y)).r;

  // the film's own color, lifted so dark scenes still read; the picture
  // itself sits dimly behind the characters
  float peak = max(c.r, max(c.g, c.b));
  vec3 hue = c / max(peak, .1);
  vec3 ink = mix(c, hue, .5) * (.5 + .8 * v);
  vec3 col = ink * glyph * 1.2 + c * .2;
  col += front * glyph * vec3(.9, .78, 1.) * 1.4;
  col += uLens * smoothstep(.006, 0., abs(dm - .1)) * vec3(.81, .68, 1.) * .45;

  gl_FragColor = vec4(mix(col, film(uv), max(wave, lens)), 1.);
}`;

const UNIFORMS = [
  "uVideo",
  "uAtlas",
  "uRes",
  "uCell",
  "uOrigin",
  "uMouse",
  "uSrc",
  "uN",
  "uSlots",
  "uTime",
  "uReveal",
  "uLens",
] as const;
type Uniforms = Record<(typeof UNIFORMS)[number], WebGLUniformLocation | null>;

type MovieState = "ascii" | "revealing" | "playing";

/** What `?debug` exposes to the test tools as `window.qmovie`. */
interface MovieDebug {
  readonly state: MovieState;
  readonly reveal: number;
  video: HTMLVideoElement;
}

declare global {
  interface Window {
    qmovie?: MovieDebug;
  }
}

const clamp = (v: number, a = 0, b = 1): number => Math.min(b, Math.max(a, v));
const ease = (t: number): number =>
  t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

function need<T extends Element>(root: ParentNode, selector: string): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`the aftermovie stage has no "${selector}"`);
  return el;
}

export function initMovie(
  stage: HTMLElement,
  { reduce = false }: { reduce?: boolean } = {},
): void {
  const video = need<HTMLVideoElement>(stage, "video");
  const canvas = need<HTMLCanvasElement>(stage, "canvas");
  const button = need<HTMLElement>(stage, ".movie__play");
  const context = canvas.getContext("webgl", {
    alpha: false,
    antialias: false,
  });

  // without WebGL: the poster, and play simply starts the film
  const plain = (): void => {
    stage.classList.add("is-plain");
    button.addEventListener("click", () => {
      stage.classList.add("is-playing");
      video.controls = true;
      video.muted = false;
      video.loop = false;
      video.play().catch(() => {});
    });
  };
  if (!context) return plain();
  const gl = context; // checked: the functions below get it without the null

  const prog = gl.createProgram();
  for (const [type, src] of [
    [gl.VERTEX_SHADER, VERT],
    [gl.FRAGMENT_SHADER, FRAG],
  ] as const) {
    const s = gl.createShader(type);
    if (!s) return plain();
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error(gl.getShaderInfoLog(s));
      return plain();
    }
    gl.attachShader(prog, s);
  }
  gl.bindAttribLocation(prog, 0, "p");
  gl.linkProgram(prog);
  gl.useProgram(prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW,
  );
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const u = Object.fromEntries(
    UNIFORMS.map((n) => [n, gl.getUniformLocation(prog, n)]),
  ) as Uniforms;
  const tex = (unit: number, filter: number): void => {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  };
  tex(0, gl.LINEAR);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    1,
    1,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    new Uint8Array([...rgb("hack-night"), 255]),
  );
  tex(1, gl.NEAREST);
  gl.uniform1i(u.uVideo, 0);
  gl.uniform1i(u.uAtlas, 1);
  gl.uniform1f(u.uN, FILL.length);
  gl.uniform1f(u.uSlots, SLOTS);
  gl.uniform4f(u.uSrc, 0, 0, 1, 1);

  // the mono face, by the name the page itself resolved it to
  const mono = getComputedStyle(stage).fontFamily || "monospace";

  let state: MovieState = "ascii"; // ascii → revealing → playing → (ended) → ascii
  let visible = false;
  let raf = 0;
  let lastTime = -1;
  let reveal = 0;
  let revealFrom = 0;
  let revealTo = 0;
  let revealStart = 0;
  let lens = 0;
  let lensTarget = 0;
  const REVEAL_MS = 1400;

  let scale = 1; // canvas pixels per CSS pixel
  function layout(): void {
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    if (!w || !h) return;
    scale = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    gl.viewport(0, 0, canvas.width, canvas.height);
    // about 190 characters across on a desktop, never smaller than legible
    const cellW = Math.max(3, Math.round(clamp(w / 190, 4.4, 7) * scale));
    const cellH = Math.round(cellW / 0.6);
    gl.uniform2f(u.uRes, canvas.width, canvas.height);
    gl.uniform2f(u.uCell, cellW, cellH);

    const atlas = document.createElement("canvas");
    atlas.width = cellW * SLOTS;
    atlas.height = cellH;
    const a = atlas.getContext("2d");
    if (!a) return;
    a.fillStyle = "#000";
    a.fillRect(0, 0, atlas.width, atlas.height);
    a.fillStyle = "#fff";
    a.font = `800 ${Math.round(cellH * 0.98)}px ${mono}`;
    a.textAlign = "center";
    a.textBaseline = "middle";
    const all = FILL + STROKES;
    for (let i = 0; i < all.length; i++)
      a.fillText(all[i], (i + 0.5) * cellW, cellH * 0.53);
    gl.activeTexture(gl.TEXTURE1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas);
    crop();
    kick();
  }
  // the file is 16:9 with the picture letterboxed inside: show only the picture band
  let srcW = 0;
  let srcH = 0;
  function crop(
    w = video.videoWidth || srcW,
    h = video.videoHeight || srcH,
  ): void {
    if (!w || !h || !stage.clientHeight) return;
    srcW = w;
    srcH = h;
    const band = Math.min(1, w / (stage.clientWidth / stage.clientHeight) / h);
    gl.uniform4f(u.uSrc, 0, (1 - band) / 2, 1, band);
  }
  // Until the film delivers its first frame the poster stands in. It stays if
  // the browser does not let the film start by itself (an iPhone in low power
  // mode, for one), so the stage is never empty.
  if (video.poster) {
    const poster = new Image();
    poster.onload = () => {
      if (lastTime >= 0) return;
      gl.activeTexture(gl.TEXTURE0);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        poster,
      );
      crop(poster.naturalWidth, poster.naturalHeight);
      kick();
    };
    poster.src = video.poster;
  }

  function frame(now: number): void {
    raf = 0;
    if (video.readyState >= 2 && video.currentTime !== lastTime) {
      lastTime = video.currentTime;
      gl.activeTexture(gl.TEXTURE0);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        video,
      );
    }
    if (revealStart) {
      const t = clamp((now - revealStart) / REVEAL_MS);
      reveal = revealFrom + (revealTo - revealFrom) * ease(t);
      if (revealTo === 1) video.volume = t;
      if (t === 1) {
        revealStart = 0;
        if (revealTo === 1) settle();
      }
    }
    lens += (lensTarget - lens) * 0.14;
    gl.uniform1f(u.uTime, now / 1000);
    gl.uniform1f(u.uReveal, reveal);
    gl.uniform1f(u.uLens, state === "ascii" ? lens : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (visible && state !== "playing" && !reduce)
      raf = requestAnimationFrame(frame);
  }
  function kick(): void {
    if (!raf) raf = requestAnimationFrame(frame);
  }

  // what the window bar says about the picture
  const stateLabel =
    stage.closest(".term")?.querySelector("[data-movie-state]") ?? null;
  const say = (text: string): void => {
    if (stateLabel) stateLabel.textContent = text;
  };

  // the wave has passed: hand over to the real player
  function settle(): void {
    say("the film · sound on");
    state = "playing";
    stage.classList.add("is-playing");
    stage.classList.remove("is-revealing");
    video.controls = true;
    video.volume = 1;
    video.focus({ preventScroll: true });
  }

  button.addEventListener("click", () => {
    if (state !== "ascii") return;
    const r = canvas.getBoundingClientRect();
    const b = button.getBoundingClientRect();
    gl.uniform2f(
      u.uOrigin,
      (b.left + b.width / 2 - r.left) * scale,
      (b.top + b.height / 2 - r.top) * scale,
    );
    video.loop = false;
    video.currentTime = 0;
    video.muted = false;
    video.volume = reduce ? 1 : 0;
    video.play().catch(() => {});
    stage.classList.add("is-revealing");
    if (reduce) {
      reveal = 1;
      return settle();
    }
    state = "revealing";
    revealFrom = reveal;
    revealTo = 1;
    revealStart = performance.now();
    kick();
  });

  // when the film is over the characters grow back
  video.addEventListener("ended", () => {
    if (state !== "playing") return;
    state = "ascii";
    stage.classList.remove("is-playing");
    say("ascii preview");
    video.controls = false;
    video.loop = true;
    video.muted = true;
    video.currentTime = 0;
    if (visible && !reduce) video.play().catch(() => {});
    revealFrom = reduce ? 0 : 1;
    reveal = revealFrom;
    revealTo = 0;
    revealStart = reduce ? 0 : performance.now();
    kick();
  });

  stage.addEventListener("pointermove", (ev) => {
    if (ev.pointerType !== "mouse" || state !== "ascii") return;
    const r = canvas.getBoundingClientRect();
    gl.uniform2f(
      u.uMouse,
      (ev.clientX - r.left) * scale,
      (ev.clientY - r.top) * scale,
    );
    lensTarget = ev.target === button ? 0 : 1;
    kick();
  });
  stage.addEventListener("pointerleave", () => (lensTarget = 0));

  video.addEventListener("loadedmetadata", () => crop());
  video.addEventListener("loadeddata", kick);
  video.addEventListener("seeked", kick);
  new ResizeObserver(layout).observe(stage);
  new IntersectionObserver(
    ([e]) => {
      visible = e.isIntersecting;
      if (state === "playing") return;
      if (visible) {
        if (!reduce) video.play().catch(() => {});
        kick();
      } else video.pause();
    },
    { threshold: 0.15 },
  ).observe(stage);

  document.fonts.load(`800 16px ${mono}`).then(layout, layout);
  if (reduce) video.preload = "auto"; // one still frame is enough, but it has to be there

  if (new URLSearchParams(location.search).has("debug")) {
    window.qmovie = {
      get state() {
        return state;
      },
      get reveal() {
        return reveal;
      },
      video,
    };
  }
}
