// The machine: a pinned, scroll-driven laptop.
//   a swarm of particles condenses into the machine while it scrolls in  →
//   back view (closed, Q glowing)  →  flips open and turns (time based, started
//   by the first scroll or by itself)  →  camera closes in on the display  →
//   the display is taken over: Q rain, ASCII apply button  →  the camera dives
//   through the display and the rain becomes the page background.
//
// The canvas sits in the pinned stage (its parent), next to `.machine__copy`,
// `.machine__alert` and the `[data-screen-apply]` link. Model, pictures and the
// words on the display come in through the options; the mono face is the one
// the page gives the section.

import {
  AdditiveBlending,
  BackSide,
  Box3,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DataTexture,
  DirectionalLight,
  DoubleSide,
  FrontSide,
  Group,
  LinearFilter,
  MathUtils,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  NeutralToneMapping,
  NoColorSpace,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  PointLight,
  Points,
  Quaternion,
  REVISION,
  RGBAFormat,
  Scene,
  ShaderChunk,
  ShaderMaterial,
  SRGBColorSpace,
  TextureLoader,
  Vector2,
  Vector3,
  WebGLRenderer,
  type IUniform,
  type Material,
  type MeshStandardMaterial,
  type Object3D,
  type Side,
  type Texture,
  type WebGLProgramParametersWithUniforms,
} from "three";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { banner } from "./ascii";
import { breathe } from "./breathe";
import { rgba, token } from "./palette";
import { QRain } from "./rain";

export interface LaptopSticker {
  src: string;
  x: number;
  z: number;
  w: number;
  rot: number;
  glow?: number;
}

export interface LaptopTexts {
  /** the prompt line typed first */
  prompt: string;
  /** fallback title when the logo art is not available */
  title: string;
  /** the line under the logo */
  line: string;
  /** the small line at the bottom of the screen (dates, place) */
  meta: string;
  /** the lines of the takeover */
  hack: string[];
  /** label inside the apply button on the screen, without the brackets */
  apply: string;
  /** the word drawn as ASCII banner above it */
  applyBanner: string;
}

export interface LaptopOptions {
  section: HTMLElement;
  canvas: HTMLCanvasElement;
  /** URLs: meshopt GLB, the white Q-Hack logo, the stickers with their placement */
  assets: { model: string; logo: string; stickers: LaptopSticker[] };
  texts: LaptopTexts;
  /** The takeover is on the display. Called without arguments on every frame
   *  from then on (and again after scrolling back), so it has to ignore
   *  repeats; it is never told that the takeover is over. */
  onHacked: () => void;
  /** Opacity of the page's own Q rain behind everything, 0 to 1. */
  setRain: (value: number) => void;
}

const OPEN_DEG = 110;
const SW = 1280;
const SH = 832;
const clamp = (v: number, a = 0, b = 1): number => Math.min(b, Math.max(a, v));
const smooth = (a: number, b: number, x: number): number => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const ease = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

// How the machine rests closed (A) and open (B): turn about x, y, z, then
// where it stands (x, y, z in metres). Wide windows use the composed poses:
// machine large on the right, copy on the left. Where those would run into the
// copy or out of the window, the machine is fitted into the free space
// instead, beside the copy or above it (see `arrange`).
const POSE_A = [1.02, Math.PI + 0.42, 0.1, 0.17, 0.035, 0.28];
const POSE_B = [0.24, Math.PI * 2 - 0.5, 0, 0.12, -0.085, 0.12];
const POSE_A_PORTRAIT = [1.0, Math.PI + 0.3, 0.06];
const POSE_B_PORTRAIT = [0.3, Math.PI * 2 - 0.3, 0];
const PIXEL_BUDGET = 1.9e6; // drawing buffer pixels: a 4K window must not cost four times a laptop screen

// The stickers on the lid: the real Q-Summit stickers, cut out of their white
// paper. x and z are metres in the lid's own space: z runs from the hinge (0)
// to the far edge (0.213), x from -0.152 to 0.152, and seen from behind the
// open lid +x is on the left. The Q in the middle takes x -0.02..0.02,
// z 0.086..0.126. w is the width in metres (the height follows the picture),
// rot degrees, `glow` how much the print shines by itself.
export const STICKER_LAYOUT: Record<
  "graffiti" | "disco" | "billiard" | "tenYears" | "est2016",
  Omit<LaptopSticker, "src">
> = {
  graffiti: { x: 0.012, z: 0.043, w: 0.079, rot: 5 },
  disco: { x: -0.094, z: 0.162, w: 0.053, rot: -10 },
  billiard: { x: 0.108, z: 0.158, w: 0.046, rot: 8 },
  tenYears: { x: 0.104, z: 0.062, w: 0.045, rot: -7 },
  est2016: { x: -0.1, z: 0.07, w: 0.045, rot: 9 },
};

type Shader = WebGLProgramParametersWithUniforms;
type ShaderPatch = (shader: Shader) => void;
/** A mesh as GLTFLoader builds it: one material each. */
type Part<M extends Material = Material> = Mesh<BufferGeometry, M>;
/** Left, right, top, bottom in clip space (-1..1, y up). */
interface Extent {
  l: number;
  r: number;
  t: number;
  b: number;
}
interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}
/** A free space on the stage in px, with the turns of the machine that suit it. */
interface Space {
  closed: number[];
  open: number[];
  l: number;
  r: number;
  t: number;
  b: number;
}

/** What `?debug` exposes to the test tools as `window.qhack`. */
interface LaptopDebug {
  rig: Group;
  camera: PerspectiveCamera;
  lid: Object3D;
  renderer: WebGLRenderer;
  scene: Scene;
  resize: () => void;
  key: DirectionalLight;
  rim: PointLight;
  screen: Part<MeshStandardMaterial>;
  keyboard: Part<MeshStandardMaterial>;
  stickerGloss: IUniform<number>;
  readonly p: number;
  readonly open: number;
  readonly formed: number;
  /** the machine on screen right now, in CSS px relative to the pinned stage */
  box(): Box;
}

declare global {
  interface Window {
    qhack?: LaptopDebug;
  }
}

const isMesh = (o: Object3D): o is Part => (o as Mesh).isMesh === true;

function need<T extends Element>(root: ParentNode, selector: string): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`the machine stage has no "${selector}"`);
  return el;
}

function context2d(
  canvas: HTMLCanvasElement,
  options?: CanvasRenderingContext2DSettings,
): CanvasRenderingContext2D {
  const ctx = canvas.getContext("2d", options);
  if (!ctx) throw new Error("2D canvas is not available");
  return ctx;
}

// Swap one piece of a built-in three.js shader for another. Those shaders
// change between three.js releases, and a piece that is gone would leave the
// effect silently switched off: development says so.
function swap(source: string, piece: string, replacement: string): string {
  if (import.meta.env.DEV && !source.includes(piece)) {
    console.warn(
      `Q-Hack laptop: the shader of three.js r${REVISION} has no "${piece}", a patch was skipped`,
    );
  }
  return source.replace(piece, replacement);
}

