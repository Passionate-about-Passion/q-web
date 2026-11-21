import type { Faq, HackathonContent } from "../../lib/content";
import QhackPage from "./QhackPage.astro";

// The gallery shows the page without its script (qhack.client.ts leaves it
// alone there): the canvases stay empty, the laptop is its text block, the
// photos are the plain grid and every answer is written out. So these
// baselines cover layout and type, not the 3D.
const content: HackathonContent = {
  title: "Sample Hack",
  metaDescription: "A sample hackathon page for the visual gallery.",
  hero: {
    headline: "Sample Hack 2099",
    tagline: "24 hours. one hall. build something real.",
    cta: { label: "Apply now", href: "https://example.com/apply" },
  },
  event: {
    startsAt: "2099-03-31T10:00:00.000Z",
    endsAt: "2099-04-01T10:00:00.000Z",
    location: "Sample University",
  },
  application: { isOpen: false, comingSoonLabel: "Applications open soon" },
  machine: {
    lines: ["24 hours.", "one machine.", "your idea."],
    hint: "keep scrolling. something is about to happen to this screen.",
    screenLine: "build something real",
  },
  partners: {
    heading: "Previous partners",
    groups: [
      {
        group: "Previous partners",
        partners: [
          {
            name: "Alpha Works",
            href: "https://example.com/",
            logoFile: "sample-alpha.svg",
            note: null,
          },
          {
            name: "Beta Labs",
            href: "https://example.com/",
            logoFile: "sample-beta.svg",
            note: null,
          },
        ],
      },
    ],
  },
  schedule: {
    heading: "Program",
    intro: "24 hours from the first commit to the final pitch.",
    items: [
      {
        date: "09:00",
        title: "Doors open",
        description: "Check-in, badge, first coffee.",
        day: "Day 1, Wed 31 Mar 2099",
        mark: "",
      },
      {
        date: "12:00",
        title: "Hacking starts",
        description: "The clock starts. 24 hours from here.",
        day: "",
        mark: "T+00:00",
      },
      {
        date: "19:00",
        title: "Dinner",
        description: "Proper food. Then back to the keyboard.",
        day: "",
        mark: "T+07:00",
      },
      {
        date: "12:00",
        title: "Hacking ends",
        description: "Final submission. Hands off the keyboard.",
        day: "Day 2, Thu 01 Apr 2099",
        mark: "T+24:00",
      },
      {
        date: "16:30",
        title: "Prize ceremony",
        description: "",
        day: "",
        mark: "",
      },
    ],
  },
  aftermovie: { heading: "Aftermovie", caption: "Sample Hack 2098" },
  impressions: {
    heading: "Impressions",
    intro: "A glimpse into past events.",
    photos: [
      {
        src: "/media/sample-photo-1.webp",
        alt: "Sample photo one",
        caption: "the hacking hall",
        width: 960,
        height: 640,
      },
      {
        src: "/media/sample-photo-2.webp",
        alt: "Sample photo two",
        caption: "teams at work",
        width: 960,
        height: 640,
      },
      {
        src: "/media/sample-photo-3.webp",
        alt: "Sample photo three",
        caption: "prize ceremony",
        width: 960,
        height: 640,
      },
    ],
  },
  faqSection: {
    heading: "Ask Sample Hack",
    intro: "Pick a topic and a question, or type your own.",
  },
  facts: [
    { title: "event", description: "Sample Hack 2099" },
    { title: "length", description: "24 hours, start to pitch" },
    { title: "team", description: "up to 4, solo welcome" },
    { title: "lang", description: "English" },
  ],
  partnerPitch: {
    heading: "Become a partner",
    lede: "Bring your hardest problem. Leave with working prototypes.",
    points: [
      {
        title: "challenge",
        description: "Set a real problem from your business.",
      },
      { title: "talent", description: "Meet the people who build with AI." },
    ],
    ctaLabel: "Become a partner",
    ctaHref: "/partner/",
    contactEmail: "hack@example.com",
  },
  benefits: { heading: "", cards: [] },
  closingCta: { heading: "", text: "", mailtoLabel: "", mailtoEmail: "" },
};

const faqs: Faq[] = [
  {
    question: "What is Sample Hack?",
    answerHtml: "<p>A 24-hour hackathon in teams of up to four.</p>",
    page: "hackathon",
    topic: "About",
  },
  {
    question: "Who can apply?",
    answerHtml: "<p>Everyone.</p>",
    page: "hackathon",
    topic: "About",
  },
  {
    question: "When can I apply?",
    answerHtml:
      '<p>Applications open early in 2099. Write to <a href="mailto:hack@example.com">hack@example.com</a>.</p>',
    page: "hackathon",
    topic: "Applying",
  },
];

export default {
  component: QhackPage,
  variants: {
    default: { content, faqs },
    "applications-open": {
      content: {
        ...content,
        application: { ...content.application, isOpen: true },
      },
      faqs,
    },
    // what the page shows while only the old fields are filled
    minimal: {
      content: {
        ...content,
        event: { startsAt: "", endsAt: "", location: "" },
        machine: { lines: [], hint: "", screenLine: "" },
        aftermovie: { heading: "", caption: "" },
        impressions: { heading: "", intro: "", photos: [] },
        facts: [],
        partnerPitch: {
          heading: "",
          lede: "",
          points: [],
          ctaLabel: "",
          ctaHref: "",
          contactEmail: "",
        },
      },
      faqs: [],
    },
  },
};
