// Words for the sale's ticket link, shared by the homepage's sale section
// and the ticket page's opener (ui/SaleIntro.astro, ui/SaleCards.astro).
import type { TicketPhases } from "./content";

/** The current phase, or undefined without phases. */
export function currentPhase(phases: TicketPhases | undefined) {
  return phases?.items.find((p) => p.key === phases.activeKey);
}

/**
 * "Get your Early Bird ticket" while a phase is on sale; "See ticket
 * options" between two phases (onSale off), when nothing is on sale yet.
 */
export function saleActionLabel(phases: TicketPhases): string {
  if (phases.onSale === false) return "See ticket options";
  const active = currentPhase(phases) ?? phases.items[0];
  return `Get your ${active?.label ?? ""} ticket`.replace(/\s+/g, " ");
}