export async function initLaptop({
  section,
  canvas,
  assets,
  texts,
  onHacked,
  setRain,
}: LaptopOptions): Promise<void> {
  const parent = canvas.parentElement;
  if (!parent) throw new Error("the laptop canvas has no parent element");
  const pin = parent;
  const applyLink = need<HTMLElement>(pin, "[data-screen-apply]");
  const layers = {
    copy: need<HTMLElement>(pin, ".machine__copy"),
    alert: need<HTMLElement>(pin, ".machine__alert"),
    canvas,
  };
  // Write a style only when its value really changes. Each layer is its own
  // compositor layer (will-change in the CSS), so a change costs no repaint.
  const lastStyle: Partial<Record<keyof typeof layers, string>> = {};
  const setOpacity = (name: keyof typeof layers, value: number): void => {
    const v = value.toFixed(2);
    if (lastStyle[name] === v) return;
    lastStyle[name] = v;
    layers[name].style.opacity = v;
  };
  // the page's colors and faces, by the values the page itself resolved
  const night = token("hack-night");
  const glowColor = token("hack-glow");
  const pink = token("hack-pink");
  const nightPane = rgba("hack-night", 0.9);
  const mono = getComputedStyle(section).fontFamily || "monospace";
  const display = getComputedStyle(document.body).fontFamily || "sans-serif";
  // Opaque canvas with the glow painted inside the scene: a transparent canvas
  // composited over a CSS gradient cost two thirds of the frame rate on integrated graphics.
  const renderer = new WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
  });
  let pixelRatio = Math.min(devicePixelRatio || 1, 1.5);
  renderer.setPixelRatio(pixelRatio);
  renderer.toneMapping = NeutralToneMapping;
  renderer.setClearColor(night, 1);

  const scene = new Scene();
  const solid = { value: 1 }; // how much of the surface is there (stipple threshold)
  const swarm = {
    uForm: { value: 1 },
    uTime: { value: 0 },
    uSize: { value: 4 },
    uGain: { value: 1 },
  };
  // The set-up is cut into pieces (breathe): the hero above keeps moving
  // while the machine is prepared, instead of standing still for it.
  await breathe();
  const env = studio(renderer);
  await breathe();
  scene.environment = env;
  scene.environmentIntensity = 1.15;
  const key = new DirectionalLight(0xffffff, 0.7);
  key.position.set(-0.6, 1.0, 0.9);
  const rim = new PointLight(glowColor, 1.4, 3);
  rim.position.set(0.5, 0.3, -0.5);
  scene.add(key, rim);

  const camera = new PerspectiveCamera(28, 1, 0.01, 20);
  const probeCam = new PerspectiveCamera();
  const rig = new Group();
  rig.rotation.order = "XYZ";
  scene.add(rig);

  const logoImg = new Image();
  logoImg.src = assets.logo;
  const textures = new TextureLoader();
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const [gltf, , ...stickerMaps] = await Promise.all([
    loader.loadAsync(assets.model),
    logoImg.decode().catch(() => {}),
    ...assets.stickers.map((s) => textures.loadAsync(s.src).catch(() => null)),
  ]);
  rig.add(gltf.scene);
  const part = (name: string): Object3D => {
    const o = gltf.scene.getObjectByName(name);
    if (!o) throw new Error(`the laptop model has no "${name}"`);
    return o;
  };
  const lid = part("Lid");
  // in the model these three are single meshes with a standard (PBR) material
  const screen = part("Screen") as Part<MeshStandardMaterial>;
  const qlogo = part("QLogo") as Part<MeshStandardMaterial>;
  const keyboard = part("Keyboard") as Part<MeshStandardMaterial>;

  // Q-Hack violet instead of the Q-Summit navy
  qlogo.material.color.set(0x6a2bd6);
  qlogo.material.emissive.set(glowColor);
  const keyGlow = keyboard.material.emissiveIntensity;

  // ---- display: a 2D canvas as the emissive map
  const sc = document.createElement("canvas");
  sc.width = SW;
  sc.height = SH;
  const g = context2d(sc, { alpha: false, willReadFrequently: true }); // opaque and CPU backed: see QRain
  const tex = new CanvasTexture(sc);
  tex.flipY = false;
  // Uploaded raw and decoded in the shader: an sRGB texture upload from a
  // canvas takes a slow path that cut the frame rate to a third (measured
  // on integrated graphics: 17 fps with it, 60 without).
  tex.colorSpace = NoColorSpace;
  tex.generateMipmaps = false;
  tex.premultiplyAlpha = true; // the canvas is opaque: skip the un-premultiply pass on upload
  tex.minFilter = LinearFilter;
  screen.material = screen.material.clone();
  screen.material.color.set(0x000000);
  screen.material.emissive.set(0xffffff);
  screen.material.emissiveMap = tex;
  screen.material.emissiveIntensity = 0;
  // Its own copy of the studio: only then does envMapIntensity apply (the
  // scene-wide environment ignores it), and the glass can stop mirroring the
  // softboxes when the camera comes close.
  screen.material.envMap = env;
  screen.material.envMapIntensity = 0.3; // glass, but the picture stays readable
  screen.material.onBeforeCompile = (shader) => {
    addDissolve(shader, solid);
    shader.fragmentShader = swap(
      shader.fragmentShader,
      "#include <emissivemap_fragment>",
      `#ifdef USE_EMISSIVEMAP
        vec3 px = texture2D(emissiveMap, vEmissiveMapUv).rgb;
        px = mix(px / 12.92, pow((px + 0.055) / 1.055, vec3(2.4)), step(0.04045, px));
        totalEmissiveRadiance *= px;
      #endif`,
    );
  };

  // The wallpaper is painted once: filling a radial gradient over the whole
  // display on every redraw cost about 40 ms per frame in a CPU backed canvas.
  const wallpaper = document.createElement("canvas");
  wallpaper.width = SW;
  wallpaper.height = SH;
  {
    const w = context2d(wallpaper, { alpha: false });
    const bg = w.createRadialGradient(
      SW * 0.3,
      SH * 0.36,
      40,
      SW * 0.5,
      SH * 0.5,
      SW * 0.75,
    );
    bg.addColorStop(0, "#4a14a0");
    bg.addColorStop(0.5, "#21004c");
    bg.addColorStop(1, "#0a0318");
    w.fillStyle = bg;
    w.fillRect(0, 0, SW, SH);
  }

  const rainCanvas = document.createElement("canvas");
  rainCanvas.width = SW;
  rainCanvas.height = SH;
  const rain = new QRain(rainCanvas, {
    fontSize: 30,
    stepsPerSecond: 20,
    software: true,
    fontFamily: mono,
  });
  const applyArt = banner(texts.applyBanner, 9);
  const applySeed = applyArt.map((line) =>
    Array.from(line, () => Math.random()),
  );

  await breathe();
  const dome = stickerDome();
  assets.stickers.forEach((s, i) => {
    const map = stickerMaps[i];
    if (map) lid.add(makeSticker(s, map, renderer, env, dome));
  });
  await breathe();

  // ---- the machine condenses out of particles
  // Every material can be thinned out to a stipple (uSolid), and two point
  // clouds sampled from the surfaces fly in from a swirl and settle on it.
  const seenMats = new Set<Material>([screen.material]);
  gltf.scene.traverse((o) => {
    if (!isMesh(o) || seenMats.has(o.material)) return;
    const material = o.material;
    seenMats.add(material);
    // a material may bring a shader change of its own (the stickers' gloss)
    const own: ShaderPatch | undefined = material.userData.patch;
    material.onBeforeCompile = (shader) => {
      addDissolve(shader, solid);
      own?.(shader);
    };
    if (own) material.customProgramCacheKey = () => "sticker";
  });
  gltf.scene.updateMatrixWorld(true);
  const base = part("Base");
  const body = base.parent as Object3D; // found inside the scene, so it has a parent
  const baseMeshes: Part[] = [];
  const lidMeshes: Part[] = [];
  base.traverse((o) => {
    if (isMesh(o)) baseMeshes.push(o);
  });
  lid.traverse((o) => {
    if (isMesh(o) && o.name !== "Sticker") lidMeshes.push(o);
  });
  const baseCorners = cornersOf(base, body);
  const lidCorners = cornersOf(lid, lid);
  const few = Math.min(innerWidth, innerHeight) < 600;
  const swarmMat = makeSwarmMaterial(swarm);
  await breathe();
  const swarmBase = new Points(
    samplePoints(baseMeshes, body, few ? 1800 : 3200),
    swarmMat,
  );
  await breathe();
  const swarmLid = new Points(
    samplePoints(lidMeshes, lid, few ? 2200 : 3800),
    swarmMat,
  );
  swarmBase.frustumCulled = swarmLid.frustumCulled = false;
  body.add(swarmBase);
  lid.add(swarmLid);
  await breathe();

  // ---- geometry of the display in lid space, for the camera fit
  screen.geometry.computeBoundingBox();
  const bb = screen.geometry.boundingBox ?? new Box3();
  const screenCenter = bb.getCenter(new Vector3());
  // The meshopt model stores its vertices as whole numbers and keeps the real
  // size in the scale of each part: measure the display in metres, not in the
  // units of its vertices. (Without that scale this is the plain bounding box.)
  const unit = screen.getWorldScale(new Vector3());
  const screenW = (bb.max.x - bb.min.x) * unit.x;
  const screenH = Math.max(
    (bb.max.z - bb.min.z) * unit.z,
    (bb.max.y - bb.min.y) * unit.y,
  );

  // ---- state
  let p = 0; // scroll progress through the section
  let formed = 0; // 0 a loose swarm, 1 the solid machine
  let ready = false; // shaders compiled: frames may be drawn
  let sized = { w: 0, h: 0, ratio: 0 }; // what the drawing buffer was last set to
  let backdrop: CanvasTexture | null = null; // the glow behind the machine: the scene's background
  let poseA = POSE_A;
  let poseB = POSE_B;
  let open = 0; // 0 closed, 1 open: time based
  let wantOpen = false;
  let pinnedSince = 0;
  let powerAt = 0; // when the display came on
  let hover = false;
  let visible = false;
  let last = performance.now();
  let lastScreen = 0;
  let lastCaret = -1;
  let slow = 0; // frames above budget, for the resolution governor
  const steady = new URLSearchParams(location.search).has("steady"); // tests: keep the resolution fixed
  let seen = 0;
  let portrait = false;
  const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
  const home = { pos: new Vector3(), quat: new Quaternion() };
  const v1 = new Vector3();
  const v2 = new Vector3();
  const v3 = new Vector3();
  const q1 = new Quaternion();

  function setHome(z: number): void {
    probeCam.position.set(0, 0.06, z);
    probeCam.up.set(0, 1, 0);
    probeCam.lookAt(0, 0.02, 0);
    home.pos.copy(probeCam.position);
    home.quat.copy(probeCam.quaternion);
  }

  // Where a resting pose lands on screen, seen from the home camera, in clip
  // space (-1..1, y up).
  function extent(pose: number[], lidDeg: number): Extent {
    rig.rotation.set(pose[0], pose[1], pose[2]);
    rig.position.set(pose[3] || 0, pose[4] || 0, pose[5] || 0);
    lid.rotation.x = -MathUtils.degToRad(lidDeg);
    rig.updateMatrixWorld(true);
    probeCam.fov = camera.fov;
    probeCam.aspect = camera.aspect;
    probeCam.updateProjectionMatrix();
    probeCam.updateMatrixWorld(true);
    const e: Extent = { l: Infinity, r: -Infinity, t: -Infinity, b: Infinity };
    for (const [corners, obj] of [
      [baseCorners, body],
      [lidCorners, lid],
    ] as const) {
      for (const c of corners) {
        v1.copy(c).applyMatrix4(obj.matrixWorld).project(probeCam);
        e.l = Math.min(e.l, v1.x);
        e.r = Math.max(e.r, v1.x);
        e.t = Math.max(e.t, v1.y);
        e.b = Math.min(e.b, v1.y);
      }
    }
    return e;
  }

  // The copy's text as laid out (typed or not), in px of the stage.
  function copyRect(): Box {
    const stage = pin.getBoundingClientRect();
    const out: Box = {
      left: Infinity,
      top: Infinity,
      right: -Infinity,
      bottom: -Infinity,
    };
    const range = document.createRange();
    for (const el of layers.copy.children) {
      if (getComputedStyle(el).display === "none") continue;
      range.selectNodeContents(el);
      for (const r of range.getClientRects()) {
        if (!r.width || !r.height) continue;
        out.left = Math.min(out.left, r.left - stage.left);
        out.right = Math.max(out.right, r.right - stage.left);
        out.top = Math.min(out.top, r.top - stage.top);
        out.bottom = Math.max(out.bottom, r.bottom - stage.top);
      }
    }
    return out;
  }

  // Decide where the machine stands for this window. Returns the camera distance.
  function arrange(w: number, h: number, z: number): number {
    const keep = [
      rig.rotation.x,
      rig.rotation.y,
      rig.rotation.z,
      rig.position.x,
      rig.position.y,
      rig.position.z,
      lid.rotation.x,
    ];
    const restore = (): void => {
      rig.rotation.set(keep[0], keep[1], keep[2]);
      rig.position.set(keep[3], keep[4], keep[5]);
      lid.rotation.x = keep[6];
      rig.updateMatrixWorld(true);
      setHome(z);
    };
    const TOP = 72; // below the top bar
    const copy = copyRect();
    const clashes = (e: Extent): boolean => {
      const left = ((e.l + 1) / 2) * w;
      const right = ((e.r + 1) / 2) * w;
      const top = ((1 - e.t) / 2) * h;
      const bottom = ((1 - e.b) / 2) * h;
      const onCopy =
        left < copy.right + 10 &&
        right > copy.left - 10 &&
        top < copy.bottom + 10 &&
        bottom > copy.top - 10;
      const outside =
        Math.max(0, -left, right - w) > (right - left) * 0.05 || top < TOP - 36;
      return onCopy || outside;
    };
    if (
      !portrait &&
      !clashes(extent(POSE_A, 0)) &&
      !clashes(extent(POSE_B, OPEN_DEG))
    ) {
      poseA = POSE_A;
      poseB = POSE_B;
      restore();
      return z;
    }

    // free spaces to try: above the copy, and (not on an upright phone) beside it
    const spaces: Space[] = [
      {
        closed: POSE_A_PORTRAIT,
        open: POSE_B_PORTRAIT,
        l: 12,
        r: w - 12,
        t: TOP,
        b: Math.max(TOP + h * 0.22, copy.top - 16),
      },
    ];
    if (!portrait)
      spaces.push({
        closed: POSE_A.slice(0, 3),
        open: POSE_B.slice(0, 3),
        l: copy.right + 28,
        r: w - 20,
        t: TOP,
        b: h - 20,
      });
    let fit: (Space & { back: number }) | null = null;
    for (const s of spaces) {
      const fw = ((s.r - s.l) / w) * 2;
      const fh = ((s.b - s.t) / h) * 2;
      if (fw < 0.15 || fh < 0.15) continue;
      const ea = extent(s.closed, 0);
      const eb = extent(s.open, OPEN_DEG);
      // how far the camera has to step back until both poses fit
      const back = Math.max(
        1,
        (ea.r - ea.l) / (fw * 0.96),
        (ea.t - ea.b) / (fh * 0.96),
        (eb.r - eb.l) / (fw * 0.96),
        (eb.t - eb.b) / (fh * 0.96),
      );
      if (!fit || back < fit.back) fit = { ...s, back };
    }
    const best = fit || { ...spaces[0], back: 1 };
    z *= best.back;
    setHome(z);
    const perY = Math.tan(MathUtils.degToRad(camera.fov / 2)) * z; // metres per clip unit at the machine
    const perX = perY * camera.aspect;
    const wantX = (best.l + best.r) / w - 1;
    const wantY = 1 - (best.t + best.b) / h;
    const place = (rot: number[], lidDeg: number): number[] => {
      const e = extent(rot, lidDeg);
      return [
        rot[0],
        rot[1],
        rot[2],
        (wantX - (e.l + e.r) / 2) * perX,
        (wantY - (e.t + e.b) / 2) * perY,
        0,
      ];
    };
    poseA = place(best.closed, 0);
    poseB = place(best.open, OPEN_DEG);
    restore();
    return z;
  }

  function resize(): void {
    const w = pin.clientWidth;
    const h = pin.clientHeight;
    if (!w || !h) return;
    // Nothing changed: leave the drawing buffer alone. Setting a canvas size
    // again throws its picture away, even when the size is the same.
    const ratio = Math.min(pixelRatio, Math.sqrt(PIXEL_BUDGET / (w * h)));
    if (w === sized.w && h === sized.h && ratio === sized.ratio) return;
    sized = { w, h, ratio };
    renderer.setPixelRatio(ratio);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    portrait = camera.aspect < 0.9;
    backdrop?.dispose();
    backdrop = glow(camera.aspect, portrait);
    scene.background = backdrop;
    let z = 1.15 * Math.max(1, 0.78 / camera.aspect);
    setHome(z);
    z = arrange(w, h, z);
    swarm.uSize.value = 3.1 * renderer.getPixelRatio() * z;
    swarm.uGain.value = portrait ? 0.5 : 1; // the machine is smaller on a phone: the same points sit closer together
    // resizing clears the canvas: draw again right away, or one black frame shows
    if (visible && ready) renderer.render(scene, camera);
  }

  function readScroll(): { top: number; past: number; pinH: number } {
    const r = section.getBoundingClientRect();
    const pinH = pin.clientHeight;
    p = clamp(-r.top / (r.height - pinH));
    const past = Math.max(0, pinH - r.bottom);
    return { top: r.top, past, pinH };
  }

  // ---- display content -------------------------------------------------
  const L1 = texts.prompt;
  const TITLE = texts.title;
  const L3 = texts.line;
  const HACK = texts.hack;
  const NOISE = "Qq01<>/#*+=";
  const scramble = (text: string, amount: number): string =>
    amount <= 0
      ? text
      : Array.from(text, (ch) =>
          ch !== " " && Math.random() < amount
            ? NOISE[(Math.random() * NOISE.length) | 0]
            : ch,
        ).join("");

  // The lockup on the display: the Q-hack logo drawn from characters, like
  // the one in the hero. It is written column by column, a few scrambled
  // columns running ahead of the finished ones.
  const TITLE_TIME = 0.95; // seconds to write it
  const ART_X = 84;
  const ART_Y = 196;
  const ART_PX = 11.5; // character height; a character is 0.6 of that wide (about the grain of the hero)
  const art = logoArt(logoImg, 132);
  const ART_CW = ART_PX * 0.6;
  // How long the boot text takes to type, in ms: 5.2 s for the lines this was
  // tuned with, more when the page hands over longer ones.
  const TYPING_MS = Math.max(
    5200,
    (0.25 + L1.length / 30 + 0.3 + TITLE_TIME + 0.25 + L3.length / 17 + 1) *
      1000,
  );
  // The finished lockup is painted once; redrawing 3,400 characters on every
  // display refresh cost a third of the frame rate. Only the few columns that
  // are being written, or a glitch, are drawn as live text.
  const artFill = g.createLinearGradient(
    0,
    ART_Y,
    0,
    ART_Y + (art ? art.length : 1) * ART_PX,
  );
  artFill.addColorStop(0, "#ffffff");
  artFill.addColorStop(1, "#cfaeff");
  const artFont = `800 ${ART_PX}px ${mono}`;
  let artDone: HTMLCanvasElement | null = null;
  if (art) {
    artDone = document.createElement("canvas");
    artDone.width = Math.ceil(art[0].length * ART_CW);
    artDone.height = Math.ceil(art.length * ART_PX);
    const a = context2d(artDone, { willReadFrequently: true });
    const fill = a.createLinearGradient(0, 0, 0, artDone.height);
    fill.addColorStop(0, "#ffffff");
    fill.addColorStop(1, "#cfaeff");
    a.font = artFont;
    a.textBaseline = "top";
    a.fillStyle = fill;
    art.forEach((line, r) => a.fillText(line, 0, r * ART_PX));
  }
  function drawTitle(shown: number, glitch: number): void {
    if (shown <= 0) return;
    if (!art || !artDone) {
      // the logo did not load: plain lettering
      g.font = `900 200px ${display}`;
      g.fillStyle = "#ffffff";
      g.fillText(
        scramble(
          TITLE.slice(0, Math.floor(shown * TITLE.length)),
          glitch * 0.6,
        ),
        76,
        420,
      );
      return;
    }
    const cols = art[0].length;
    const AHEAD = 5;
    const edge = Math.floor(shown * (cols + AHEAD));
    g.font = artFont;
    g.textBaseline = "top";
    g.fillStyle = artFill;
    if (glitch > 0) {
      // the takeover: every row as text, with characters knocked out of place
      for (let r = 0; r < art.length; r++) {
        let out = "";
        for (const ch of art[r])
          out +=
            ch !== " " && Math.random() < glitch * 0.6
              ? NOISE[(Math.random() * NOISE.length) | 0]
              : ch;
        g.fillText(out, ART_X, ART_Y + r * ART_PX);
      }
    } else {
      const written = Math.min(cols, edge - AHEAD);
      if (written > 0) {
        const w = Math.min(artDone.width, Math.round(written * ART_CW));
        g.drawImage(
          artDone,
          0,
          0,
          w,
          artDone.height,
          ART_X,
          ART_Y,
          w,
          artDone.height,
        );
      }
      // the columns being written right now: scrambled
      for (
        let c = Math.max(0, edge - AHEAD);
        c <= Math.min(cols - 1, edge);
        c++
      ) {
        for (let r = 0; r < art.length; r++) {
          if (art[r][c] !== " ")
            g.fillText(
              NOISE[(Math.random() * NOISE.length) | 0],
              ART_X + c * ART_CW,
              ART_Y + r * ART_PX,
            );
        }
      }
    }
    g.textBaseline = "alphabetic";
  }

  function drawScreen(now: number, h: number, dt: number, e: number): void {
    const t = (now - powerAt) / 1000;
    const glitch = h > 0 && h < 0.34 ? Math.sin((Math.PI * h) / 0.34) : 0;

    g.globalAlpha = 1;
    if (h < 0.5) g.drawImage(wallpaper, 0, 0); // later the rain covers everything

    // what the owner was typing
    const n1 = clamp(Math.floor((t - 0.25) * 30), 0, L1.length);
    const tTitle = t - 0.25 - L1.length / 30 - 0.3;
    const tL3 = tTitle - TITLE_TIME - 0.25;
    const n3 = clamp(Math.floor(tL3 * 17), 0, L3.length);
    const caret = Math.floor(now / 500) % 2 === 0 ? "_" : " ";
    const content = 1 - smooth(0.3, 0.52, h);
    if (content > 0) {
      g.globalAlpha = content;
      g.textBaseline = "alphabetic";
      g.font = `500 30px ${mono}`;
      g.fillStyle = "#b9a3e6";
      g.fillText(
        scramble(L1.slice(0, n1), glitch * 0.5) + (n1 < L1.length ? caret : ""),
        84,
        150,
      );
      drawTitle(clamp(tTitle / TITLE_TIME), glitch);
      g.font = `500 56px ${mono}`;
      g.fillStyle = "#e7d8ff";
      if (tTitle >= TITLE_TIME)
        g.fillText(scramble(L3.slice(0, n3), glitch * 0.6) + caret, 84, 550);
      g.font = `500 26px ${mono}`;
      g.fillStyle = "#9d86cf";
      g.fillText(texts.meta, 84, 782);

      // the intruder types over it
      const total = HACK.reduce((s, l) => s + l.length, 0);
      let left = Math.floor(smooth(0.02, 0.26, h) * total);
      g.font = `600 32px ${mono}`;
      g.fillStyle = pink;
      HACK.forEach((line, i) => {
        const n = Math.min(line.length, left);
        left -= n;
        if (n > 0) g.fillText(line.slice(0, n), 84, 594 + i * 40);
      });
    }

    // tearing while the takeover happens
    if (glitch > 0.02) {
      g.globalAlpha = 1;
      for (let i = 0; i < 9; i++) {
        const y = Math.random() * SH;
        const hh = 8 + Math.random() * 60;
        g.drawImage(
          sc,
          0,
          y,
          SW,
          hh,
          (Math.random() - 0.5) * 120 * glitch,
          y,
          SW,
          hh,
        );
      }
      g.globalAlpha = 0.5 * glitch;
      g.fillStyle = Math.random() < 0.5 ? pink : glowColor;
      g.fillRect(0, Math.random() * SH, SW, 6 + Math.random() * 26);
    }

    // the rain takes the display
    const rainAmount = smooth(0.22, 0.5, h);
    if (rainAmount > 0) {
      rain.update(dt);
      g.globalAlpha = rainAmount;
      g.drawImage(rainCanvas, 0, 0);
    }

    // and out of it, the way in
    const a = smooth(0.52, 0.8, h) * (1 - smooth(0, 0.3, e));
    if (a > 0) {
      const bw = 940;
      const bh = 380;
      const x = (SW - bw) / 2;
      const y = (SH - bh) / 2;
      g.globalAlpha = a;
      g.fillStyle = hover ? "rgba(72,5,143,0.94)" : nightPane;
      g.fillRect(x, y, bw, bh);
      g.strokeStyle = hover ? "#ffffff" : "#cfaeff";
      g.lineWidth = 3;
      g.strokeRect(x + 1.5, y + 1.5, bw - 3, bh - 3);
      g.font = `700 18px ${mono}`;
      g.textBaseline = "top";
      g.fillStyle = "#ffffff";
      const cw = 18 * 0.6;
      const artW = (applyArt[0]?.length ?? 0) * cw;
      applyArt.forEach((line, r) => {
        let out = "";
        for (let c = 0; c < line.length; c++) {
          out +=
            line[c] === " " || applySeed[r][c] < a * 1.25
              ? line[c]
              : NOISE[(Math.random() * NOISE.length) | 0];
        }
        g.fillText(out, (SW - artW) / 2, y + 72 + r * 18);
      });
      g.font = `600 30px ${mono}`;
      g.textAlign = "center";
      g.fillStyle = pink;
      g.fillText(`[ ${texts.apply} ${caret}]`, SW / 2, y + bh - 72);
      g.textAlign = "left";
    }
    g.globalAlpha = 1;
    tex.needsUpdate = true;
  }

  // ---- frame -------------------------------------------------------------
  function frame(now: number): void {
    if (!visible || !ready) return;
    requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const { top, past, pinH } = readScroll();

    // the machine forms while the section scrolls in (eased over time, so a
    // fast scroll or a jump into the page still shows it happening)
    const formTarget = 1 - smooth(0.12, 0.92, top / pinH);
    formed += (formTarget - formed) * (1 - Math.exp(-dt * 5));
    if (Math.abs(formTarget - formed) < 0.002) formed = formTarget;
    solid.value = formed >= 1 ? 1 : smooth(0.5, 0.98, formed);
    swarm.uForm.value = formed;
    swarm.uTime.value = now / 1000;
    swarmBase.visible = swarmLid.visible = formed < 0.999;

    // the opening starts with the first bit of scroll, or by itself
    if (top <= pinH * 0.12) {
      if (!pinnedSince) pinnedSince = now;
      if (p > 0.03 || now - pinnedSince > 2400) wantOpen = true;
    } else if (top > pinH * 0.5) {
      pinnedSince = 0;
      wantOpen = false;
    }
    open = clamp(open + (wantOpen ? dt : -dt) / 2.6);
    const o = ease(open);
    const lidDeg = OPEN_DEG * ease(clamp((open - 0.1) / 0.9));

    const z = smooth(0.2, 0.46, p) * smooth(0.8, 1, open);
    const power = smooth(55, 95, lidDeg);
    const h = smooth(0.5, 0.78, p) * power;
    const e = smooth(0.86, 0.985, p);

    // rig pose: A (back, closed) → B (three quarter, open) → C (display square to the camera)
    const A = poseA;
    const B = poseB;
    const C = [0.349, Math.PI * 2, 0, 0, -0.1, 0];
    const ab = A.map((a, i) => lerp(a, B[i], o));
    const zz = ease(z);
    const pose = ab.map((a, i) => lerp(a, C[i], zz));
    mouse.x += (mouse.tx - mouse.x) * 0.06;
    mouse.y += (mouse.ty - mouse.y) * 0.06;
    const calm = 1 - zz;
    const bob = Math.sin(now / 1400) * 0.006 * calm;
    rig.rotation.set(
      pose[0] + mouse.y * 0.05 * calm,
      pose[1] + mouse.x * 0.1 * calm,
      pose[2] + Math.sin(now / 2100) * 0.012 * calm,
    );
    rig.position.set(
      pose[3],
      pose[4] + bob + Math.sin(Math.PI * open) * 0.05,
      pose[5],
    );
    lid.rotation.x = -MathUtils.degToRad(lidDeg);
    rig.updateMatrixWorld(true);

    // camera: home, or square on the display at the distance where it fills the view
    v1.copy(screenCenter);
    screen.localToWorld(v1);
    screen.getWorldQuaternion(q1);
    v2.set(0, -1, 0).applyQuaternion(q1); // display normal
    v3.set(0, 0, 1).applyQuaternion(q1); // display up
    const tanHalf = Math.tan(MathUtils.degToRad(camera.fov / 2));
    const fill = portrait ? 0.94 : 0.8;
    let d = Math.max(
      screenH / (2 * tanHalf * fill),
      screenW / (2 * tanHalf * camera.aspect * fill),
    );
    d *= 1 - 0.74 * ease(e); // exit: dive through the display
    probeCam.position.copy(v1).addScaledVector(v2, d);
    probeCam.up.copy(v3);
    probeCam.lookAt(v1);
    camera.position.lerpVectors(home.pos, probeCam.position, zz);
    camera.quaternion.slerpQuaternions(home.quat, probeCam.quaternion, zz);

    // display, logo and key light
    if (power > 0 && !powerAt) powerAt = now;
    if (power === 0) powerAt = 0;
    screen.material.emissiveIntensity = power * 0.95;
    // close up, the glass must not mirror the studio any more: the softbox
    // showed as a pale band along the top of the display during the dive
    screen.material.envMapIntensity = 0.3 * (1 - zz) * (1 - zz);
    keyboard.material.emissiveIntensity = keyGlow * 0.6 * power;
    qlogo.material.emissiveIntensity = 1.3 + 0.35 * Math.sin(now / 900);
    // redraw the display only when something on it changes: while the boot
    // text is being typed, when the caret flips, or during the takeover
    const caretNow = Math.floor(now / 500);
    const typing = powerAt > 0 && now - powerAt < TYPING_MS;
    if (
      power > 0 &&
      now - lastScreen > 32 &&
      (typing || h > 0 || caretNow !== lastCaret)
    ) {
      lastCaret = caretNow;
      drawScreen(now, h, Math.min(0.1, (now - lastScreen) / 1000), e);
      lastScreen = now;
    }

    // page layers that follow the timeline
    setOpacity("copy", 1 - smooth(0.14, 0.24, p));
    scene.backgroundIntensity = 1 - 0.9 * zz;
    setOpacity("canvas", 1 - smooth(0.45, 1, e));
    setOpacity(
      "alert",
      h > 0.02 && h < 0.34 && Math.floor(now / 260) % 2 === 0 ? 1 : 0,
    );
    const live = h > 0.7 && e < 0.4;
    applyLink.classList.toggle("is-live", live);
    applyLink.tabIndex = live ? 0 : -1;
    if (h > 0.3) onHacked();
    setRain(e * (1 - clamp(past / (pinH * 0.9))));

    renderer.render(scene, camera);

    // resolution governor: weak GPUs step the canvas down instead of stuttering
    if (++seen > 40) {
      if (dt > 0.027) slow++;
      if (seen > 100) {
        if (slow > 36 && renderer.getPixelRatio() > 0.6 && !steady) {
          pixelRatio = Math.max(0.6, renderer.getPixelRatio() - 0.2);
          resize();
        }
        seen = 40;
        slow = 0;
      }
    }
  }

  applyLink.addEventListener("pointerenter", () => (hover = true));
  applyLink.addEventListener("pointerleave", () => (hover = false));
  applyLink.addEventListener("focus", () => (hover = true));
  applyLink.addEventListener("blur", () => (hover = false));
  pin.addEventListener("pointermove", (ev) => {
    mouse.tx = (ev.clientX / innerWidth - 0.5) * 2;
    mouse.ty = (ev.clientY / innerHeight - 0.5) * 2;
  });
  new ResizeObserver(resize).observe(pin);
  resize();
  renderer.clear(); // the page color until the first real frame, not an opaque black box

  // Every shader is compiled before the first frame, and off the main thread
  // where the browser can do that (three polls KHR_parallel_shader_compile).
  // Drawing straight away compiled them one by one inside the first frame: on
  // a cold start that froze the page for seconds.
  const start = (): void => {
    if (ready) return;
    ready = true;
    if (visible) {
      last = performance.now();
      requestAnimationFrame(frame);
    }
  };
  await breathe();
  renderer.compileAsync(scene, camera).then(start, start);
  setTimeout(start, 8000); // never wait forever

  // The strip of the section that lies behind the status line does not count
  // as "in view": the machine must not be drawn while only the hero is on screen.
  new IntersectionObserver(
    ([entry]) => {
      const was = visible;
      visible = entry.isIntersecting;
      if (visible && !was) {
        last = performance.now();
        requestAnimationFrame(frame);
      }
      // keep the rain layer honest once the section is far away
      if (!visible) setRain(0);
    },
    { rootMargin: "0px 0px -56px 0px" },
  ).observe(section);

  if (new URLSearchParams(location.search).has("debug"))
    window.qhack = {
      rig,
      camera,
      lid,
      renderer,
      scene,
      resize,
      key,
      rim,
      screen,
      keyboard,
      stickerGloss,
      get p() {
        return p;
      },
      get open() {
        return open;
      },
      get formed() {
        return formed;
      },
      box() {
        const out: Box = {
          left: Infinity,
          top: Infinity,
          right: -Infinity,
          bottom: -Infinity,
        };
        for (const [corners, obj] of [
          [baseCorners, body],
          [lidCorners, lid],
        ] as const) {
          for (const c of corners) {
            v1.copy(c).applyMatrix4(obj.matrixWorld).project(camera);
            const x = ((v1.x + 1) / 2) * pin.clientWidth;
            const y = ((1 - v1.y) / 2) * pin.clientHeight;
            out.left = Math.min(out.left, x);
            out.right = Math.max(out.right, x);
            out.top = Math.min(out.top, y);
            out.bottom = Math.max(out.bottom, y);
          }
        }
        return out;
      },
    };
}

