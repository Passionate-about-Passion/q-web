import { describe, expect, it } from "vitest";

import { Faqs } from "../src/collections/Faqs";
import { forceDraftData } from "../src/content-sync/force-draft";
import { COLLECTION_KEYS } from "../src/content-sync/keys";
import { serializeDoc } from "../src/content-sync/serialize";
import { PageHackathon, validateEventEnd } from "../src/globals/PageHackathon";
import { PageProgram } from "../src/globals/PageProgram";
import { MEDIA_GLOBAL_FIELDS } from "../src/lib/media-usage";

// The raw authored field tree, before Payload sanitizes it. Named groups and
// arrays add a path segment; rows and collapsible sections are layout only.
// (Same helper as page-home.test.ts.)
type RawField = {
  name?: string;
  type?: string;
  required?: boolean;
  maxRows?: number;
  options?: { label: string; value: string }[];
  validate?: (value: unknown, options: { siblingData: unknown }) => unknown;
  fields?: RawField[];
};

/** Every named field with its dotted path; an array is written `name[]`. */
function namedFields(
  fields: RawField[] | undefined,
  prefix = "",
): { path: string; field: RawField }[] {
  const out: { path: string; field: RawField }[] = [];
  for (const field of fields ?? []) {
    const segment = !field.name
      ? ""
      : field.type === "array"
        ? `${field.name}[]`
        : field.name;
    const here = [prefix, segment].filter(Boolean).join(".");
    if (field.name) out.push({ path: here, field });
    out.push(...namedFields(field.fields, here));
  }
  return out;
}

const hackFields = namedFields(PageHackathon.fields as RawField[]);
const hackField = (path: string) =>
  hackFields.find((entry) => entry.path === path)?.field;

const rowFields = (fields: RawField[], path: string) =>
  namedFields(fields)
    .filter((entry) => entry.path.startsWith(`${path}.`))
    .map((entry) => entry.path.slice(path.length + 1));

