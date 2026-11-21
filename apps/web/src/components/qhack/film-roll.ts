// Impressions: a real roll of 35 mm film, seen head on. One photo sits large
// and sharp in the middle; its neighbors bend away into the depth and blur
// with distance, like a lens focused on the front frame. The roll moves on
// by itself, one frame at a time; drag it (with inertia), click a frame, or
// use the buttons.

import {
  BackSide,
  BoxGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DataTexture,
  DoubleSide,
  Fog,
  FrontSide,
  Group,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  NeutralToneMapping,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  Raycaster,
  RepeatWrapping,
  REVISION,
  Scene,
  SRGBColorSpace,
  TextureLoader,
  Vector2,
  WebGLRenderer,
  type Material,
  type Side,
  type Texture,
} from "three";
import { token } from "./palette";

export interface FilmPhoto {
  src: string;
  caption: string;
}

export interface FilmOptions {
  canvas: HTMLCanvasElement;
  photos: FilmPhoto[];
  /** the line under the roll: number and caption of the photo in the middle */
  caption: HTMLElement;
  prev: HTMLElement;
  next: HTMLElement;
}

type FrameMesh = Mesh<CylinderGeometry, MeshPhysicalMaterial>;
type Ease = (t: number) => number;
interface Tween {
  from: number;
  to: number;
  t0: number;
  dur: number;
  ease: Ease;
}

/** What `?debug` exposes to the test tools as `window.qfilm`. */
interface FilmDebug {
  goTo: (index: number, pause?: number) => void;
  readonly angle: number;
}

declare global {
  interface Window {
    qfilm?: FilmDebug;
  }
}

const FRAME_W = 1;
const FRAME_H = 2 / 3;
const GAP = 0.07;
const BAND_H = 0.94;
const FLOW = 5.6; // seconds per photo while the roll runs by itself: time to look at each
const PAUSE = 2600; // ms it waits after somebody touched it

function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas is not available");
  return ctx;
}

// Swap one piece of a built-in three.js shader for another. Those shaders
// change between three.js releases, and a piece that is gone would leave the
// effect silently switched off: development says so.
function swap(source: string, piece: string, replacement: string): string {
  if (import.meta.env.DEV && !source.includes(piece)) {
    console.warn(
      `Q-Hack film roll: the shader of three.js r${REVISION} has no "${piece}", a patch was skipped`,
    );
  }
  return source.replace(piece, replacement);
}