/* ---------------------------------------------------------------- helpers */

// A dark violet studio: big softboxes and strips, so the aluminum picks up
// crisp gradients and a little of the CI color.
function studio(renderer: WebGLRenderer): Texture {
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
    mat(0.075, 0.06, 0.13, BackSide),
  );
  room.position.y = 4;
  env.add(room);
  const floor = new Mesh(new PlaneGeometry(20, 20), mat(0.3, 0.27, 0.4));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -1.9;
  env.add(floor);
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
    m.lookAt(0, 1, 0);
    env.add(m);
  };
  box(7, 4, 3.0, [0, 9.5, 0.01]);
  box(9, 3, 2.4, [0, 7, 8]); // big front-top softbox: the lid reads as silver, not as violet glass
  box(1.4, 7, 7.0, [-8, 3, 2]);
  box(1.0, 6, 4.0, [8, 2.5, -1], [0.72, 0.5, 1]);
  box(9, 1.2, 3.4, [0, 4, -9], [0.85, 0.75, 1]);
  box(6, 1.0, 1.8, [0, 1.2, 9]);
  const pmrem = new PMREMGenerator(renderer);
  const tex = pmrem.fromScene(env, 0.035).texture;
  pmrem.dispose();
  return tex;
}

// The glow behind the machine: bright right behind it, then a long, clean
// falloff into the ink. No ring, no edge. A little grain keeps the 8 bit
// gradient from showing bands once it is stretched over the whole view.
function glow(aspect: number, portrait: boolean): CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 768;
  c.height = Math.max(64, Math.round(768 / aspect));
  const g = context2d(c, { willReadFrequently: true }); // read back below: keep it in main memory
  g.fillStyle = token("hack-night");
  g.fillRect(0, 0, c.width, c.height);
  const cx = c.width * (portrait ? 0.5 : 0.6);
  const cy = c.height * (portrait ? 0.42 : 0.5);
  const r = portrait ? c.height * 0.52 : c.width * 0.5;
  g.translate(cx, cy);
  g.scale(r, r * (portrait ? 1 : 0.82));
  const grad = g.createRadialGradient(0, 0, 0, 0, 0, 1);
  const stops: [number, [number, number, number]][] = [
    [0, [234, 218, 255]],
    [0.12, [206, 172, 255]],
    [0.26, [164, 106, 247]],
    [0.4, [122, 56, 226]],
    [0.55, [84, 25, 172]],
    [0.7, [54, 11, 122]],
    [0.85, [28, 5, 68]],
    [1, [10, 3, 24]],
  ];
  for (const [t, [r8, g8, b8]] of stops)
    grad.addColorStop(t, `rgb(${r8},${g8},${b8})`);
  g.fillStyle = grad;
  g.fillRect(-4, -4, 8, 8);
  g.setTransform(1, 0, 0, 1, 0, 0);
  const img = g.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 5;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

