// VRT variants for Aftermovie: the poster frame with a short and a long
// line. Sample data only (the video is hidden in VRT). See
// docs/dev/visual-testing.md.
import Aftermovie from "./Aftermovie.astro";

export default {
  component: Aftermovie,
  variants: {
    default: { eyebrow: "Sample film", heading: "A sample line." },
    long: {
      eyebrow: "Sample film with a longer label",
      heading: "A much longer sample line that has to wrap.",
    },
  },
};