// The live Hackathon page was published before any of these fields existed.
// It must stay valid and publishable untouched, so nothing new may be
// required outside the rows of a new array, and no validator may reject an
// empty value. Drafts are validated on save, so this also guards plain
// saving.
describe("page-hackathon 2027 fields are additive", () => {
  // Paths are the REST keys apps/web reads (CmsHackathonDoc in pages.ts).
  const OPTIONAL_2027 = [
    "event.startsAt",
    "event.endsAt",
    "event.location",
    "application.isOpen",
    "application.comingSoonLabel",
    "machine.lines[]",
    "machine.hint",
    "machine.screenLine",
    "schedule.items[].day",
    "schedule.items[].mark",
    "aftermovie.heading",
    "aftermovie.caption",
    "impressions.heading",
    "impressions.intro",
    "impressions.photos[]",
    "impressions.photos[].alt",
    "impressions.photos[].caption",
    "facts[]",
    "partnerPitch.heading",
    "partnerPitch.lede",
    "partnerPitch.points[]",
    "partnerPitch.ctaLabel",
    "partnerPitch.ctaHref",
    "partnerPitch.contactEmail",
  ];

  it.each(OPTIONAL_2027)("%s exists and is optional", (path) => {
    const field = hackField(path);
    expect(field, `no field at ${path}`).toBeDefined();
    expect(field?.required ?? false).toBe(false);
  });

  it("keeps every group of the page, the 2026 archive included", () => {
    const groups = hackFields
      .filter(
        ({ path, field }) => field.type === "group" && !path.includes("."),
      )
      .map(({ path }) => path);
    // Admin order: the 2026 archive groups come last, before Search and social.
    expect(groups).toEqual([
      "hero",
      "event",
      "application",
      "machine",
      "partners",
      "schedule",
      "aftermovie",
      "impressions",
      "faqSection",
      "partnerPitch",
      "benefits",
      "closingCta",
    ]);
  });

  it("accepts an empty value in every validator on an optional field", () => {
    const rejected = hackFields
      .filter(({ field }) => !field.required && field.validate)
      .filter(
        ({ field }) =>
          field.validate!(undefined, { siblingData: {} }) !== true ||
          field.validate!(null, { siblingData: {} }) !== true,
      )
      .map(({ path }) => path);
    expect(rejected).toEqual([]);
  });

  it("requires nothing new outside the rows of the new arrays", () => {
    const required = hackFields
      .filter(({ field }) => field.required)
      .map(({ path }) => path)
      .sort();
    expect(required).toEqual(
      [
        // Published before 2027.
        "title",
        "hero.headline",
        "hero.tagline",
        "hero.cta.label",
        "hero.cta.href",
        "partners.heading",
        "partners.groups[]",
        "partners.groups[].group",
        "partners.groups[].partners[]",
        "partners.groups[].partners[].name",
        "partners.groups[].partners[].href",
        "partners.groups[].partners[].logoFile",
        "benefits.heading",
        "benefits.cards[].title",
        "benefits.cards[].description",
        "schedule.heading",
        "schedule.intro",
        "schedule.items[].date",
        "schedule.items[].title",
        "faqSection.heading",
        "faqSection.intro",
        "closingCta.heading",
        "closingCta.text",
        "closingCta.mailtoLabel",
        "closingCta.mailtoEmail",
        // New arrays: a row that exists must be complete.
        "machine.lines[].text",
        "impressions.photos[].image",
        "facts[].title",
        "facts[].description",
        "partnerPitch.points[].title",
        "partnerPitch.points[].description",
      ].sort(),
    );
  });

  it("starts with applications closed and a status line", () => {
    const isOpen = hackField("application.isOpen") as {
      defaultValue?: unknown;
    };
    const label = hackField("application.comingSoonLabel") as {
      defaultValue?: unknown;
    };
    expect(isOpen.defaultValue).toBe(false);
    expect(label.defaultValue).toBe("Applications open soon");
  });

  it("holds at most the three lines the laptop sequence shows", () => {
    expect(hackField("machine.lines[]")?.maxRows).toBe(3);
  });

  it("links the partner pitch button like every other internal link", () => {
    const validate = hackField("partnerPitch.ctaHref")!.validate!;
    const run = (value: unknown) => validate(value, { siblingData: {} });
    expect(run("/partner")).toBe(true);
    expect(run("https://example.com/partner")).toBe(true);
    expect(run("mailto:partners@example.com")).toBe(true);
    expect(run("")).toBe(true);
    expect(run("become a partner")).not.toBe(true);
  });
});

describe("validateEventEnd", () => {
  const run = (end: unknown, startsAt?: unknown) =>
    validateEventEnd(end, { siblingData: { startsAt } });

  it("asks for nothing while either date is empty", () => {
    expect(run(undefined)).toBe(true);
    expect(run(null, "2027-03-31T16:00:00.000Z")).toBe(true);
    expect(run("2027-04-01T16:00:00.000Z")).toBe(true);
    expect(
      validateEventEnd("2027-04-01T16:00:00.000Z", { siblingData: undefined }),
    ).toBe(true);
  });

  it("takes an end at or after the start", () => {
    expect(run("2027-04-01T16:00:00.000Z", "2027-03-31T16:00:00.000Z")).toBe(
      true,
    );
    expect(run("2027-03-31T16:00:00.000Z", "2027-03-31T16:00:00.000Z")).toBe(
      true,
    );
  });

  it("rejects an end before the start", () => {
    expect(
      run("2027-03-31T15:59:00.000Z", "2027-03-31T16:00:00.000Z"),
    ).not.toBe(true);
  });
});

