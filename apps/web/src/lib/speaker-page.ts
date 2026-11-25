/**
 * /speaker page model shared by the page (pages/speaker.astro) and the LLM
 * corpus (lib/llms.ts), so both show the same edition, the same speakers
 * and the same wording.
 */
import type { Speaker, SpeakerPageContent } from "./content";

/** The edition whose speakers stand on the stage. */
export const STAGE_EDITION = 2026;
/** The edition the hot topics and the closing pill announce. */
export const NEXT_EDITION = STAGE_EDITION + 1;

export interface SpeakerPageCopy {
  hotTopicsLabel: string;
  hotTopicsHeading: string;
  hotTopicsIntro: string;
  lineupPill: string;
}

/** The CMS texts, each falling back to the built-in wording when empty. */
export function speakerPageCopy(page: SpeakerPageContent): SpeakerPageCopy {
  return {
    hotTopicsLabel: page.hotTopics?.label ?? `Hot topics ${NEXT_EDITION}`,
    hotTopicsHeading:
      page.hotTopics?.heading ??
      `Three topics set the ${NEXT_EDITION} main stage`,
    hotTopicsIntro:
      page.hotTopics?.intro ??
      `The ${NEXT_EDITION} line-up is announced step by step.`,
    lineupPill: page.lineupPill ?? `Line-up ${NEXT_EDITION} · Coming soon`,
  };
}

/** "Role · Company", or the role line when there is no company. */
export function stageRole(speaker: Speaker): string {
  return speaker.company
    ? `${speaker.role} · ${speaker.company}`
    : speaker.roleLine || speaker.role;
}

/**
 * Everyone of STAGE_EDITION who spoke, current line-up or moved to the
 * highlights since; moderators and homepage panel entries are not speakers
 * on this stage. Keeps the CMS order.
 */
export function stageEditionSpeakers(speakers: Speaker[]): Speaker[] {
  return speakers.filter(
    (s) =>
      s.year === STAGE_EDITION &&
      (s.group === "current" || s.group === "previous"),
  );
}