export function initFilm({
  canvas,
  photos: list,
  caption,
  prev,
  next,
}: FilmOptions): void {
  // A very short set goes around the ring twice, or the ring gets too tight.
  // Around a dozen photos give the curve that makes the neighbors fall away
  // into the depth.
  const unique = list.length;
  const photos = unique < 9 ? [...list, ...list] : list;
  const N = photos.length;
  const pitch = FRAME_W + GAP;
  const R = (N * pitch) / (Math.PI * 2);
  const stepAngle = (Math.PI * 2) / N;
  const pad = (n: number): string => String(n).padStart(2, "0");
  // the mono face, by the name the page itself resolved it to
  const mono = getComputedStyle(canvas).fontFamily || "monospace";

  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.toneMapping = NeutralToneMapping;
  renderer.setClearColor(0x000000, 0);

  const scene = new Scene();
  scene.environment = softboxes(renderer);
  scene.environmentIntensity = 0.9;
  const camera = new PerspectiveCamera(32, 2, 0.1, 40);
  const fog = new Fog(token("hack-night"), 2.4, 5.2);
  scene.fog = fog;
  // On a wide stage the roll is an oval rather than a circle: the frames fan
  // out sideways and fall away less steeply (see resize).
  const oval = new Group();
  scene.add(oval);
  const ring = new Group();
  oval.add(ring);

  // Depth of field without a post pass: everything behind the focal distance
  // reads its texture from a coarser mip level. Free, and it holds 60 fps on
  // integrated graphics.
  const lens = { uFocus: { value: 2 }, uBlur: { value: 5.5 } };
  const depthBlur = <M extends Material>(material: M): M => {
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uFocus = lens.uFocus;
      shader.uniforms.uBlur = lens.uBlur;
      let fragment = shader.fragmentShader;
      fragment = swap(
        fragment,
        "#include <common>",
        `#include <common>
          uniform float uFocus;
          uniform float uBlur;
          float filmLod() { return clamp((length(vViewPosition) - uFocus) * uBlur, 0.0, 4.5); }`,
      );
      fragment = swap(
        fragment,
        "#include <map_fragment>",
        `#ifdef USE_MAP
            diffuseColor *= texture2D(map, vMapUv, filmLod());
          #endif`,
      );
      fragment = swap(
        fragment,
        "#include <emissivemap_fragment>",
        `#ifdef USE_EMISSIVEMAP
            totalEmissiveRadiance *= texture2D(emissiveMap, vEmissiveMapUv, filmLod()).rgb;
          #endif`,
      );
      shader.fragmentShader = fragment;
    };
    return material;
  };

  // ---- film base: one long strip with holes, rebates and edge print
  const strip = document.createElement("canvas");
  const FW = 256; // pixels per frame pitch
  strip.width = N * FW;
  strip.height = Math.round((FW * BAND_H) / pitch);
  const g = context2d(strip);
  const SHh = strip.height;
  const base = g.createLinearGradient(0, 0, 0, SHh);
  base.addColorStop(0, "#1b1226");
  base.addColorStop(0.5, "#120a1c");
  base.addColorStop(1, "#1b1226");
  g.fillStyle = base;
  g.fillRect(0, 0, strip.width, SHh);
  const holeW = 15;
  const holeH = 21;
  const frameTop = (SHh - (FW * FRAME_H) / pitch) / 2;
  for (let i = 0; i < N; i++) {
    const x0 = i * FW;
    // rebate around the picture
    g.fillStyle = "#08040f";
    g.fillRect(
      x0 + (FW * GAP) / pitch / 2 - 3,
      frameTop - 3,
      (FW * FRAME_W) / pitch + 6,
      (FW * FRAME_H) / pitch + 6,
    );
    // edge print
    g.fillStyle = "#c9a6ff";
    g.font = `700 11px ${mono}`;
    g.textBaseline = "middle";
    g.fillText(`${pad(i + 1)}`, x0 + 22, frameTop - 12);
    g.fillText(
      i % 2 ? "Q-HACK 400" : `▸ ${pad(i + 1)}A`,
      x0 + 96,
      SHh - frameTop + 12,
    );
    // perforation: eight holes per frame, top and bottom
    for (let k = 0; k < 8; k++) {
      const hx = x0 + (k + 0.5) * (FW / 8) - holeW / 2;
      for (const hy of [7, SHh - 7 - holeH]) {
        g.save();
        roundRect(g, hx, hy, holeW, holeH, 4);
        g.clip();
        g.clearRect(hx - 1, hy - 1, holeW + 2, holeH + 2);
        g.restore();
      }
    }
  }
  const stripTex = new CanvasTexture(strip);
  stripTex.colorSpace = SRGBColorSpace;
  stripTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  stripTex.wrapS = RepeatWrapping;
  // u = 0 sits at the seam between the last and the first frame
  stripTex.offset.x = 0.5 / N;
  const band = new Mesh(
    new CylinderGeometry(R - 0.004, R - 0.004, BAND_H, N * 10, 1, true),
    depthBlur(
      new MeshPhysicalMaterial({
        map: stripTex,
        alphaTest: 0.5,
        side: DoubleSide,
        roughness: 0.3,
        metalness: 0,
        clearcoat: 1,
        clearcoatRoughness: 0.12,
      }),
    ),
  );
  ring.add(band);

  // ---- the frames: curved, backlit
  // Every frame starts with a dark stand-in picture. The shader is then the
  // final one from the start and can be compiled ahead; a photo that arrives
  // later only swaps the texture.
  const blank = new DataTexture(new Uint8Array([36, 26, 51, 255]), 1, 1);
  blank.colorSpace = SRGBColorSpace;
  blank.needsUpdate = true;
  const arc = FRAME_W / R;
  const loader = new TextureLoader();
  const frames = photos.map((_photo, i): FrameMesh => {
    const mat = depthBlur(
      new MeshPhysicalMaterial({
        map: blank,
        emissiveMap: blank,
        emissive: 0xffffff,
        emissiveIntensity: 0,
        roughness: 0.25,
        clearcoat: 1,
        clearcoatRoughness: 0.1,
        side: DoubleSide,
      }),
    );
    const mesh = new Mesh(
      new CylinderGeometry(
        R,
        R,
        FRAME_H,
        12,
        1,
        true,
        i * stepAngle - arc / 2,
        arc,
      ),
      mat,
    );
    mesh.userData.index = i;
    ring.add(mesh);
    return mesh;
  });
  let loaded = false;
  function loadPhotos(): void {
    if (loaded) return;
    loaded = true;
    frames.forEach((mesh, i) => {
      loader.load(photos[i].src, (t) => {
        t.colorSpace = SRGBColorSpace;
        t.anisotropy = renderer.capabilities.getMaxAnisotropy();
        mesh.material.map = t;
        mesh.material.emissiveMap = t;
        mesh.material.emissiveIntensity = 0.62;
      });
    });
  }

  // ---- motion: by itself the roll flows without ever stopping, only a little
  // slower while a photo passes the middle. After a drag, a click or a button
  // it settles on a frame, waits, and flows on.
  let angle = 0;
  let vel = 0;
  let tween: Tween | null = null;
  let nextAuto = performance.now() + 400;
  let flow = 0; // 0..1: eases the run in after a pause
  let lastFrame = 0;
  let dragging = false;
  let moved = 0;
  let lastX = 0;
  let lastT = 0;
  let visible = false;
  let ready = false; // shaders compiled: frames may be drawn
  let shown = -1;
  let anglePerPx = 0.002;
  const ray = new Raycaster();
  const ndc = new Vector2();
  const easeOut: Ease = (t) => 1 - Math.pow(1 - t, 3);

  const frontIndex = (): number =>
    ((Math.round(-angle / stepAngle) % N) + N) % N;
  const glideTo = (
    to: number,
    dur: number,
    ease: Ease,
    pause = PAUSE,
  ): void => {
    tween = { from: angle, to, t0: performance.now(), dur, ease };
    nextAuto = performance.now() + dur + pause;
  };
  function goTo(index: number, pause = 3600): void {
    // shortest way round
    let diff = (-index * stepAngle - angle) % (Math.PI * 2);
    if (diff > Math.PI) diff -= Math.PI * 2;
    if (diff < -Math.PI) diff += Math.PI * 2;
    glideTo(angle + diff, 800, easeOut, pause);
  }

  function resize(): void {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    // a very wide stage gets a coarser buffer instead of several times the work
    renderer.setPixelRatio(
      Math.min(devicePixelRatio || 1, 1.75, Math.sqrt(1.5e6 / (w * h))),
    );
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // the center frame takes about 60% of the height; on a narrow stage the
    // camera steps back until one and a half frames fit
    const tanHalf = Math.tan(MathUtils.degToRad(camera.fov / 2));
    const dist = Math.max(1.9, (FRAME_W * 1.5) / (2 * tanHalf * camera.aspect));
    const depth = camera.aspect > 2 ? 0.56 : 1; // 1 is a circle; a wide stage gets the oval
    oval.scale.z = depth;
    camera.position.set(0, 0.16, R * depth + dist);
    camera.lookAt(0, 0, R * depth);
    camera.updateProjectionMatrix();
    // the photo in the middle is in focus; the neighbors fall out of it
    // quickly (more so on a narrow stage, where less of them is in view)
    lens.uFocus.value = dist + 0.14;
    lens.uBlur.value = camera.aspect < 1.7 ? 8 : depth < 1 ? 9.5 : 5.5; // the oval is shallower: more blur per depth
    fog.near = dist + 0.2;
    fog.far = dist + 2.7;
    anglePerPx = (2 * tanHalf * dist) / (h * R);
  }

  function frame(now: number): void {
    if (!visible || !ready) return;
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - (lastFrame || now)) / 1000);
    lastFrame = now;
    if (dragging) flow = 0;
    else if (tween) {
      flow = 0;
      const k = Math.min(1, (now - tween.t0) / tween.dur);
      angle = tween.from + (tween.to - tween.from) * tween.ease(k);
      if (k === 1) tween = null;
    } else if (now > nextAuto) {
      flow = Math.min(1, flow + dt / 1.8);
      const phase = (((-angle / stepAngle) % 1) + 1) % 1; // 0 when a photo is exactly in the middle
      const pace = 0.4 + 0.6 * (0.5 - 0.5 * Math.cos(phase * Math.PI * 2));
      // 0.632 is the mean pace over one photo, so FLOW really is seconds per photo
      angle -=
        (stepAngle / (FLOW * 0.632)) * pace * flow * flow * (3 - 2 * flow) * dt;
    }
    ring.rotation.y = angle;
    const i = frontIndex();
    if (i !== shown) {
      shown = i;
      caption.textContent = `> ${pad((i % unique) + 1)}/${pad(unique)} · ${photos[i].caption}`;
    }
    renderer.render(scene, camera);
  }

  canvas.addEventListener("pointerdown", (ev) => {
    dragging = true;
    moved = 0;
    vel = 0;
    lastX = ev.clientX;
    lastT = performance.now();
    tween = null;
    canvas.setPointerCapture(ev.pointerId);
    canvas.classList.add("is-dragging");
  });
  canvas.addEventListener("pointermove", (ev) => {
    if (!dragging) return;
    const now = performance.now();
    const dx = ev.clientX - lastX;
    moved += Math.abs(dx);
    angle += dx * anglePerPx;
    const dtm = Math.max(1, now - lastT) / 1000;
    vel = vel * 0.5 + ((dx * anglePerPx) / dtm) * 0.5;
    lastX = ev.clientX;
    lastT = now;
  });
  const release = (ev: PointerEvent): void => {
    if (!dragging) return;
    dragging = false;
    canvas.classList.remove("is-dragging");
    if (moved < 6) {
      // a click: bring that frame to the middle
      const r = canvas.getBoundingClientRect();
      ndc.set(
        ((ev.clientX - r.left) / r.width) * 2 - 1,
        -((ev.clientY - r.top) / r.height) * 2 + 1,
      );
      ray.setFromCamera(ndc, camera);
      const hit = ray.intersectObjects(frames, false)[0];
      if (hit) return goTo(hit.object.userData.index as number);
    }
    // a throw: carry the momentum on, then settle on the nearest frame
    if (performance.now() - lastT > 120) vel = 0;
    const carry = MathUtils.clamp(vel, -5, 5) * 0.32;
    const to = Math.round((angle + carry) / stepAngle) * stepAngle;
    glideTo(to, 500 + Math.min(700, Math.abs(carry) * 500), easeOut, 3200);
  };
  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", release);
  prev.addEventListener("click", () => goTo((frontIndex() - 1 + N) % N));
  next.addEventListener("click", () => goTo((frontIndex() + 1) % N));

  new ResizeObserver(resize).observe(canvas);
  resize();

  // compile the shaders ahead of the first frame (see laptop.ts for why)
  const start = (): void => {
    if (ready) return;
    ready = true;
    if (visible) {
      lastFrame = 0;
      requestAnimationFrame(frame);
    }
  };
  renderer.compileAsync(scene, camera).then(start, start);
  setTimeout(start, 8000);

  new IntersectionObserver(
    ([entry]) => {
      if (entry.isIntersecting) loadPhotos();
    },
    { rootMargin: "800px 0px" },
  ).observe(canvas);
  new IntersectionObserver(([entry]) => {
    const was = visible;
    visible = entry.isIntersecting;
    if (visible && !was) {
      nextAuto = performance.now() + 400;
      lastFrame = 0;
      requestAnimationFrame(frame);
    }
  }).observe(canvas);

  if (new URLSearchParams(location.search).has("debug"))
    window.qfilm = {
      goTo,
      get angle() {
        return angle;
      },
    };
}

