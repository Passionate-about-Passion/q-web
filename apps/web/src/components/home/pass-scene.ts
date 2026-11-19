/**
 * The hanging event pass as a real 3D object (DESIGN.md HOME-1,
 * ADR-0008): a card with thickness, rounded and slightly bevelled edges
 * and a cut slot, a metal lanyard clip (Blender model, public/home/pass/
 * clip.glb) and a woven band that bends, twists with the card and
 * catches the light. Loaded only by hanging-pass.client.ts, through a
 * dynamic import, after first paint.
 *
 * Physics: the band is a chain of points (Verlet integration with
 * distance constraints and a little bending stiffness, so the fabric
 * curves but never folds sharply) hung from a fixed point above the frame;
 * the card's centre is one more, heavier point on that chain, so the card
 * swings on the clip like a pendulum. After every step the chain is made
 * exactly inextensible from the top down and the card is placed exactly at
 * the band's end, so band and pass can never come apart, not even under a
 * hard pull. The card, the clip and the band can all be grabbed. The band
 * is fixed in the clip's crimp and runs over the point it hangs from,
 * above the window: lifting the pass takes band up over that point (so it
 * never goes slack and folds), pulling it down lets more band come down
 * from above (the woven "Q-SUMMIT" keeps its place on the band's lower
 * end and its size; new band shows at the top), and let go, the band
 * springs back and the pass bounces up once before it settles. A held
 * pass stays exactly where the band can reach, so the band is always
 * taut under the hand and never fights it. Its turn about its own vertical
 * axis is a damped spring towards 0 or half a turn (front or back), and
 * the band twists along its length to follow it. Reflections come from a
 * room environment and two lights on clearcoat, metal and fabric, never
 * from a painted streak.
 *
 * The print: the card's faces show the card art in its own colors (the
 * texture is the light the card gives off, not tone mapped, so the navy
 * and the beam stay exactly the mockup's), with only a thin clear gloss
 * on top. The film grain is drawn here, in the shader, fixed to the card
 * and about a device pixel and a half fine, so it stays crisp at every
 * size instead of being blurred away in a texture.
 *
 * Cost: one canvas, a handful of draw calls, card art at 2048 x 2912 px,
 * device pixel ratio capped. The loop runs only while something moves
 * (the drop, a swing, a turn, a drag, the pointer) and sleeps once the
 * pass rests, when it is off screen and when the tab is hidden.
 */
import {
  CanvasTexture,
  AmbientLight,
  BufferAttribute,
  BufferGeometry,
  Color,
  DirectionalLight,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshPhysicalMaterial,
  NeutralToneMapping,
  Path,
  PerspectiveCamera,
  PMREMGenerator,
  Quaternion,
  Raycaster,
  RepeatWrapping,
  Scene,
  Shape,
  SRGBColorSpace,
  TextureLoader,
  Vector2,
  Vector3,
  WebGLRenderer,
  type Material,
  type Object3D,
  type Texture,
} from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

// ---- dimensions, in card widths -------------------------------------
const CARD_W = 1;
const CARD_H = 1.42;
const CARD_T = 0.022;
const CARD_R = 0.07;
const SLOT_W = 0.24;
const SLOT_H = 0.05;
/** Gap between the card's top edge and the top of the slot. */
const SLOT_TOP = 0.06;
const BAND_W = 0.17;
const BAND_T = 0.008;
/** From the band's end in the crimp down to the hook in the slot. */
const CLIP_LEN = 0.2682;
/** Hinge (band end) to the card's centre. */
const HINGE_TO_CENTER = CARD_H / 2 - SLOT_TOP + CLIP_LEN;

/**
 * The camera of the Blender still (references 07-blender/pass-render.json):
 * 18 degrees of vertical view, 10 degrees to the viewer's left of the card
 * and 4 above, so the live object stands exactly where the still shows it.
 * The canvas is wider than the still's 9 : 16 frame (WIDE), so a swing is
 * never cut at the canvas edge; the frame is its middle part.
 */
const CAMERA = {
  fov: 18,
  position: new Vector3(-1.44728, 1.11017, 8.20793),
  lookAt: new Vector3(0, 0.52736, 0),
};
export const FRAME = { aspect: 9 / 16 };
export const WIDE = 1.7;
/** The canvas also reaches this share of the frame's height below it, so
 *  the card is never cut while it lands or swings. */
export const BELOW = 0.22;
/** The band hangs from a point above the frame (behind the header). */
const ANCHOR_Y = 2.35;
/** The band's resting length, from that point to the clip's crimp. */
const BAND_REST = ANCHOR_Y - HINGE_TO_CENTER;
/** One woven "Q-SUMMIT" unit along the band, in world units. */
const BAND_TILE = 0.95625;

// ---- physics ----------------------------------------------------------
const SEGMENTS = 18;
const STEP = 1 / 120;
const GRAVITY = 26;
const DAMPING = 0.986;
/** The card loses more of its swing per step: it settles in about 3 s. */
const CARD_DAMPING = 0.982;
const ITERATIONS = 20;
/** Bending: two adjacent segments keep at least this share of their
 *  straight span (about 60 degrees of bend at most between them). */
const BEND_MIN = 1.72;
const BEND_STIFFNESS = 0.35;
/** The card swings on the hook, but no further than this from the line
 *  of the band's last stretch (the crimp holds the clip). */
const MAX_HINGE = 0.9;
/** How much band can go up over the hanging point (lift) or come down
 *  from it (pull). */
const SLIDE_IN = 0.5;
const SLIDE_OUT = 0.6;
/** Per step: how fast the band follows a hand, and slides back. */
const SLIDE_FOLLOW = 0.16;
/** Let go: the band springs back to its length, about 0.45 s a swing,
 *  overshooting once (the pass bounces up), then settles. */
