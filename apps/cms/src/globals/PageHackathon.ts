import type { Field, GlobalConfig } from "payload";

import { urlOrMailtoValidate } from "../lib/url-validate";
import { pageGlobal } from "./base";
import {
  agendaItemsField,
  groupSection,
  pageLinkGroup,
  section,
  seoFields,
  stringArrayField,
  titleDescriptionArrayField,
} from "./shared-fields";

/*
 * Hackathon page (/hackathon/), Q-Hack 2027.
 *
 * Mirrors HackathonContent and CmsHackathonDoc in
 * apps/web/src/lib/content/pages.ts 1:1: names and nesting are the REST keys
 * the site reads. Everything added for 2027 (event dates and place, the
 * applications switch, the laptop sequence, day and hack clock mark on the
 * schedule rows, aftermovie, impressions, facts, partner pitch) is optional
 * at the schema level or has a default, so the page published before these
 * fields existed stays valid and publishable untouched, and the migration
 * only adds nullable columns, new tables and enum values. apps/web maps every
 * new group to a safe empty until it is filled.
 *
 * The 2026 groups `benefits` and `closingCta` stay stored exactly as they
 * are (a named group is never removed or reshaped, apps/cms AGENTS.md). The
 * 2027 page no longer shows them; they are the 2026 archive.
 *
 * There is no application link of its own: the apply buttons open `hero.cta`
 * while `application.isOpen` is on, and a "not open yet" window while it is
 * off.
 */

// PartnerGroup.partners[].logoFile is a code-side asset-registry key, not an
// uploaded file. Keep this option list in sync with the registry the page
// resolves logos from, `partnerLogos` in
// apps/web/src/assets/media/hackathon.ts: a key without an entry there shows
// the partner's name in place of a logo, so the select should only offer
// keys the build actually resolves. Values are a Postgres enum: append,
// never reorder or rename.
const HACKATHON_LOGO_FILE_OPTIONS = [
  { label: "Spherecast", value: "69bfc230ceecbebceff708fc_new-logo.webp" },
  { label: "Picnic", value: "69b17a0e089f34c65a5e14a2_Picnic_logo.svg" },
  { label: "Exxeta", value: "69bfc037724d038aa2ba26bc_image.png" },
  {
    label: "Cloover",
    value: "69c25665fc7b9cf5fb7a2889_f6961aac836f-Logo__2_.webp",
  },
  { label: "Istari", value: "69d00444ac69243eaf2b4f4f_istari-logo.svg" },
  {
    label: "OpenAI",
    value: "69c255cf7613b98e497cf289_OpenAI-black-wordmark(1).webp",
  },
  { label: "Lovable", value: "69b2e8289e0d3b7dd0ae9529_lovable_logo.svg" },
  { label: "Anthropic", value: "69c99a0acf960a512107bc95_Anthropic_logo.svg" },
  {
    label: "ElevenLabs",
    value: "69c256c8d3ff156cf6877066_elevenlabs-logo-black.webp",
  },
  { label: "n8n", value: "69ccf786df18a395b3fee7fd_n8n_pink%2Bblack_logo.svg" },
  {
    label: "Featherless AI",
    value: "69d40a60aa0c813fdc6344eb_featherlessai-transparent.webp",
  },
  {
    label: "LiveAvatar",
    value: "69d675fef0b853cb5df97e4e_liveavatar_logo_vertical_dark.webp",
  },
  { label: "ITMX", value: "69b458c74be9d2023714bcbf_itmx_logo.webp" },
  { label: "MLH", value: "69d00453416ddd4a45dad964_mlh-logo-color-dark.svg" },
  // Q-Hack x Hacktoberfest 2026: official brand-kit files, unmodified.
  {
    label: "DigitalOcean",
    value: "digitalocean-logo-horizontal-blue.svg",
  },
  { label: "DEV", value: "dev-logo-black.svg" },
  { label: "ElevenLabs (SVG)", value: "elevenlabs-logo-black.svg" },
  // Q-Hack 2027.
  { label: "SAP", value: "partner-sap.svg" },
  { label: "Microsoft", value: "partner-microsoft.svg" },
  { label: "IBM", value: "partner-ibm.svg" },
  { label: "PwC", value: "partner-pwc.svg" },
  { label: "Le Wagon", value: "partner-le-wagon.svg" },
  { label: "ACE", value: "partner-ace.webp" },
];