// Stipple dissolve for any built-in material: below uSolid = 1 a share of the
// pixels is dropped, so a surface can resolve out of nothing without blending.
function addDissolve(shader: Shader, uSolid: IUniform<number>): void {
  shader.uniforms.uSolid = uSolid;
  shader.fragmentShader =
    "uniform float uSolid;\n" +
    swap(
      shader.fragmentShader,
      "#include <clipping_planes_fragment>",
      `#include <clipping_planes_fragment>
      if (uSolid < 1.0) {
        vec2 cell = floor(gl_FragCoord.xy / 2.0);
        if (fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453) > uSolid) discard;
      }`,
    );
}

// Random points on the surfaces of `meshes`, weighted by area, in the local
// space of `space`.
function samplePoints(
  meshes: Part[],
  space: Object3D,
  count: number,
): BufferGeometry {
  const inv = new Matrix4().copy(space.matrixWorld).invert();
  const m = new Matrix4();
  const a = new Vector3();
  const b = new Vector3();
  const c = new Vector3();
  const tris: number[] = [];
  const cum: number[] = [];
  let total = 0;
  for (const mesh of meshes) {
    const pos = mesh.geometry.attributes.position;
    const idx = mesh.geometry.index;
    m.multiplyMatrices(inv, mesh.matrixWorld);
    const n = idx ? idx.count : pos.count;
    for (let i = 0; i < n; i += 3) {
      a.fromBufferAttribute(pos, idx ? idx.getX(i) : i).applyMatrix4(m);
      b.fromBufferAttribute(pos, idx ? idx.getX(i + 1) : i + 1).applyMatrix4(m);
      c.fromBufferAttribute(pos, idx ? idx.getX(i + 2) : i + 2).applyMatrix4(m);
      tris.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
      total += b.sub(a).cross(c.sub(a)).length() / 2;
      cum.push(total);
    }
  }
  const out = new Float32Array(count * 3);
  const seed = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const r = Math.random() * total;
    let lo = 0;
    let hi = cum.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] < r) lo = mid + 1;
      else hi = mid;
    }
    const t = lo * 9;
    let u = Math.random();
    let v = Math.random();
    if (u + v > 1) {
      u = 1 - u;
      v = 1 - v;
    }
    const w = 1 - u - v;
    for (let k = 0; k < 3; k++) {
      out[i * 3 + k] =
        tris[t + k] * w + tris[t + 3 + k] * u + tris[t + 6 + k] * v;
      seed[i * 3 + k] = Math.random();
    }
  }
  const geo = new BufferGeometry();
  geo.setAttribute("position", new BufferAttribute(out, 3));
  geo.setAttribute("aSeed", new BufferAttribute(seed, 3));
  return geo;
}