const SLIDE_K = 190;
const SLIDE_C = 9.5;
/** How far the pass can be pulled from where it hangs, and lifted. */
const REACH = 0.8;
const LIFT = 0.3;
/** The most a point may move per step when the pass is let go. */
const MAX_RELEASE = 0.018;
/** Inverse mass: the band is light, the card heavy. */
const W_BAND = 1;
const W_CARD = 0.12;
/** The turn spring: about 0.9 s to half a turn with a slight overshoot. */
const TURN_K = 46;
const TURN_C = 7.6;

// ---- the print --------------------------------------------------------
/** How much of the art the card gives off by itself, and how much it takes
 *  from the lights (a little shading, so it still reads as an object). */
const PRINT_GLOW = 0.8;
const PRINT_SHADE = 0.1;
/** Film grain strength: the dark front shows it more than the ice back. */
const GRAIN_FRONT = 0.17;
const GRAIN_BACK = 0.07;
/** Sample the art half a mip level sharper than the GPU would choose. */
const MIP_BIAS = -0.6;

/**
 * Patches a card face's shader: sharper sampling of the art and a fine
 * film grain fixed to the card (value noise on a grid that is about a
 * device pixel and a half per cell at the card's size on screen, set in
 * resize()), multiplied into the print so it shows in the light and fades
 * in the dark, as grain on a printed card does, and kept off the type.
 */
function printShader(
  material: MeshPhysicalMaterial,
  strength: number,
  cells: { value: number },
): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uGrain = { value: strength };
    shader.uniforms.uGrainCells = cells;
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
uniform float uGrain;
uniform float uGrainCells;
float grainHash(vec2 p) {
  p = fract(p * vec2(443.897, 441.423));
  p += dot(p, p.yx + 19.19);
  return fract((p.x + p.y) * p.x);
}
float grainNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = grainHash(i);
  float b = grainHash(i + vec2(1.0, 0.0));
  float c = grainHash(i + vec2(0.0, 1.0));
  float d = grainHash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}`,
      )
      .replace(
        "#include <map_fragment>",
        `#ifdef USE_MAP
  vec4 sampledDiffuseColor = texture( map, vMapUv, ${MIP_BIAS.toFixed(2)} );
  diffuseColor *= sampledDiffuseColor;
#endif
#ifdef USE_MAP
  // No grain on the type and the rules: printed ink is solid.
  float ink = smoothstep(0.18, 0.5, dot(sampledDiffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722)));
  float grain = 1.0 + uGrain * (1.0 - ink) * 2.0 * (grainNoise(vMapUv * vec2(uGrainCells, uGrainCells * 1.42)) - 0.5);
#else
  float grain = 1.0;
#endif
  diffuseColor.rgb *= grain;`,
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#ifdef USE_EMISSIVEMAP
  vec4 emissiveColor = texture( emissiveMap, vEmissiveMapUv, ${MIP_BIAS.toFixed(2)} );
  totalEmissiveRadiance *= emissiveColor.rgb * grain;
#endif`,
      );
  };
}

interface Point {
  p: Vector3;
  q: Vector3;
  w: number;
}

export interface PassTextures {
  front: string;
  back: string;
  band: string;
  weave: string;
  clip: string;
}

export interface PassScene {
  canvas: HTMLCanvasElement;
  /** The pass falls in from above the frame and swings out. */
  drop(): Promise<void>;
  /** Shows the pass at rest at once (no drop). */
  rest(): void;
  /** Turns the pass to its other face. Returns the new face. */
  turn(): "front" | "back";
  /** The face turned to the viewer. */
  face(): "front" | "back";
  /**
   * Shows a drawn front (a visitor's name on the card) instead of the
   * printed one; null goes back to the printed front.
   */
  setFront(drawn: HTMLCanvasElement | null): void;
  /** A small sideways swing, as a hand brushing the card would give. */
  nudge(): void;
  setVisible(visible: boolean): void;
  dispose(): void;
}

