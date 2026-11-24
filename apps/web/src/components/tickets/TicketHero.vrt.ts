// VRT variants for TicketHero: the Q tile, the discount phase
// timeline (or, without phases, the eyebrow), display heading and the
// compare link, and between two phases the sale opener with the next
// phase announced. See docs/dev/visual-testing.md.
import TicketHero from "./TicketHero.astro";
import { vrtTicketPage } from "./ticket-vrt-data";

export default {
  component: TicketHero,
  variants: {
    default: { hero: vrtTicketPage.hero, phases: vrtTicketPage.phases },
    coming: {
      hero: vrtTicketPage.hero,
      phases: vrtTicketPage.phases && {
        ...vrtTicketPage.phases,
        onSale: false,
        nextLabel: "Next up",
      },
    },
    "no-phases": { hero: vrtTicketPage.hero },
  },
};