// The swarm: each point starts far out on a swirl and lands on its place on
// the surface; once the solid machine is there the points are gone.
function makeSwarmMaterial(uniforms: Record<string, IUniform>): ShaderMaterial {
  return new ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    vertexShader: `
      uniform float uForm, uTime, uSize, uGain;
      attribute vec3 aSeed;
      varying float vAlpha;
      varying float vHot;
      void main() {
        float t = clamp(uForm * 1.45 - aSeed.x * 0.45, 0.0, 1.0);
        float k = 1.0 - t;
        k = k * k * (3.0 - 2.0 * k);
        vec3 dir = normalize(aSeed * 2.0 - 1.0 + 1e-3);
        vec3 off = dir * (0.18 + aSeed.z * 0.55) * k;
        float ang = k * (1.6 + aSeed.y * 3.2);
        float cs = cos(ang), sn = sin(ang);
        off.xz = mat2(cs, -sn, sn, cs) * off.xz;
        vec3 p = position + off + 0.0012 * sin(uTime * 2.2 + aSeed * 43.0);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uSize * (0.55 + aSeed.z * 0.9) * (1.0 + k * 0.8) / -mv.z;
        vAlpha = smoothstep(0.0, 0.12, uForm) * (1.0 - smoothstep(0.86, 1.0, uForm)) * (0.35 + 0.65 * t) * uGain;
        vHot = t;
      }`,
    fragmentShader: `
      varying float vAlpha;
      varying float vHot;
      void main() {
        vec2 d = gl_PointCoord - 0.5;
        float a = smoothstep(0.5, 0.08, length(d)) * vAlpha;
        vec3 col = mix(vec3(0.53, 0.25, 0.93), vec3(0.86, 0.76, 1.0), vHot);
        gl_FragColor = vec4(col, a);
      }`,
  });
}