export async function createPassScene(
  host: HTMLElement,
  textures: PassTextures,
  options: {
    pixelRatio: number;
    onFrame?: () => void;
    /** Called after every turn, whatever started it. */
    onTurn?: (face: "front" | "back") => void;
  } = { pixelRatio: 1.5 },
): Promise<PassScene> {
  const canvas = document.createElement("canvas");
  canvas.className = "hp-canvas";
  canvas.setAttribute("aria-hidden", "true");

  const renderer = new WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    powerPreference: "default",
  });
  renderer.setPixelRatio(options.pixelRatio);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = NeutralToneMapping;
  renderer.toneMappingExposure = 1.02;
  renderer.setClearColor(0x000000, 0);

  const scene = new Scene();
  const pmrem = new PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  scene.environment = pmrem.fromScene(room, 0.04).texture;
  scene.environmentIntensity = 0.75;
  room.dispose();

  // The page's own colors, so the scene follows the tokens.
  const css = getComputedStyle(document.documentElement);
  const token = (name: string, fallback: string) =>
    new Color(css.getPropertyValue(name).trim() || fallback);
  const ice = token("--color-ticket-ice", "#bbe4ff");
  const paper = token("--color-ticket-ground", "#f3f7fc");

  // The still's lights: a soft key from the upper left, a cool ice rim
  // from the right, a low blue fill from below.
  const key = new DirectionalLight(0xfffbf7, 1.6);
  key.position.set(-3.2, 3.4, 3.6);
  const rim = new DirectionalLight(ice, 1.5);
  rim.position.set(3.4, 1.4, -1.2);
  const low = new DirectionalLight(0xb0d6ff, 0.35);
  low.position.set(-1.2, -2.6, 5);
  const fill = new AmbientLight(0xffffff, 0.08);
  scene.add(key, rim, low, fill);

  const camera = new PerspectiveCamera(CAMERA.fov, 1, 0.1, 50);

  // ---- textures
  const loader = new TextureLoader();
  const maxAnisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const load = (url: string, srgb = true): Promise<Texture | null> =>
    loader
      .loadAsync(url)
      .then((t) => {
        t.colorSpace = srgb ? SRGBColorSpace : t.colorSpace;
        t.anisotropy = maxAnisotropy;
        return t;
      })
      .catch(() => null);

  const [frontTex, backTex, bandTex, weaveTex, clipModel] = await Promise.all([
    load(textures.front),
    load(textures.back),
    load(textures.band),
    load(textures.weave, false),
    new GLTFLoader()
      .loadAsync(textures.clip)
      .then((gltf) => gltf.scene as Object3D)
      .catch(() => null),
  ]);

  // ---- the card
  const cardGeo = buildCardGeometry();
  // The print gives off its own colors (emissive, not tone mapped) and
  // takes only a little shading from the lights, so the art reads exactly
  // as drawn; a thin, sharp clearcoat adds the laminate's gloss without a
  // grey veil of reflected room (even a faint one lifts the deep navy).
  const laminate = {
    roughness: 0.62,
    specularIntensity: 0,
    clearcoat: 0.5,
    clearcoatRoughness: 0.08,
    envMapIntensity: 0.06,
    emissive: new Color(0xffffff),
    emissiveIntensity: PRINT_GLOW,
    toneMapped: false,
  };
  const grainCells = { value: 560 };
  const frontMat = new MeshPhysicalMaterial({
    ...laminate,
    color: new Color(PRINT_SHADE, PRINT_SHADE, PRINT_SHADE),
    map: frontTex,
    emissiveMap: frontTex,
  });
  const backMat = new MeshPhysicalMaterial({
    ...laminate,
    color: new Color(PRINT_SHADE, PRINT_SHADE, PRINT_SHADE),
    map: backTex,
    emissiveMap: backTex,
  });
  if (!frontTex) {
    frontMat.color.copy(token("--color-navy", "#072077"));
    frontMat.emissiveIntensity = 0;
  }
  if (!backTex) {
    backMat.color.copy(paper);
    backMat.emissiveIntensity = 0;
  }
  printShader(frontMat, GRAIN_FRONT, grainCells);
  printShader(backMat, GRAIN_BACK, grainCells);
  // The PVC core shows at the edge: white, but satin, so the rim light
  // does not draw a bright outline around the card.
  const edgeMat = new MeshPhysicalMaterial({
    color: paper.clone().lerp(ice, 0.55).multiplyScalar(0.9),
    roughness: 0.55,
    clearcoat: 0.25,
    clearcoatRoughness: 0.4,
  });
  const card = new Mesh(cardGeo, [frontMat, backMat, edgeMat]);

  // ---- the clip, hanging from the slot
  const metal = new MeshPhysicalMaterial({
    color: 0xdde3ec,
    metalness: 1,
    roughness: 0.26,
  });
  const clip = clipModel ?? buildFallbackClip();
  clip.traverse((node) => {
    const mesh = node as Mesh;
    if (mesh.isMesh) mesh.material = metal;
  });
  clip.position.set(0, CARD_H / 2 - SLOT_TOP, 0);

  const body = new Group();
  body.add(card, clip);
  scene.add(body);

  // ---- the band
  const band = buildBand();
  const bandMat = new MeshPhysicalMaterial({
    color: bandTex ? 0xffffff : paper,
    map: bandTex,
    normalMap: weaveTex,
    normalScale: new Vector2(0.55, 0.55),
    roughness: 0.82,
    sheen: 0.7,
    sheenRoughness: 0.45,
    sheenColor: ice,
  });
  if (bandTex) {
    bandTex.wrapS = RepeatWrapping;
    bandTex.wrapT = RepeatWrapping;
  }
  if (weaveTex) {
    weaveTex.wrapS = RepeatWrapping;
    weaveTex.wrapT = RepeatWrapping;
    // Sixteen threads per tile: four tiles across the band, 22.5 per
    // woven unit along it.
    weaveTex.repeat.set(22.5, 4);
  }
  const bandMesh = new Mesh(band.geometry, bandMat);
  bandMesh.frustumCulled = false;
  scene.add(bandMesh);

  // ---- the chain
  const points: Point[] = [];
  /** The band's resting length, from the anchor to the crimp. */
  const REST_LEN = BAND_REST;
  let bandLen = REST_LEN;
  let bandVel = 0;
  let segLen = REST_LEN / SEGMENTS;
  for (let i = 0; i <= SEGMENTS; i++) {
    const p = new Vector3(0, ANCHOR_Y - i * segLen, 0);
    points.push({ p, q: p.clone(), w: i === 0 ? 0 : W_BAND });
  }
  const center: Point = {
    p: new Vector3(0, 0, 0),
    q: new Vector3(0, 0, 0),
    w: W_CARD,
  };
  const chain = [...points, center];
  const lengths = chain
    .slice(1)
    .map((_, i) => (i < SEGMENTS ? segLen : HINGE_TO_CENTER));

  const tmp = new Vector3();
  let anchorY = ANCHOR_Y;
  let turn = 0;
  let turnVel = 0;
  let turnTarget = 0;
  let lean = 0;
  let face: "front" | "back" = "front";
  const grab = {
    active: false,
    point: center as Point,
    target: new Vector3(),
    offset: new Vector3(),
  };

  /** Hangs the pass straight, raised by offsetY, the card leaning a
      little (swingX) so it settles with a small swing. */
  function placeAtRest(offsetY = 0, swingX = 0): void {
    setBandLength(REST_LEN);
    bandVel = 0;
    chain.forEach((pt, i) => {
      const y =
        i <= SEGMENTS
          ? ANCHOR_Y - i * segLen
          : ANCHOR_Y - SEGMENTS * segLen - HINGE_TO_CENTER;
      const share = i <= SEGMENTS ? (i / SEGMENTS) * 0.4 : 1;
      pt.p.set(swingX * share, y + offsetY, 0);
      pt.q.copy(pt.p);
    });
    anchorY = ANCHOR_Y + offsetY;
  }

  function simulate(): void {
    points[0]!.p.set(0, anchorY, 0);
    points[0]!.q.copy(points[0]!.p);
    for (const pt of chain) {
      if (pt.w === 0) continue;
      const d = pt === center ? DAMPING * CARD_DAMPING : DAMPING;
      const vx = (pt.p.x - pt.q.x) * d;
      const vy = (pt.p.y - pt.q.y) * d;
      const vz = (pt.p.z - pt.q.z) * d;
      pt.q.copy(pt.p);
      pt.p.x += vx;
      pt.p.y += vy - GRAVITY * STEP * STEP;
      pt.p.z += vz - pt.p.z * 0.02;
    }
    // The band runs over its hanging point. Held by the card, it takes the
    // length that keeps it taut in a straight line from the anchor to the
    // card (the goal is kept where that length is possible, onMove), so
    // hand and band never pull against each other; a lift takes the slack
    // in at once, letting band out is eased. Let go, it springs back.
    if (grab.active) {
      const goal = grab.target.clone().sub(grab.offset);
      grab.point.p.lerp(goal, grab.point === center ? 0.18 : 0.3);
      let next = bandLen;
      if (grab.point === center) {
        const want = clampLen(goal.distanceTo(points[0]!.p) - HINGE_TO_CENTER);
        next =
          want < bandLen ? want : bandLen + (want - bandLen) * SLIDE_FOLLOW;
      }
      bandVel = (next - bandLen) / STEP;
      setBandLength(next);
    } else {
      bandVel += (SLIDE_K * (REST_LEN - bandLen) - SLIDE_C * bandVel) * STEP;
      setBandLength(clampLen(bandLen + bandVel * STEP));
    }
    for (let k = 0; k < ITERATIONS; k++) {
      for (let i = 0; i < chain.length - 1; i++) {
        const a = chain[i]!;
        const b = chain[i + 1]!;
        const d = tmp.copy(b.p).sub(a.p);
        const len = d.length() || 1e-6;
        const sum = a.w + b.w;
        if (sum === 0) continue;
        const diff = (len - lengths[i]!) / (len * sum);
        a.p.addScaledVector(d, diff * a.w);
        b.p.addScaledVector(d, -diff * b.w);
      }
      // Bending: the band resists folding (a soft minimum span over two
      // segments).
      for (let i = 0; i < SEGMENTS - 1; i++) {
        const a = points[i]!;
        const b = points[i + 2]!;
        const d = tmp.copy(b.p).sub(a.p);
        const len = d.length() || 1e-6;
        const min = segLen * BEND_MIN;
        if (len >= min) continue;
        const sum = a.w + b.w;
        if (sum === 0) continue;
        const diff = ((len - min) / (len * sum)) * BEND_STIFFNESS;
        a.p.addScaledVector(d, diff * a.w);
        b.p.addScaledVector(d, -diff * b.w);
      }
    }
    inextensible();
    // The turn: a damped spring, plus a lean towards the pointer.
    const goal = turnTarget + lean;
    turnVel += (TURN_K * (goal - turn) - TURN_C * turnVel) * STEP;
    turn += turnVel * STEP;
  }

  function clampLen(len: number): number {
    return Math.min(REST_LEN + SLIDE_OUT, Math.max(REST_LEN - SLIDE_IN, len));
  }

  function setBandLength(next: number): void {
    bandLen = next;
    segLen = bandLen / SEGMENTS;
    for (let i = 0; i < SEGMENTS; i++) lengths[i] = segLen;
  }

  // ---- the chain, made exact: from the anchor down, every point sits at
  // exactly its length below the one above (the correction moves a point
  // and its previous position together, so it adds no speed), and the card
  // hangs at exactly its length below the band's end, swinging on the hook
  // within MAX_HINGE of the band's last stretch.
  const seg = new Vector3();
  const shift = new Vector3();
  const cardDir = new Vector3();
  const COS_HINGE = Math.cos(MAX_HINGE);
  const SIN_HINGE = Math.sin(MAX_HINGE);
  function place(pt: Point, from: Vector3, dir: Vector3, len: number): void {
    shift.copy(from).addScaledVector(dir, len).sub(pt.p);
    pt.p.add(shift);
    pt.q.add(shift);
  }
  function inextensible(): void {
    for (let i = 1; i <= SEGMENTS; i++) {
      const a = points[i - 1]!;
      const b = points[i]!;
      seg.copy(b.p).sub(a.p);
      const len = seg.length();
      if (len < 1e-9) seg.set(0, -1, 0);
      else seg.divideScalar(len);
      place(b, a.p, seg, segLen);
    }
    // seg now holds the band's last stretch, as a unit vector.
    const hinge = points[SEGMENTS]!.p;
    cardDir.copy(center.p).sub(hinge);
    const len = cardDir.length();
    if (len < 1e-9) cardDir.copy(seg);
    else cardDir.divideScalar(len);
    const cos = cardDir.dot(seg);
    if (cos < COS_HINGE) {
      // Keep the side it swings to, limit how far.
      cardDir.addScaledVector(seg, -cos);
      if (cardDir.lengthSq() < 1e-12) cardDir.set(1, 0, 0);
      cardDir
        .normalize()
        .multiplyScalar(SIN_HINGE)
        .addScaledVector(seg, COS_HINGE);
    }
    place(center, hinge, cardDir, HINGE_TO_CENTER);
  }

  // ---- pose: card body from the last two chain points, band from all
  const qAlign = new Quaternion();
  const qTurn = new Quaternion();
  const down = new Vector3();
  const DOWN = new Vector3(0, -1, 0);
  const UP = new Vector3(0, 1, 0);

  // The card hangs from the band's end by construction: its clip's crimp
  // sits exactly on the last band point, so the two never part.
  const bandPoints = points.map((pt) => pt.p);
  const lead = new Vector3();
  function pose(): void {
    const hinge = points[SEGMENTS]!.p;
    down.copy(center.p).sub(hinge);
    if (down.lengthSq() < 1e-12) down.set(0, -1, 0);
    down.normalize();
    qAlign.setFromUnitVectors(DOWN, down);
    qTurn.setFromAxisAngle(UP, turn);
    body.quaternion.copy(qAlign).multiply(qTurn);
    body.position.copy(hinge).addScaledVector(down, HINGE_TO_CENTER);
    // The band runs into the crimp along the clip's line.
    lead.copy(hinge).addScaledVector(down, segLen);
    band.update(bandPoints, lead, body.quaternion);
  }

  // ---- size and camera
  function resize(): void {
    const rect = host.getBoundingClientRect();
    const frameH = rect.height;
    const frameW = frameH * FRAME.aspect;
    const w = Math.max(1, Math.round(frameW * WIDE));
    const h = Math.max(1, Math.round(frameH * (1 + BELOW)));
    renderer.setSize(w, h, false);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    // The camera's full view is the still's frame grown evenly above and
    // below; the canvas shows the frame and the strip below it, so the
    // frame keeps exactly the still's projection.
    const grow = 1 + 2 * BELOW;
    const fullH = frameH * grow;
    camera.fov =
      (2 * Math.atan(Math.tan((CAMERA.fov * Math.PI) / 360) * grow) * 180) /
      Math.PI;
    camera.aspect = w / fullH;
    camera.position.copy(CAMERA.position);
    camera.lookAt(CAMERA.lookAt);
    camera.setViewOffset(w, fullH, 0, frameH * BELOW, w, h);
    camera.updateProjectionMatrix();
    // The card's width on screen, in device pixels: one grain cell for
    // about every one and a half of them.
    const left = new Vector3(-CARD_W / 2, 0, 0).project(camera);
    const right = new Vector3(CARD_W / 2, 0, 0).project(camera);
    const cardPx =
      (Math.abs(right.x - left.x) / 2) * w * renderer.getPixelRatio();
    grainCells.value = Math.max(260, Math.min(900, cardPx / 1.5));
    wake();
  }

  // ---- loop
  let raf = 0;
  let last = 0;
  let acc = 0;
  let calm = 0;
  let visible = true;
  let disposed = false;

  // Rest is judged on what the eye sees: how far any point moved since
  // the last drawn frame (the solver keeps a tiny residual under gravity
  // that never reaches zero, but stays far below a pixel).
  const lastDrawn = chain.map((pt) => pt.p.clone());
  let lastTurn = 0;
  function moving(): boolean {
    let max = 0;
    chain.forEach((pt, i) => {
      max = Math.max(max, pt.p.distanceToSquared(lastDrawn[i]!));
      lastDrawn[i]!.copy(pt.p);
    });
    const turned = Math.abs(turn - lastTurn);
    lastTurn = turn;
    return (
      grab.active ||
      Math.abs(bandVel) > 1e-4 ||
      max > 4e-8 ||
      turned > 1e-4 ||
      Math.abs(turnTarget + lean - turn) > 1e-3
    );
  }

  function frame(now: number): void {
    raf = 0;
    if (disposed || !visible) return;
    const dt = Math.min(0.05, last ? (now - last) / 1000 : STEP);
    last = now;
    acc += dt;
    while (acc >= STEP) {
      simulate();
      acc -= STEP;
    }
    pose();
    renderer.render(scene, camera);
    options.onFrame?.();
    calm = moving() ? 0 : calm + 1;
    if (calm < 24) raf = requestAnimationFrame(frame);
    else last = 0;
  }

  function wake(): void {
    calm = 0;
    if (!raf && visible && !disposed) {
      raf = requestAnimationFrame(frame);
    }
  }

  // ---- interaction (on the host, the frame the still occupies)
  const ray = new Raycaster();
  const ndc = new Vector2();
  const plane = new Vector3();
  let down0: {
    x: number;
    y: number;
    t: number;
    id: number;
    touch: boolean;
  } | null = null;
  let dragging = false;

  function toWorld(event: PointerEvent): Vector3 | null {
    const rect = canvas.getBoundingClientRect();
    ndc.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    ray.setFromCamera(ndc, camera);
    const t = -ray.ray.origin.z / ray.ray.direction.z;
    if (!Number.isFinite(t)) return null;
    return plane.copy(ray.ray.origin).addScaledVector(ray.ray.direction, t);
  }

  /** What the pointer is on: the pass (card or clip), a point of the band,
   *  or nothing. */
  let grabbed: Point = center;
  function hits(event: PointerEvent): boolean {
    const rect = canvas.getBoundingClientRect();
    ndc.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    ray.setFromCamera(ndc, camera);
    if (ray.intersectObject(body, true).length > 0) {
      grabbed = center;
      return true;
    }
    const onBand = ray.intersectObject(bandMesh, false)[0];
    if (!onBand) return false;
    // The nearest movable point of the band (never the fixed anchor).
    let best = points[1]!;
    let dist = Infinity;
    for (let i = 1; i <= SEGMENTS; i++) {
      const d = points[i]!.p.distanceToSquared(onBand.point);
      if (d < dist) {
        dist = d;
        best = points[i]!;
      }
    }
    grabbed = best;
    return true;
  }

  const onDown = (event: PointerEvent) => {
    if (event.button !== 0 || !hits(event)) return;
    down0 = {
      x: event.clientX,
      y: event.clientY,
      t: performance.now(),
      id: event.pointerId,
      touch: event.pointerType !== "mouse",
    };
    dragging = false;
  };

  const onMove = (event: PointerEvent) => {
    if (event.pointerType === "mouse" && !down0) {
      // A fine pointer over the hero turns the pass a little towards it.
      const rect = host.getBoundingClientRect();
      const x =
        (event.clientX - (rect.left + rect.width / 2)) / (rect.width * 1.5);
      lean = Math.max(-1, Math.min(1, x)) * 0.32;
      wake();
      return;
    }
    if (!down0 || event.pointerId !== down0.id) return;
    const dx = event.clientX - down0.x;
    const dy = event.clientY - down0.y;
    if (!dragging) {
      // Touch: only a sideways pull swings the pass; up and down stay
      // the page's scroll (the canvas keeps touch-action: pan-y).
      if (down0.touch && Math.abs(dy) > Math.abs(dx)) {
        down0 = null;
        return;
      }
      if (Math.hypot(dx, dy) < 6) return;
      const at = toWorld(event);
      if (!at) return;
      dragging = true;
      grab.active = true;
      grab.point = grabbed;
      grab.offset.copy(at).sub(grabbed.p);
      host.setPointerCapture?.(event.pointerId);
      host.classList.add("is-grabbing");
    }
    const at = toWorld(event);
    if (!at) return;
    if (grab.point !== center) {
      // The band: the chain itself limits how far it follows.
      grab.target.copy(at);
      wake();
      return;
    }
    // The pass: never further than a reach from where it hangs, and
    // lifted only a little (a card held up lets its band go slack, which
    // would leave the frame).
    const rest = new Vector3(0, 0, 0);
    at.sub(grab.offset);
    const off = at.clone().sub(rest);
    off.y = Math.min(off.y, LIFT);
    if (off.length() > REACH) off.setLength(REACH);
    const goal = rest.add(off);
    // Within the band's reach: at least its shortest, at most its longest
    // length (plus the clip and half the card) from the anchor, so a pass
    // held up and to the side never asks for a band it cannot have.
    const anchor = points[0]!.p;
    const span = goal.clone().sub(anchor);
    const dist = span.length() || 1e-6;
    const near = REST_LEN - SLIDE_IN + HINGE_TO_CENTER;
    const far = REST_LEN + SLIDE_OUT + HINGE_TO_CENTER;
    if (dist < near || dist > far) {
      goal
        .copy(anchor)
        .addScaledVector(span, Math.min(far, Math.max(near, dist)) / dist);
    }
    grab.target.copy(goal).add(grab.offset);
    wake();
  };

  const onUp = (event: PointerEvent) => {
    if (!down0 || event.pointerId !== down0.id) return;
    const quick = performance.now() - down0.t < 450;
    // Let go: the pass keeps the hand's swing, up to a calm limit.
    if (dragging) {
      for (const pt of chain) {
        if (pt.w === 0) continue;
        shift.copy(pt.p).sub(pt.q);
        if (shift.length() > MAX_RELEASE) {
          shift.setLength(MAX_RELEASE);
          pt.q.copy(pt.p).sub(shift);
        }
      }
    }
    if (!dragging && quick && grabbed === center) passTurn();
    grab.active = false;
    dragging = false;
    down0 = null;
    host.classList.remove("is-grabbing");
    wake();
  };

  const onLeave = () => {
    lean = 0;
    wake();
  };

  host.addEventListener("pointerdown", onDown);
  window.addEventListener("pointermove", onMove, { passive: true });
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onUp);
  host.addEventListener("pointerleave", onLeave);

  function passTurn(): "front" | "back" {
    face = face === "front" ? "back" : "front";
    turnTarget = face === "back" ? Math.PI : 0;
    turnVel += face === "back" ? 1.2 : -1.2;
    // A small sideways nudge, as a hand turning it would give.
    center.p.x += 0.0012;
    wake();
    options.onTurn?.(face);
    return face;
  }

  const ro = new ResizeObserver(resize);
  ro.observe(host);
  resize();
  placeAtRest(3.2, 0);
  pose();
  host.prepend(canvas);

  canvas.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    host.classList.remove("is-3d");
  });

  let drawnTex: CanvasTexture | null = null;

  return {
    canvas,
    face: () => face,
    setFront(drawn) {
      if (drawn) {
        if (!drawnTex || drawnTex.image !== drawn) {
          drawnTex?.dispose();
          drawnTex = new CanvasTexture(drawn);
          drawnTex.colorSpace = SRGBColorSpace;
          drawnTex.anisotropy = maxAnisotropy;
        }
        drawnTex.needsUpdate = true;
        frontMat.map = drawnTex;
        frontMat.emissiveMap = drawnTex;
      } else {
        frontMat.map = frontTex;
        frontMat.emissiveMap = frontTex;
      }
      frontMat.needsUpdate = true;
      wake();
    },
    nudge() {
      if (grab.active) return;
      center.p.x += 0.0018;
      wake();
    },
    drop() {
      // The whole pass glides down as one piece (every point moves by the
      // same amount, so the chain gains no swing of its own), overshoots a
      // little as a lanyard catching its weight would, and then gets one
      // small nudge: it settles in two or three calm swings.
      const HEIGHT = 3;
      placeAtRest(HEIGHT, 0);
      let offset = HEIGHT;
      wake();
      return new Promise<void>((resolve) => {
        const start = performance.now();
        const tick = (now: number) => {
          const t = Math.min(1, (now - start) / 1300);
          // Ease out with a slight overshoot ("back" easing, s = 1.2).
          const u = t - 1;
          const e = 1 + 2.2 * u * u * u + 1.2 * u * u;
          const next = HEIGHT * (1 - e);
          const delta = next - offset;
          offset = next;
          for (const pt of chain) {
            pt.p.y += delta;
            pt.q.y += delta;
          }
          anchorY += delta;
          wake();
          if (t < 1 && !disposed) {
            requestAnimationFrame(tick);
          } else {
            center.p.x += 0.0022;
            wake();
            resolve();
          }
        };
        requestAnimationFrame(tick);
      });
    },
    rest() {
      placeAtRest(0, 0);
      turn = turnTarget;
      turnVel = 0;
      pose();
      renderer.render(scene, camera);
      options.onFrame?.();
    },
    turn: passTurn,
    setVisible(next) {
      visible = next;
      if (next) wake();
      else if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
        last = 0;
      }
    },
    dispose() {
      disposed = true;
      ro.disconnect();
      host.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      host.removeEventListener("pointerleave", onLeave);
      if (raf) cancelAnimationFrame(raf);
      cardGeo.dispose();
      band.geometry.dispose();
      for (const m of [
        frontMat,
        backMat,
        edgeMat,
        bandMat,
        metal,
      ] as Material[])
        m.dispose();
      for (const t of [frontTex, backTex, bandTex, weaveTex, drawnTex])
        t?.dispose();
      pmrem.dispose();
      renderer.dispose();
      canvas.remove();
    },
  };
}