/**
 * The hack cannot end before it starts. Both dates are optional, so an empty
 * value passes: drafts are validated on save, and the page published before
 * these fields existed must keep saving untouched.
 */
export const validateEventEnd = (
  value: unknown,
  { siblingData }: { siblingData: unknown },
): true | string => {
  const start = (siblingData as { startsAt?: unknown } | undefined)?.startsAt;
  if (!value || !start) return true;
  return new Date(String(value)) >= new Date(String(start))
    ? true
    : "The end cannot be before the start.";
};

const hackathonPartnerFields: Field[] = [
  { name: "name", type: "text", required: true },
  {
    name: "href",
    type: "text",
    required: true,
    validate: urlOrMailtoValidate(),
  },
  {
    name: "logoFile",
    type: "select",
    required: true,
    options: HACKATHON_LOGO_FILE_OPTIONS,
    // Payload otherwise derives the Postgres enum name from the full nested
    // field path, which for this field (page_hackathon -> partners -> groups
    // -> partners -> logoFile, doubled again for the drafts version table)
    // exceeds Postgres's 63-character identifier limit.
    enumName: "hackathon_partner_logo_file",
    admin: {
      description:
        "Logo file registered for the page, not an uploaded file. " +
        "Ask IT to register a new logo before it can appear in this list.",
    },
  },
  {
    name: "note",
    type: "text",
    admin: {
      description: 'Optional footnote, e.g. "Challenge to be announced".',
    },
  },
];

const partnerGroupFields: Field[] = [
  {
    name: "group",
    type: "text",
    required: true,
    admin: { description: "Section heading, e.g. Challenge Partners." },
  },
  {
    name: "partners",
    type: "array",
    required: true,
    fields: hackathonPartnerFields,
  },
];

// Extra fields on each schedule row (HackathonAgendaItem in pages.ts). Passed
// to the shared agenda helper so only this array gains the columns.
const scheduleRowFields: Field[] = [
  {
    name: "day",
    type: "text",
    admin: {
      description:
        'Optional. Starts a new day and is shown as a heading above this row, e.g. "Day 1, Wednesday".',
    },
  },
  {
    name: "mark",
    type: "text",
    admin: {
      description: "Optional hack clock mark such as T+00:00.",
    },
  },
];

// One impression photo (HackathonPhoto in pages.ts). The upload is registered
// in src/lib/media-usage.ts (MEDIA_GLOBAL_FIELDS), which is what the "Used
// on" panel and the delete guard read.
const impressionPhotoFields: Field[] = [
  {
    name: "image",
    type: "upload",
    relationTo: "media",
    required: true,
    admin: {
      description: "Photo from an earlier hack. Upload the sharp original.",
      sortOptions: "-createdAt",
    },
  },
  {
    name: "alt",
    type: "text",
    admin: {
      description: "Short description of the photo for screen readers.",
    },
  },
  {
    name: "caption",
    type: "text",
    admin: {
      description:
        'Optional. Short line shown with the photo, e.g. "The hacking hall".',
    },
  },
];

