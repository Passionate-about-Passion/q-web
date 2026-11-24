// VRT variants for SalePhases: the first phase on sale, a later one (the
// earlier phases read as over), one between phases (the next one
// announced as coming), and a short set. Sample data only. See
// docs/dev/visual-testing.md.
import SalePhases from "./SalePhases.astro";

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
  component: SalePhases,
  variants: {
    default: { phases: { ...base, activeKey: "one" } },
    later: { phases: { ...base, activeKey: "three" } },
    coming: {
      phases: {
        ...base,
        activeKey: "two",
        onSale: false,
        nextLabel: "Next up",
      },
    },
    short: { phases: { ...base, items: items.slice(0, 2), activeKey: "two" } },
  },
};
