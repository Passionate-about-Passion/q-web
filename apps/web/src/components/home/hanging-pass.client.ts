/**
 * Starts the hanging pass (HangingPass.astro, DESIGN.md HOME-1, ADR-0008).
 *
 * The pre-rendered still (the same model, rendered in Blender) is the base
 * layer. The 3D scene (pass-scene.ts, three.js) is imported only when it
 * can help: WebGL works, motion is welcome and data is not being saved.
 * It loads in the background from the start, while the intro plays; if it
 * is ready when the pass is due to drop, the real object falls and swings
 * into place, otherwise the still swings in and the 3D pass takes over
 * once it rests in the same pose. The scene sleeps off screen and in
 * hidden tabs.
 *
 * "Put your name on it": once the 3D pass is there, the field under it
 * shows; what a visitor types is drawn onto the card's front
 * (pass-name.ts) and kept in this browser only (localStorage, never sent
 * anywhere). Typing, dragging and turning never set each other off: the
 * field does not turn the pass (while the back faces the visitor, the
 * hint under the card says the name is on the front), a drag never turns
 * it and a turn never touches the field. Once a name is on the card (a
 * short pause in typing, Enter or leaving the field) or the pass has been
 * turned, "Buy your ticket now" rises in under the field and stays: a
 * plain link to the ticket page, never opened by itself. Without the 3D
 * pass the field stays unseen, as the still cannot change, and on phones
 * it is not offered at all.
 */

import type { PassScene as Scene } from "./pass-scene";
import { BLANK_FRONT, drawNamedFront } from "./pass-name";

const NAME_KEY = "q27-pass-name";

export interface PassController {
  /** Whether the 3D scene is wanted at all on this device. */
  live: boolean;
  /** Resolves with the scene once it is ready, or null. */
  ready: Promise<Scene | null>;
  /** Plays the pass's entrance (3D fall or the still's swing). */
  enter(): Promise<void>;
}

const TEXTURES = {
  front: "/home/pass/card-front.webp",
  back: "/home/pass/card-back.webp",
  band: "/home/pass/lanyard-albedo.webp",
  weave: "/home/pass/lanyard-normal.webp",
  clip: "/home/pass/clip.glb",
};

function webglWorks(): boolean {
  try {
    const probe = document.createElement("canvas");
    const gl = probe.getContext("webgl2") ?? probe.getContext("webgl");
    if (!gl) return false;
    (gl as WebGLRenderingContext)
      .getExtension("WEBGL_lose_context")
      ?.loseContext();
    return true;
  } catch {
    return false;
  }
}

let controller: PassController | null = null;