/**
 * The card: a rounded rectangle with the slot cut through, extruded to
 * its thickness with a small bevel. Materials: 0 front face, 1 back face,
 * 2 edge. Face UVs span the card, the back mirrored so it reads from
 * behind.
 */
function buildCardGeometry(): BufferGeometry {
  const w = CARD_W / 2;
  const h = CARD_H / 2;
  const r = CARD_R;
  const shape = new Shape();
  shape.moveTo(-w + r, -h);
  shape.lineTo(w - r, -h);
  shape.quadraticCurveTo(w, -h, w, -h + r);
  shape.lineTo(w, h - r);
  shape.quadraticCurveTo(w, h, w - r, h);
  shape.lineTo(-w + r, h);
  shape.quadraticCurveTo(-w, h, -w, h - r);
  shape.lineTo(-w, -h + r);
  shape.quadraticCurveTo(-w, -h, -w + r, -h);

  const sw = SLOT_W / 2;
  const sh = SLOT_H / 2;
  const sy = h - SLOT_TOP - sh;
  const slot = new Path();
  slot.moveTo(-sw + sh, sy - sh);
  slot.lineTo(sw - sh, sy - sh);
  slot.absarc(sw - sh, sy, sh, -Math.PI / 2, Math.PI / 2, false);
  slot.lineTo(-sw + sh, sy + sh);
  slot.absarc(-sw + sh, sy, sh, Math.PI / 2, (3 * Math.PI) / 2, false);
  shape.holes.push(slot);

  const bevel = 0.0045;
  const geo = new ExtrudeGeometry(shape, {
    depth: CARD_T - bevel * 2,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 3,
    curveSegments: 18,
  });
  geo.translate(0, 0, -(CARD_T - bevel * 2) / 2);

  // Split the lids into front (z > 0) and back, rebuild the face UVs.
  const pos = geo.getAttribute("position");
  const uv = geo.getAttribute("uv");
  const [lids, sides] = geo.groups;
  geo.clearGroups();
  if (lids && sides) {
    const half = lids.count / 2;
    const firstZ = pos.getZ(lids.start);
    const backFirst = firstZ < 0;
    geo.addGroup(lids.start, half, backFirst ? 1 : 0);
    geo.addGroup(lids.start + half, half, backFirst ? 0 : 1);
    geo.addGroup(sides.start, sides.count, 2);
    for (let i = lids.start; i < lids.start + lids.count; i++) {
      const u = (pos.getX(i) + w) / CARD_W;
      const v = (pos.getY(i) + h) / CARD_H;
      uv.setXY(i, pos.getZ(i) > 0 ? u : 1 - u, v);
    }
    uv.needsUpdate = true;
  }
  geo.computeVertexNormals();
  return geo;
}

