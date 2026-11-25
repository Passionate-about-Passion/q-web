/*
 * Team page media: hero constant + wide srcset helper.
 * Portraits use photoSrc from lib/media-filename.ts.
 */

import { existsSync } from "node:fs";

import { MEDIA_DIR, variant } from "./media-filename";

/**
 * Group photo of the hero on both team pages (the LCP element there). It
 * lives in the CMS media library in three widths, each under its own
 * filename, so the hero and the page preload share one srcset.
 */
export const TEAM_HERO_WIDTHS = [1280, 1920, 2560] as const;
export const TEAM_HERO_SIZE = { width: 2560, height: 1707 } as const;
const teamHeroFile = (width: number) => `team-2027-hero-p-${width}.webp`;
export const TEAM_HERO_PHOTO = teamHeroFile(1920);
export const TEAM_HERO_SRCSET = TEAM_HERO_WIDTHS.map(
  (width) => `/media/${teamHeroFile(width)} ${width}w`,
).join(", ");

export interface ResponsivePhoto {
  src: string;
  srcset: string | undefined;
}

/** Wide photo src + optional srcset from local -p-800/-p-1600, else CMS/R2 key. */
export function widePhotoSrc(photoFilename: string): ResponsivePhoto {
  const sources: { url: string; width: number }[] = [];
  for (const [suffix, width] of [
    ["-p-800", 800],
    ["-p-1600", 1600],
  ] as const) {
    const candidate = variant(photoFilename, suffix);
    if (existsSync(`${MEDIA_DIR}${candidate}`)) {
      sources.push({ url: `/media/${candidate}`, width });
    }
  }
  if (sources.length === 0) {
    // Same rule as resolvePhotoMediaKey: no invented sized keys when R2 only
    // has the original (or an already-sized CMS filename).
    const key = encodeURIComponent(photoFilename);
    return { src: `/media/${key}`, srcset: undefined };
  }
  const largest = sources[sources.length - 1];
  return {
    src: largest.url,
    srcset:
      sources.length > 1
        ? sources.map((s) => `${s.url} ${s.width}w`).join(", ")
        : undefined,
  };
}