// The eight corners of everything under `obj`, in the space of `space`.
function cornersOf(obj: Object3D, space: Object3D): Vector3[] {
  const inv = new Matrix4().copy(space.matrixWorld).invert();
  const m = new Matrix4();
  const box = new Box3();
  const part = new Box3();
  obj.traverse((o) => {
    if (!isMesh(o)) return;
    o.geometry.computeBoundingBox();
    if (!o.geometry.boundingBox) return;
    box.union(
      part
        .copy(o.geometry.boundingBox)
        .applyMatrix4(m.multiplyMatrices(inv, o.matrixWorld)),
    );
  });
  const out: Vector3[] = [];
  for (const x of [box.min.x, box.max.x])
    for (const y of [box.min.y, box.max.y])
      for (const z of [box.min.z, box.max.z]) out.push(new Vector3(x, y, z));
  return out;
}

// The logo as rows of characters: light ones along the edges, heavy "hacker"
// characters inside, so the round shapes of the lettering survive.
function logoArt(img: HTMLImageElement, cols: number): string[] | null {
  if (!img.naturalWidth) return null;
  const rows = Math.round(cols * (img.naturalHeight / img.naturalWidth) * 0.6);
  const S = 4; // samples per character, each way
  const c = document.createElement("canvas");
  c.width = cols * S;
  c.height = rows * S;
  const g = context2d(c, { willReadFrequently: true });
  g.drawImage(img, 0, 0, c.width, c.height);
  g.clearRect(c.width * 0.34, c.height * 0.76, c.width, c.height); // the small tag line cannot resolve
  const a = g.getImageData(0, 0, c.width, c.height).data;
  const LIGHT = ".:'`";
  const MID = "+=*<>/";
  const HEAVY = "#@$%&8Q0";
  const pick = (set: string): string => set[(Math.random() * set.length) | 0];
  const out: string[] = [];
  for (let r = 0; r < rows; r++) {
    let line = "";
    for (let k = 0; k < cols; k++) {
      let sum = 0;
      for (let y = 0; y < S; y++)
        for (let x = 0; x < S; x++)
          sum += a[((r * S + y) * c.width + k * S + x) * 4 + 3];
      const v = sum / (S * S * 255);
      line +=
        v < 0.12
          ? " "
          : v < 0.38
            ? pick(LIGHT)
            : v < 0.72
              ? pick(MID)
              : pick(HEAVY);
    }
    out.push(line);
  }
  return out;
}