/** A plain crimp and hook, used only if clip.glb cannot be loaded. */
function buildFallbackClip(): Object3D {
  const group = new Group();
  const crimp = new Mesh(
    new ExtrudeGeometry(roundedRect(0.19, 0.09, 0.02), {
      depth: 0.03,
      bevelEnabled: true,
      bevelThickness: 0.006,
      bevelSize: 0.006,
      bevelSegments: 2,
    }),
  );
  crimp.geometry.translate(0, CLIP_LEN - 0.045, -0.015);
  const stem = new Mesh(
    new ExtrudeGeometry(roundedRect(0.03, CLIP_LEN - 0.08, 0.012), {
      depth: 0.016,
      bevelEnabled: false,
    }),
  );
  stem.geometry.translate(0, (CLIP_LEN - 0.08) / 2 - 0.01, -0.008);
  group.add(crimp, stem);
  return group;
}

function roundedRect(width: number, height: number, radius: number): Shape {
  const w = width / 2;
  const h = height / 2;
  const s = new Shape();
  s.moveTo(-w + radius, -h);
  s.lineTo(w - radius, -h);
  s.quadraticCurveTo(w, -h, w, -h + radius);
  s.lineTo(w, h - radius);
  s.quadraticCurveTo(w, h, w - radius, h);
  s.lineTo(-w + radius, h);
  s.quadraticCurveTo(-w, h, -w, h - radius);
  s.lineTo(-w, -h + radius);
  s.quadraticCurveTo(-w, -h, -w + radius, -h);
  return s;
}