export function getPassController(): PassController | null {
  if (controller) return controller;
  const host = document.querySelector<HTMLElement>("[data-pass]");
  if (!host) return null;
  const still = host.querySelector<HTMLImageElement>("[data-pass-still]");
  const button = document.querySelector<HTMLButtonElement>("[data-pass-turn]");

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const conn = (navigator as { connection?: { saveData?: boolean } })
    .connection;
  const live = !reduced && !conn?.saveData && webglWorks();

  let scene: Scene | null = null;
  // A turn, however it came (a click on the card, a tap, the hint
  // button): the hint reports the face, and the ticket link may rise.
  let onTurn: ((face: "front" | "back") => void) | null = null;
  const turned = (face: "front" | "back") => {
    button?.setAttribute("aria-pressed", String(face === "back"));
    onTurn?.(face);
  };
  const ready: Promise<Scene | null> = live
    ? import("./pass-scene")
        .then(({ createPassScene }) => {
          const phone = Math.min(window.innerWidth, window.innerHeight) < 600;
          const ratio = Math.min(
            window.devicePixelRatio || 1,
            phone ? 1.75 : 2,
          );
          return createPassScene(host, TEXTURES, {
            pixelRatio: ratio,
            onTurn: turned,
          });
        })
        .then((made) => {
          scene = made;
          return made;
        })
        .catch(() => null)
    : Promise.resolve(null);

  function show3d(): void {
    host!.classList.add("is-3d");
    if (button) button.hidden = false;
    initName();
  }

  // ---- the visitor's name on the card, and the way on to a ticket
  let named = false;
  function initName(): void {
    if (named || !scene) return;
    // Wide screens only: on a phone the field would crowd the hero.
    if (!window.matchMedia("(min-width: 48rem)").matches) return;
    named = true;
    const field = document.querySelector<HTMLElement>("[data-pass-name-field]");
    const input = field?.querySelector<HTMLInputElement>("[data-pass-name]");
    if (!field || !input) return;
    const claim = field.querySelector<HTMLElement>("[data-pass-claim]");
    const claimLink = claim?.querySelector<HTMLAnchorElement>(
      "[data-pass-claim-link]",
    );
    const hintFine = button?.querySelector<HTMLElement>(".hp-hint-fine");
    const hintTouch = button?.querySelector<HTMLElement>(".hp-hint-touch");
    const hints = [hintFine?.textContent, hintTouch?.textContent];
    const pass = scene;
    const blank = new Image();
    blank.decoding = "async";
    blank.src = BLANK_FRONT;
    const family = getComputedStyle(document.body).fontFamily;
    const drawn = document.createElement("canvas");
    let pending = 0;
    let settle = 0;

    /** The ticket link rises in, once; it never opens anything itself. */
    const showClaim = () => {
      if (!claim || claim.hasAttribute("data-shown")) return;
      claim.setAttribute("data-shown", "");
      claimLink?.removeAttribute("tabindex");
      pass.nudge();
    };

    /** While the back faces the visitor, the hint says where the name is. */
    const syncHint = () => {
      const back = pass.face() === "back" && input.value.trim() !== "";
      if (hintFine)
        hintFine.textContent = back
          ? "Turn the pass to see your name"
          : hints[0]!;
      if (hintTouch)
        hintTouch.textContent = back
          ? "Turn the pass to see your name"
          : hints[1]!;
    };

    const paint = async (): Promise<void> => {
      const name = input.value.trim();
      if (!name) {
        pass.setFront(null);
        return;
      }
      await Promise.all([
        blank.decode().catch(() => undefined),
        document.fonts.load(`800 108px ${family}`).catch(() => undefined),
      ]);
      if (!blank.naturalWidth || input.value.trim() !== name) return;
      pass.setFront(drawNamedFront(blank, name, family, drawn));
    };
    const schedule = () => {
      cancelAnimationFrame(pending);
      pending = requestAnimationFrame(() => void paint());
    };
    const keep = () => {
      try {
        const name = input.value.trim();
        if (name) localStorage.setItem(NAME_KEY, name);
        else localStorage.removeItem(NAME_KEY);
      } catch {
        /* no storage: the name simply is not kept */
      }
    };

    input.addEventListener("input", () => {
      schedule();
      syncHint();
      // A short pause in typing counts as done.
      window.clearTimeout(settle);
      if (input.value.trim()) settle = window.setTimeout(showClaim, 900);
    });
    input.addEventListener("change", () => {
      keep();
      if (input.value.trim()) showClaim();
    });
    // Enter means done: the field lets go (nothing is submitted, nothing
    // opens), so the name is kept and the ticket link rises.
    input.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" || event.isComposing) return;
      event.preventDefault();
      input.blur();
    });
    onTurn = () => {
      syncHint();
      showClaim();
    };
    try {
      const saved = localStorage.getItem(NAME_KEY);
      if (saved) {
        input.value = saved;
        schedule();
      }
    } catch {
      /* no storage */
    }
    field.removeAttribute("data-waiting");
  }

  // Pause off screen and in hidden tabs.
  let onScreen = true;
  const sync = () => scene?.setVisible(onScreen && !document.hidden);
  if ("IntersectionObserver" in window) {
    new IntersectionObserver((entries) => {
      onScreen = entries.some((entry) => entry.isIntersecting);
      sync();
    }).observe(host);
  }
  document.addEventListener("visibilitychange", sync);

  // The hint under the card turns it too (the scene reports the turn).
  button?.addEventListener("click", () => {
    scene?.turn();
  });

  async function enter(): Promise<void> {
    if (!live) {
      host!.classList.add("is-entered");
      return;
    }
    // Give the scene a moment if it is nearly there.
    const early = await Promise.race([
      ready,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 350)),
    ]);
    if (early) {
      // The live pass falls in; the still is never shown.
      host!.classList.add("is-entered");
      show3d();
      await early.drop();
      return;
    }
    // The still swings in; the 3D pass takes over at rest.
    host!.classList.add("is-entered", "is-swinging");
    still?.addEventListener(
      "animationend",
      () => host!.classList.remove("is-swinging"),
      { once: true },
    );
    const late = await ready;
    if (late) {
      const settle = () => {
        late.rest();
        show3d();
      };
      if (host!.classList.contains("is-swinging")) {
        still?.addEventListener("animationend", settle, { once: true });
      } else settle();
    }
  }

  controller = { live, ready, enter };
  return controller;
}