// Every array stores its rows in its own table. The shared agenda helper adds
// the day heading and the hack clock mark only where it is asked to, so the
// program agenda gains no column.
describe("schedule rows", () => {
  it("carry day and mark on the hackathon schedule", () => {
    expect(
      rowFields(PageHackathon.fields as RawField[], "schedule.items[]"),
    ).toEqual(["date", "title", "description", "day", "mark"]);
  });

  it("stay at date, title and description on the program agenda", () => {
    expect(
      rowFields(PageProgram.fields as RawField[], "agenda.items[]"),
    ).toEqual(["date", "title", "description"]);
  });

  it("leave the benefit, fact and partner pitch rows at title and description", () => {
    const hack = PageHackathon.fields as RawField[];
    for (const path of [
      "benefits.cards[]",
      "facts[]",
      "partnerPitch.points[]",
    ]) {
      expect(rowFields(hack, path)).toEqual(["title", "description"]);
    }
  });
});

// The select's values are a Postgres enum: a value may be appended, never
// reordered, renamed or removed, or stored partners lose their logo.
describe("hackathon partner logo options", () => {
  const values = (
    hackField("partners.groups[].partners[].logoFile")?.options ?? []
  ).map((option) => option.value);

  it("keeps every option published before 2027, in order", () => {
    expect(values.slice(0, 17)).toEqual([
      "69bfc230ceecbebceff708fc_new-logo.webp",
      "69b17a0e089f34c65a5e14a2_Picnic_logo.svg",
      "69bfc037724d038aa2ba26bc_image.png",
      "69c25665fc7b9cf5fb7a2889_f6961aac836f-Logo__2_.webp",
      "69d00444ac69243eaf2b4f4f_istari-logo.svg",
      "69c255cf7613b98e497cf289_OpenAI-black-wordmark(1).webp",
      "69b2e8289e0d3b7dd0ae9529_lovable_logo.svg",
      "69c99a0acf960a512107bc95_Anthropic_logo.svg",
      "69c256c8d3ff156cf6877066_elevenlabs-logo-black.webp",
      "69ccf786df18a395b3fee7fd_n8n_pink%2Bblack_logo.svg",
      "69d40a60aa0c813fdc6344eb_featherlessai-transparent.webp",
      "69d675fef0b853cb5df97e4e_liveavatar_logo_vertical_dark.webp",
      "69b458c74be9d2023714bcbf_itmx_logo.webp",
      "69d00453416ddd4a45dad964_mlh-logo-color-dark.svg",
      "digitalocean-logo-horizontal-blue.svg",
      "dev-logo-black.svg",
      "elevenlabs-logo-black.svg",
    ]);
  });

  it("appends the six Q-Hack 2027 logos", () => {
    expect(values.slice(17)).toEqual([
      "partner-sap.svg",
      "partner-microsoft.svg",
      "partner-ibm.svg",
      "partner-pwc.svg",
      "partner-le-wagon.svg",
      "partner-ace.webp",
    ]);
    expect(new Set(values).size).toBe(values.length);
  });
});

// The "Used on" panel and the delete guard only see uploads registered in
// media-usage.ts; an unregistered one would call a file unused while the
// impressions still show it.
describe("page-hackathon uploads are registered for media usage", () => {
  it("lists every upload field of the Hackathon page", () => {
    const uploads = hackFields
      .filter(({ field }) => field.type === "upload")
      .map(({ path }) => path)
      .sort();
    const registered = MEDIA_GLOBAL_FIELDS.find(
      (entry) => entry.slug === "page-hackathon",
    )?.refs.map((ref) => ref.fieldPath);
    expect(uploads).toEqual(["impressions.photos[].image"]);
    expect([...(registered ?? [])].sort()).toEqual(uploads);
  });
});

// Faq.topic in apps/web/src/lib/content/faqs.ts.
describe("faqs topic", () => {
  const topic = (Faqs.fields as RawField[]).find(
    (field) => field.name === "topic",
  );

  it("is an optional text field", () => {
    expect(topic?.type).toBe("text");
    expect(topic?.required ?? false).toBe(false);
  });

  it("is not part of the identity of a question", () => {
    // Regrouping a question under another topic must update it, not create
    // a second entry.
    expect(COLLECTION_KEYS.faqs).toEqual({
      kind: "fields",
      fields: ["question", "page"],
    });
  });
});