function softboxes(renderer: WebGLRenderer): Texture {
  const env = new Scene();
  const mat = (
    r: number,
    g: number,
    b: number,
    side: Side = FrontSide,
  ): MeshBasicMaterial =>
    new MeshBasicMaterial({ color: new Color(r, g, b), side });
  const room = new Mesh(
    new BoxGeometry(20, 12, 20),
    mat(0.05, 0.03, 0.12, BackSide),
  );
  room.position.y = 3;
  env.add(room);
  const box = (
    w: number,
    h: number,
    i: number,
    pos: [number, number, number],
    tint: [number, number, number] = [1, 1, 1],
  ): void => {
    const m = new Mesh(
      new PlaneGeometry(w, h),
      mat(tint[0] * i, tint[1] * i, tint[2] * i, DoubleSide),
    );
    m.position.set(...pos);
    m.lookAt(0, 0, 0);
    env.add(m);
  };
  box(8, 2.2, 4.5, [0, 8, 3]);
  box(1.2, 6, 5, [-8, 2, 4], [0.8, 0.65, 1]);
  box(1.2, 6, 4, [8, 2, 2]);
  box(6, 1, 1.5, [0, -3, 8], [0.7, 0.5, 1]);
  const pmrem = new PMREMGenerator(renderer);
  const tex = pmrem.fromScene(env, 0.03).texture;
  pmrem.dispose();
  return tex;
}

function roundRect(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
