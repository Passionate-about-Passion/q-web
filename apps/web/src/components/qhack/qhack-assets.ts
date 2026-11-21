// Design assets of the Q-Hack page that are not content (DESIGN.md HACK-1):
// the laptop model and the stickers on its lid. They are committed under
// public/hackathon/ and referenced by root URL, like the homepage's pass
// (public/home/pass/). Photos, logos and the film are content and come
// from /media (src/assets/media/hackathon.ts).
import type { LaptopSticker } from "./laptop";

/** The laptop, built in Blender, meshopt-compressed (about 0.55 MB). */
export const LAPTOP_MODEL = "/hackathon/laptop.glb";

/**
 * The five Q-Summit stickers on the lid, cut out of their artwork and stored
 * as WebP. x and z are metres in the lid's own space: z runs from the hinge
 * (0) to the far edge (0.213), x from -0.152 to 0.152, and seen from behind
 * the open lid +x is on the left. The Q in the middle takes x -0.02..0.02,
 * z 0.086..0.126. w is the width in metres (the height follows the
 * picture), rot degrees.
 */
export const STICKERS: LaptopSticker[] = [
  {
    src: "/hackathon/stickers/graffiti.webp",
    x: 0.012,
    z: 0.043,
    w: 0.079,
    rot: 5,
  },
  {
    src: "/hackathon/stickers/disco.webp",
    x: -0.094,
    z: 0.162,
    w: 0.053,
    rot: -10,
  },
  {
    src: "/hackathon/stickers/billiard.webp",
    x: 0.108,
    z: 0.158,
    w: 0.046,
    rot: 8,
  },
  {
    src: "/hackathon/stickers/ten-years.webp",
    x: 0.104,
    z: 0.062,
    w: 0.045,
    rot: -7,
  },
  {
    src: "/hackathon/stickers/est-2016.webp",
    x: -0.1,
    z: 0.07,
    w: 0.045,
    rot: 9,
  },
];
