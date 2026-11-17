// VRT variants for PalaceStage: the palace fully drawn and lit (motion is
// frozen in VRT) under a short and a long heading. Sample data only. See
// docs/dev/visual-testing.md.
import PalaceStage from "./PalaceStage.astro";

export default {
  component: PalaceStage,
  variants: {
    default: {
      eyebrow: "Sample dates",
      heading: "Two days",
      accent: "in a sample city.",
    },
    long: {
      eyebrow: "Sample dates with a longer label",
      heading: "Three days",
      accent: "in a sample city with a much longer name.",
    },
  },
};
