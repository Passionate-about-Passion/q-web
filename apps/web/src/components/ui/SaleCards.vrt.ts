// VRT variants for SaleCards: the first phase on sale (three coming), a
// later one (two over, one coming), one between phases (the next one
// announced, not on sale), and a short set. Sample data only. See
// docs/dev/visual-testing.md.
import SaleCards from "./SaleCards.astro";

const items = [
  { key: "one", label: "Sample One", discount: 30 },
  { key: "two", label: "Sample Two", discount: 25 },
  { key: "three", label: "Sample Three", discount: 20 },
  { key: "four", label: "Sample Four", discount: 15 },
];

const base = {
  label: "Sample phases",
  items,
  currentLabel: "On sale now",
  upcomingLabel: "Coming soon",
  pastLabel: "Sold out",
  discountLabel: "{discount}% off",
};

export default {
  component: SaleCards,
  variants: {
    default: {
      phases: { ...base, activeKey: "one" },
      href: "#",
      actionLabel: "Get your sample ticket",
    },
    later: {
      phases: { ...base, activeKey: "three" },
      href: "#",
      actionLabel: "Get your sample ticket",
    },
    coming: {
      phases: {
        ...base,
        activeKey: "two",
        onSale: false,
        nextLabel: "Next up",
      },
      href: "#",
      actionLabel: "See ticket options",
    },
    short: {
      phases: { ...base, items: items.slice(0, 2), activeKey: "two" },
      href: "#",
      actionLabel: "Get your sample ticket",
    },
  },
};
