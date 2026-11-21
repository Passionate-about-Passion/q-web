/**
 * FAQs collection.
 */
import { lexicalToHtml } from "../lexical-html";
import { fetchPublishedDocs, memoizeCms, stableOrderCompare } from "./cms";
import { CONTENT_SOURCE, readJson } from "./source";

export type FaqPage = "index" | "program" | "hackathon";

export interface Faq {
  question: string;
  answerHtml: string;
  page: FaqPage;
  /**
   * Optional topic the hackathon page groups its questions under, e.g.
   * "Applying". Empty string when unset (every page but the hackathon).
   */
  topic: string;
}

// page select values (Faqs.ts) -> the FaqPage literals this module exports
// ("home" in the CMS maps to the mirror's "index" page slug).
const FAQ_PAGE_LABELS: Record<string, FaqPage> = {
  home: "index",
  program: "program",
  hackathon: "hackathon",
};

interface CmsFaqDoc {
  id: number | string;
  question: string;
  answer: unknown;
  page: string;
  /** Optional in Payload, and absent until the CMS has the column. */
  topic?: string | null;
  order: number;
}

async function cmsGetFaqs(): Promise<Faq[]> {
  const docs = await fetchPublishedDocs<CmsFaqDoc>("faqs");
  docs.sort(stableOrderCompare);
  const faqs: Faq[] = [];
  for (const doc of docs) {
    const page = FAQ_PAGE_LABELS[doc.page];
    if (!page) {
      // Unmapped page values never match a page filter anyway; skip instead
      // of casting a lie into the FaqPage union.
      console.warn(
        `[content:cms] unmapped faq page "${doc.page}" for question "${doc.question}"; skipped`,
      );
      continue;
    }
    faqs.push({
      question: doc.question,
      answerHtml: lexicalToHtml(doc.answer),
      page,
      topic: doc.topic?.trim() ?? "",
    });
  }
  return faqs;
}

/**
 * JSON mode reads the snapshot unmapped: only the hackathon entries carry a
 * topic, and a snapshot taken before the field existed has none at all.
 */
type JsonFaq = Omit<Faq, "topic"> & { topic?: string | null };

async function jsonGetFaqs(): Promise<Faq[]> {
  const faqs = await readJson<JsonFaq[]>("faqs.json");
  return faqs.map((faq) => ({ ...faq, topic: faq.topic?.trim() ?? "" }));
}

export function getFaqs(): Promise<Faq[]> {
  return CONTENT_SOURCE === "cms"
    ? memoizeCms("faqs", cmsGetFaqs)
    : jsonGetFaqs();
}