// Content packages treat uploads by shape, not by field name, so the nested
// photo upload needs no entry anywhere. This pins that: the 2027 keys
// survive export and apply, and the photo travels as a filename ref.
describe("page-hackathon 2027 fields survive the export -> propose round-trip", () => {
  it("keeps every new key and maps the photo upload to a filename ref", () => {
    const doc = {
      id: 1,
      event: {
        startsAt: "2099-03-31T16:00:00.000Z",
        endsAt: "2099-04-01T16:00:00.000Z",
        location: "Fixture campus",
      },
      application: { isOpen: false, comingSoonLabel: "Fixture soon" },
      machine: {
        lines: [{ id: "row-a", text: "Fixture line" }],
        hint: "Fixture hint",
        screenLine: "Fixture screen line",
      },
      schedule: {
        items: [
          {
            id: "row-b",
            date: "Fixture date",
            title: "Fixture opening",
            description: null,
            day: "Fixture day 1",
            mark: "T+00:00",
          },
        ],
      },
      aftermovie: { heading: "Fixture film", caption: "Fixture caption" },
      impressions: {
        heading: "Fixture impressions",
        intro: "Fixture intro",
        photos: [
          {
            id: "row-c",
            image: {
              id: 7,
              filename: "fixture-photo.webp",
              alt: "Fixture photo",
              url: "https://example.test/media/fixture-photo.webp",
              mimeType: "image/webp",
              filesize: 1234,
              width: 1536,
              height: 1024,
            },
            alt: "Fixture photo on the page",
            caption: "Fixture caption",
          },
        ],
      },
      facts: [{ id: "row-d", title: "team", description: "up to 4" }],
      partnerPitch: {
        heading: "Fixture pitch",
        lede: "Fixture lede",
        points: [{ id: "row-e", title: "Fixture point", description: "Why" }],
        ctaLabel: "Fixture button",
        ctaHref: "mailto:partners@example.com",
        contactEmail: "partners@example.com",
      },
      _status: "published",
    };

    expect(forceDraftData(serializeDoc(doc))).toEqual({
      event: {
        startsAt: "2099-03-31T16:00:00.000Z",
        endsAt: "2099-04-01T16:00:00.000Z",
        location: "Fixture campus",
      },
      application: { isOpen: false, comingSoonLabel: "Fixture soon" },
      machine: {
        lines: [{ text: "Fixture line" }],
        hint: "Fixture hint",
        screenLine: "Fixture screen line",
      },
      schedule: {
        items: [
          {
            date: "Fixture date",
            title: "Fixture opening",
            description: null,
            day: "Fixture day 1",
            mark: "T+00:00",
          },
        ],
      },
      aftermovie: { heading: "Fixture film", caption: "Fixture caption" },
      impressions: {
        heading: "Fixture impressions",
        intro: "Fixture intro",
        photos: [
          {
            image: { filename: "fixture-photo.webp", alt: "Fixture photo" },
            alt: "Fixture photo on the page",
            caption: "Fixture caption",
          },
        ],
      },
      facts: [{ title: "team", description: "up to 4" }],
      partnerPitch: {
        heading: "Fixture pitch",
        lede: "Fixture lede",
        points: [{ title: "Fixture point", description: "Why" }],
        ctaLabel: "Fixture button",
        ctaHref: "mailto:partners@example.com",
        contactEmail: "partners@example.com",
      },
      _status: "draft",
    });
  });

  it("keeps the topic on a faq", () => {
    const applied = forceDraftData(
      serializeDoc({
        id: 3,
        question: "Fixture question?",
        page: "hackathon",
        topic: "Applying",
        order: 10,
        _status: "published",
      }),
    );
    expect(applied.topic).toBe("Applying");
  });
});