/**
 * The woven band: a strip with real thickness (front, back and both
 * edges, each with its own normals) swept along a smooth curve through
 * the chain. Its width turns with the card towards the bottom. UVs: U
 * along the band (the albedo tiles every eight band widths), V across.
 */
function buildBand() {
  const SAMPLES = 44;
  const VERTICES_PER = 8;
  const geometry = new BufferGeometry();
  const positions = new Float32Array(SAMPLES * VERTICES_PER * 3);
  const normals = new Float32Array(SAMPLES * VERTICES_PER * 3);
  const uvs = new Float32Array(SAMPLES * VERTICES_PER * 2);
  const index: number[] = [];
  for (let i = 0; i < SAMPLES - 1; i++) {
    const a = i * VERTICES_PER;
    const b = (i + 1) * VERTICES_PER;
    for (let f = 0; f < 4; f++) {
      const p0 = a + f * 2;
      const p1 = p0 + 1;
      const q0 = b + f * 2;
      const q1 = q0 + 1;
      index.push(p0, q0, p1, p1, q0, q1);
    }
  }
  geometry.setIndex(index);
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new BufferAttribute(uvs, 2));

  const curve: Vector3[] = Array.from({ length: SAMPLES }, () => new Vector3());
  const t = new Vector3();
  const side = new Vector3();
  const n = new Vector3();
  const X = new Vector3(1, 0, 0);
  const tmpQ = new Quaternion();
  const crimpSide = new Vector3();

  function spline(pts: Vector3[], u: number, out: Vector3): Vector3 {
    const n1 = pts.length - 1;
    const x = u * n1;
    const i = Math.min(n1 - 1, Math.floor(x));
    const f = x - i;
    const p0 = pts[Math.max(0, i - 1)]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[Math.min(n1, i + 2)]!;
    const f2 = f * f;
    const f3 = f2 * f;
    for (const k of ["x", "y", "z"] as const) {
      out[k] =
        0.5 *
        (2 * p1[k] +
          (-p0[k] + p2[k]) * f +
          (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * f2 +
          (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * f3);
    }
    return out;
  }

  const ext: Vector3[] = [];
  const along = new Float32Array(SAMPLES);
  function update(chain: Vector3[], lead: Vector3, bodyQ: Quaternion): void {
    // The curve runs through the chain and ends on its last point; one
    // more point beyond it (lead) gives the end the clip's direction.
    ext.length = 0;
    ext.push(...chain, lead);
    const end = (ext.length - 2) / (ext.length - 1);
    for (let i = 0; i < SAMPLES; i++)
      spline(ext, (i / (SAMPLES - 1)) * end, curve[i]!);
    // The crimp's width direction at the bottom.
    crimpSide.copy(X).applyQuaternion(bodyQ);
    // The print is measured from the clip upwards: the woven words stay
    // where they are on the band's lower end, whatever its length, and
    // band let out or taken in comes from (or goes to) the point it hangs
    // from, above the window; nothing grows out of the clip and no letter
    // is stretched (U follows the band's true length along the curve).
    along[0] = 0;
    for (let i = 1; i < SAMPLES; i++)
      along[i] = along[i - 1]! + curve[i]!.distanceTo(curve[i - 1]!);
    const total = along[SAMPLES - 1]!;
    for (let i = 0; i < SAMPLES; i++) {
      const c = curve[i]!;
      const prev = curve[Math.max(0, i - 1)]!;
      const next = curve[Math.min(SAMPLES - 1, i + 1)]!;
      t.copy(next).sub(prev).normalize();
      // At rest this is the length from the top, as the print was laid
      // out; pulled or lifted, the lower end keeps its print.
      const length = BAND_REST - (total - along[i]!);
      // Width direction: world X at the top, the crimp's at the bottom,
      // eased in over the lower part of the band so it twists naturally.
      const s = i / (SAMPLES - 1);
      const k = s * s * (3 - 2 * s);
      side.copy(X).projectOnVector(t);
      side.copy(X).sub(side).normalize();
      tmpQ.setFromAxisAngle(t, 0);
      const target = crimpSide
        .clone()
        .sub(t.clone().multiplyScalar(crimpSide.dot(t)))
        .normalize();
      if (target.lengthSq() > 0.5) side.lerp(target, k).normalize();
      n.crossVectors(t, side).normalize();
      // keep the front facing the viewer at the top
      if (i === 0 && n.z < 0) {
        n.negate();
        side.negate();
      }
      writeSample(i, c, side, n, length);
    }
    geometry.attributes.position!.needsUpdate = true;
    geometry.attributes.normal!.needsUpdate = true;
    geometry.attributes.uv!.needsUpdate = true;
    geometry.computeBoundingSphere();
  }

  const v = new Vector3();
  function writeSample(
    i: number,
    c: Vector3,
    s: Vector3,
    nn: Vector3,
    len: number,
  ): void {
    const hw = BAND_W / 2;
    const ht = BAND_T / 2;
    // U runs down the band; one woven unit per BAND_TILE.
    const U = len / BAND_TILE;
    // corners
    const FL = c.clone().addScaledVector(s, -hw).addScaledVector(nn, ht);
    const FR = c.clone().addScaledVector(s, hw).addScaledVector(nn, ht);
    const BR = c.clone().addScaledVector(s, hw).addScaledVector(nn, -ht);
    const BL = c.clone().addScaledVector(s, -hw).addScaledVector(nn, -ht);
    const faces: [Vector3, Vector3, Vector3, number, number, number, number][] =
      [
        // front: the image's top row along the viewer's right edge
        [FL, FR, nn, 0, 1, 0, 0],
        // back, mirrored
        [BR, BL, v.copy(nn).negate().clone(), 0, 1, 0, 0],
        // left edge
        [BL, FL, s.clone().negate(), 0.03, 0.01, 0, 0],
        // right edge
        [FR, BR, s.clone(), 0.99, 0.97, 0, 0],
      ];
    faces.forEach(([a, b, normal, va, vb], f) => {
      const base = (i * 8 + f * 2) * 3;
      positions.set([a.x, a.y, a.z, b.x, b.y, b.z], base);
      normals.set(
        [normal.x, normal.y, normal.z, normal.x, normal.y, normal.z],
        base,
      );
      const ub = (i * 8 + f * 2) * 2;
      uvs.set([U, va, U, vb], ub);
    });
  }

  return { geometry, update };
}