// A glossy sticker. The real ones are laminated vinyl: they mirror the room
// the way the aluminum around them does. So the print sits under a thick
// clear layer that reflects the studio untinted (three.js fixes a clear coat
// at 4 % reflectance, far too little for a laminate, so the shader is told
// more), the surface is very slightly domed so the reflection wanders across
// the sticker when the lid turns, and the print glows a little by itself and
// stays readable from every angle. The shape is cut by the picture's
// transparency.
const stickerGloss = { value: 0.3 }; // share of the studio the laminate mirrors, seen head-on
function makeSticker(
  s: LaptopSticker,
  map: Texture<HTMLImageElement>,
  renderer: WebGLRenderer,
  env: Texture,
  dome: Texture,
): Mesh {
  map.colorSpace = SRGBColorSpace;
  map.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const h = (s.w * map.image.height) / map.image.width;
  const material = new MeshPhysicalMaterial({
    map,
    alphaTest: 0.5,
    metalness: 0.35,
    roughness: 0.3,
    clearcoat: 1,
    clearcoatRoughness: 0.16, // close to the aluminum's 0.28, a little glossier
    normalMap: dome,
    normalScale: new Vector2(0.18, 0.18),
    clearcoatNormalMap: dome,
    clearcoatNormalScale: new Vector2(0.18, 0.18),
    iridescence: 0.35,
    iridescenceIOR: 1.5,
    iridescenceThicknessRange: [180, 420],
    emissive: 0xffffff,
    emissiveMap: map,
    emissiveIntensity: s.glow ?? 0.6,
    envMap: env, // its own copy: only then does envMapIntensity apply
    envMapIntensity: 1.35,
    polygonOffset: true,
    polygonOffsetFactor: -4,
  });
  const patch: ShaderPatch = (shader) => {
    shader.uniforms.uStickerGloss = stickerGloss;
    shader.fragmentShader =
      "uniform float uStickerGloss;\n" +
      swap(
        shader.fragmentShader,
        "#include <lights_physical_fragment>",
        swap(
          ShaderChunk.lights_physical_fragment,
          "material.clearcoatF0 = vec3( 0.04 );",
          "material.clearcoatF0 = vec3( uStickerGloss );",
        ),
      );
  };
  material.userData.patch = patch;
  const mesh = new Mesh(new PlaneGeometry(s.w, h), material);
  // lie flat on the lid, upright for somebody looking at the open lid from behind
  mesh.rotation.set(-Math.PI / 2, 0, Math.PI + MathUtils.degToRad(s.rot));
  mesh.position.set(s.x, 0.0022, s.z);
  mesh.name = "Sticker";
  return mesh;
}

// The stickers' slight dome as a normal map: flat in the middle, leaning
// outwards by a few degrees towards the rim.
function stickerDome(): DataTexture {
  const N = 64;
  const data = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const u = (x + 0.5) / N - 0.5;
      const v = (y + 0.5) / N - 0.5;
      const r = Math.hypot(u, v) * 2; // 0 in the middle, 1 at the rim
      const lean = 0.34 * r * r; // the tilt grows towards the rim
      const nx = r > 0 ? (u / (r / 2)) * lean : 0;
      const ny = r > 0 ? (v / (r / 2)) * lean : 0;
      const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      const i = (y * N + x) * 4;
      data[i] = Math.round((nx * 0.5 + 0.5) * 255);
      data[i + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      data[i + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      data[i + 3] = 255;
    }
  }
  const tex = new DataTexture(data, N, N, RGBAFormat);
  tex.magFilter = tex.minFilter = LinearFilter;
  tex.needsUpdate = true;
  return tex;
}
