// VRT variants for WhyPicker: four audiences (the first picked), and long
// titles that must wrap in a row. Sample data only. See
// docs/dev/visual-testing.md.
import WhyPicker from "./WhyPicker.astro";

const card = (title: string) => ({
  title,
  eyebrow: "Sample label",
  description:
    "A sample sentence about what this audience finds at the conference.",
  href: "#",
  linkLabel: "Learn more",
  imageFile: "sample-audience.webp",
  imageAlt: "",
});

export default {
  component: WhyPicker,
  variants: {
    default: {
      eyebrow: "Why Q?",
      heading: "A sample heading",
      intro: "Pick a sample role.",
      cards: [
        card("Sample One"),
        card("Sample Two"),
        card("Sample Three"),
        card("Sample Four"),
      ],
    },
    "long-titles": {
      eyebrow: "Why Q?",
      heading: "A sample heading",
      intro: "Pick a sample role.",
      cards: [
        card("A sample audience with a long title"),
        card("Another sample audience with a long title"),
      ],
    },
  },
};