export const PageHackathon: GlobalConfig = pageGlobal({
  slug: "page-hackathon",
  label: "Hackathon",
  path: "/hackathon/",
  ownedBy: "PR + Concept",
  divisions: ["pr", "concept"],
  fields: [
    groupSection({
      label: "Hero",
      name: "hero",
      open: true,
      fields: [
        { name: "headline", type: "text", required: true },
        { name: "tagline", type: "text", required: true },
        pageLinkGroup(
          "cta",
          "The apply button. Its link is where every apply button on the page leads while applications are open.",
        ),
      ],
    }),
    groupSection({
      label: "Event",
      name: "event",
      description:
        "When and where the hack runs. It drives the countdown and every date on the page.",
      fields: [
        {
          type: "row",
          fields: [
            {
              name: "startsAt",
              label: "Starts at",
              type: "date",
              admin: {
                width: "50%",
                date: { pickerAppearance: "dayAndTime" },
                description:
                  "Day and time the hack starts. The countdown runs to this moment.",
              },
            },
            {
              name: "endsAt",
              label: "Ends at",
              type: "date",
              admin: {
                width: "50%",
                date: { pickerAppearance: "dayAndTime" },
                description: "Day and time the hack ends.",
              },
              validate: validateEventEnd,
            },
          ],
        },
        {
          name: "location",
          type: "text",
          admin: {
            description:
              'Where the hack takes place, e.g. "University of Mannheim".',
          },
        },
      ],
    }),
    // No link field on purpose: the apply link is hero.cta, so there is one
    // link to maintain. Modeled on page-kickoff's application.isOpen.
    groupSection({
      label: "Applications",
      name: "application",
      description:
        "Opens and closes applications. The apply link itself is the Hero button's link.",
      fields: [
        {
          name: "isOpen",
          type: "checkbox",
          label: "Applications open",
          defaultValue: false,
          admin: {
            description:
              'When off, every apply button opens a short "not open yet" window instead of a link. ' +
              "When on, the buttons open the Hero button's link.",
          },
        },
        {
          name: "comingSoonLabel",
          type: "text",
          defaultValue: "Applications open soon",
          admin: {
            description: "Status line shown while applications are closed.",
          },
        },
      ],
    }),
    groupSection({
      label: "Laptop sequence",
      name: "machine",
      description:
        "The scroll sequence with the laptop: the lines beside it and the line typed on its screen.",
      fields: [
        stringArrayField("lines", {
          label: "Line",
          maxRows: 3,
          description:
            "Up to three short lines shown beside the laptop, one per row.",
        }),
        {
          name: "hint",
          type: "text",
          admin: {
            description:
              'Optional. Small hint shown with the laptop, e.g. "Keep scrolling".',
          },
        },
        {
          name: "screenLine",
          type: "text",
          admin: {
            description:
              "Optional. The line typed on the laptop screen under the logo.",
          },
        },
      ],
    }),
    groupSection({
      label: "Partners",
      name: "partners",
      description:
        "Hackathon partner groups (challenge/infrastructure/ecosystem).",
      fields: [
        { name: "heading", type: "text", required: true },
        {
          name: "groups",
          type: "array",
          required: true,
          admin: {
            initCollapsed: true,
            components: {
              RowLabel: "/components/array-row-label#TitleRowLabel",
            },
          },
          fields: partnerGroupFields,
        },
      ],
    }),
    groupSection({
      label: "Schedule",
      name: "schedule",
      fields: [
        { name: "heading", type: "text", required: true },
        { name: "intro", type: "textarea", required: true },
        agendaItemsField("items", undefined, {
          descriptionRequired: false,
          extraFields: scheduleRowFields,
        }),
      ],
    }),
    // The film is the site's own stream (not an upload: Media is images
    // only), so only the words live here.
    groupSection({
      label: "Aftermovie",
      name: "aftermovie",
      description: "The words around the aftermovie of the last hack.",
      fields: [
        {
          name: "heading",
          type: "text",
          admin: { description: "Heading of the aftermovie section." },
        },
        {
          name: "caption",
          type: "text",
          admin: {
            description:
              'The title line of the film, e.g. "Q-Summit Hackathon 2026".',
          },
        },
      ],
    }),
    groupSection({
      label: "Impressions",
      name: "impressions",
      description:
        "Photos from earlier hacks, with a heading and a short text.",
      fields: [
        { name: "heading", type: "text" },
        { name: "intro", type: "textarea" },
        {
          name: "photos",
          type: "array",
          // Names the drafts version table `_page_hackathon_impressions_photos_v`
          // instead of the derived `_page_hackathon_v_version_impressions_photos`:
          // with that one, the foreign key of the `image` upload
          // (..._image_id_media_id_fk) is 65 characters, past Postgres's
          // 63-character identifier limit. The live table keeps its derived
          // name, and the REST key stays `impressions.photos`.
          dbName: "page_hackathon_impressions_photos",
          labels: { singular: "Photo", plural: "Photos" },
          admin: {
            initCollapsed: true,
            description: "The photos, in display order.",
          },
          fields: impressionPhotoFields,
        },
      ],
    }),
    groupSection({
      label: "FAQ teaser",
      name: "faqSection",
      description:
        "FAQ section intro. The questions themselves live under Lists & people, FAQs, with Page set to Hackathon. " +
        "Their Topic groups them on this page.",
      fields: [
        { name: "heading", type: "text", required: true },
        { name: "intro", type: "textarea", required: true },
      ],
    }),
    // Top-level array (not inside a named group), so the section is a plain
    // collapsible: FeatureCard rows of { title, description }.
    section(
      "Facts",
      [
        titleDescriptionArrayField(
          "facts",
          'Short facts about the hack, one per row. Title is the short label, e.g. "team"; ' +
            'Description is its value, e.g. "up to 4, solo welcome".',
        ),
      ],
      {
        description:
          "The facts at a glance: team size, format, cost and so on.",
      },
    ),
    groupSection({
      label: "Partner pitch",
      name: "partnerPitch",
      description:
        "The section that invites companies to become a hackathon partner.",
      fields: [
        { name: "heading", type: "text" },
        {
          name: "lede",
          label: "Lead text",
          type: "textarea",
          admin: { description: "Short text under the heading." },
        },
        titleDescriptionArrayField(
          "points",
          "Reasons to become a partner, one per row, in display order.",
        ),
        {
          type: "row",
          fields: [
            {
              name: "ctaLabel",
              label: "Button Label",
              type: "text",
              admin: {
                width: "40%",
                description: 'Text of the button, e.g. "Become a partner".',
              },
            },
            {
              name: "ctaHref",
              label: "Button Link",
              type: "text",
              admin: {
                width: "60%",
                description:
                  'Where the button leads: a full URL (https://...), a mailto: address or an internal path (e.g. "/partner"). ' +
                  "Leave empty to show no button.",
              },
              // Same rule as every other internal link (pageLinkFields), but
              // optional.
              validate: urlOrMailtoValidate({
                optional: true,
                allowRelative: true,
                allowMailto: true,
              }),
            },
          ],
        },
        {
          name: "contactEmail",
          type: "email",
          admin: {
            description:
              "Optional. Email address companies can write to about a partnership.",
          },
        },
      ],
    }),
    // Kept stored exactly as they are: the 2027 page shows neither group, and
    // a named group is never removed or reshaped (apps/cms AGENTS.md). Same
    // treatment as page-home's faqSection.
    groupSection({
      label: "Benefits",
      name: "benefits",
      description:
        "The 2026 benefit cards, kept as the 2026 archive. The Hackathon page no longer shows them.",
      fields: [
        { name: "heading", type: "text", required: true },
        titleDescriptionArrayField(
          "cards",
          "Why Q-Hackathon cards (Prizes, Networking, ...).",
        ),
      ],
    }),
    groupSection({
      label: "Closing call-to-action",
      name: "closingCta",
      description:
        "The 2026 closing section, kept as the 2026 archive. The Hackathon page no longer shows it.",
      fields: [
        { name: "heading", type: "text", required: true },
        { name: "text", type: "textarea", required: true },
        { name: "mailtoLabel", type: "text", required: true },
        { name: "mailtoEmail", type: "email", required: true },
      ],
    }),
    section("Search and social", seoFields("hackathon"), {
      description:
        "How this page looks in Google and when someone shares the link.",
    }),
  ],
});
