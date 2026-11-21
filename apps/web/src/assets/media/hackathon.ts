/**
 * Fixed `/media/*` assets of the Q-Hack page (/hackathon, DESIGN.md
 * HACK-1). Like every other `/media/*` file they live on R2 (local:
 * gitignored public/media), never in git. The images are Media library
 * uploads in the CMS under exactly these filenames (Payload stores uploads
 * at the bucket root, so the keys are flat); the film is a video and is
 * uploaded to R2 by a maintainer. The photos of the page are not listed
 * here: they are picked by editors (page-hackathon, Impressions).
 */

/**
 * White Q-Hack lockup ("Q-hack, University of Mannheim") on transparent
 * ground, 960x312. Extracted unchanged from the alpha channel of the
 * official Hack-Logo-weiss.pdf (Q-Hack CI package).
 */
export const qHackLogoWhite = {
  src: "/media/q-hack-logo-white.webp",
  width: 960,
  height: 312,
} as const;

/**
 * The Q-Hack aftermovie of the 2027 page. Like the home film it is a video,
 * so it cannot go through the Media library (images only) and lives on R2
 * under these keys, uploaded by a maintainer. 1024x576, 13 seconds. The
 * poster is a frame of the same film and IS a Media library upload.
 */
export const qHackAftermovie = {
  src: "/media/q-hack-aftermovie.mp4",
  poster: "/media/q-hack-aftermovie-poster.webp",
  width: 1024,
  height: 576,
} as const;

/**
 * The partner logos of the 2027 page's band, by the `logoFile` key an
 * editor picks in the CMS (keep in sync with HACKATHON_LOGO_FILE_OPTIONS in
 * apps/cms/src/globals/PageHackathon.ts). The band redraws every logo in
 * white, filled with characters, and trims it to its own ink, so it needs
 * no size or clear-space data here. `label` writes the partner's name
 * beside a file that is only a mark.
 */
export const partnerLogos: Record<string, { src: string; label?: boolean }> = {
  "69bfc230ceecbebceff708fc_new-logo.webp": {
    src: "/media/hackathon/partners/spherecast.webp",
  },
  "69b17a0e089f34c65a5e14a2_Picnic_logo.svg": {
    src: "/media/hackathon/partners/picnic.svg",
  },
  "69bfc037724d038aa2ba26bc_image.png": {
    src: "/media/hackathon/partners/exxeta.png",
  },
  "69c25665fc7b9cf5fb7a2889_f6961aac836f-Logo__2_.webp": {
    src: "/media/hackathon/partners/cloover.webp",
  },
  "69d00444ac69243eaf2b4f4f_istari-logo.svg": {
    src: "/media/hackathon/partners/istari.svg",
  },
  "69c255cf7613b98e497cf289_OpenAI-black-wordmark(1).webp": {
    src: "/media/hackathon/partners/openai.webp",
  },
  "69b2e8289e0d3b7dd0ae9529_lovable_logo.svg": {
    src: "/media/hackathon/partners/lovable.svg",
  },
  "69c99a0acf960a512107bc95_Anthropic_logo.svg": {
    src: "/media/hackathon/partners/anthropic.svg",
  },
  "69c256c8d3ff156cf6877066_elevenlabs-logo-black.webp": {
    src: "/media/hackathon/partners/elevenlabs.webp",
  },
  "69ccf786df18a395b3fee7fd_n8n_pink%2Bblack_logo.svg": {
    src: "/media/hackathon/partners/n8n.svg",
  },
  "69d40a60aa0c813fdc6344eb_featherlessai-transparent.webp": {
    src: "/media/hackathon/partners/featherless.webp",
  },
  "69d675fef0b853cb5df97e4e_liveavatar_logo_vertical_dark.webp": {
    src: "/media/hackathon/partners/liveavatar.webp",
  },
  "69b458c74be9d2023714bcbf_itmx_logo.webp": {
    src: "/media/hackathon/partners/itmx.webp",
  },
  "69d00453416ddd4a45dad964_mlh-logo-color-dark.svg": {
    src: "/media/hackathon/partners/mlh.svg",
  },
  "digitalocean-logo-horizontal-blue.svg": {
    src: "/media/digitalocean-logo-horizontal-blue.svg",
  },
  "dev-logo-black.svg": { src: "/media/dev-logo-black.svg" },
  "elevenlabs-logo-black.svg": { src: "/media/elevenlabs-logo-black.svg" },
  // Added for the 2027 band: Media library uploads under these names.
  "partner-sap.svg": { src: "/media/partner-sap.svg" },
  "partner-microsoft.svg": { src: "/media/partner-microsoft.svg" },
  "partner-ibm.svg": { src: "/media/partner-ibm.svg" },
  "partner-pwc.svg": { src: "/media/partner-pwc.svg" },
  "partner-le-wagon.svg": { src: "/media/partner-le-wagon.svg" },
  // ACE Alternatives. The key is the one the CMS option carries; the file is
  // the company's own logo, uploaded under its full name.
  "partner-ace.webp": { src: "/media/partner-ace-alternatives.svg" },
};
