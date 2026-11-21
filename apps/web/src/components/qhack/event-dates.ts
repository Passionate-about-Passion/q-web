// The Q-Hack dates as the page writes them (DESIGN.md HACK-1), all from the
// two date-times of the CMS (page-hackathon, group Event). The event runs in
// Mannheim, so every date is read in Central European time, whatever the
// time zone of the machine that builds the site.

const ZONE = "Europe/Berlin";

export interface EventDates {
  /** e.g. 2027 */
  year: number;
  /** e.g. "31.03 → 01.04" */
  short: string;
  /** e.g. "31.03 → 01.04.2027" */
  shortYear: string;
  /** e.g. "31 mar → 01 apr 2027" */
  long: string;
  /** Whole hours from start to end, e.g. 24. 0 when no end is set. */
  hours: number;
}

function parts(date: Date): {
  day: string;
  month: string;
  mon: string;
  year: number;
} {
  const get = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("en-GB", { timeZone: ZONE, ...options }).format(
      date,
    );
  return {
    day: get({ day: "2-digit" }),
    month: get({ month: "2-digit" }),
    mon: get({ month: "short" }).toLowerCase(),
    year: Number(get({ year: "numeric" })),
  };
}

/** The date strings of the page, or null while the start is not set. */
export function eventDates(
  startsAt: string,
  endsAt: string,
): EventDates | null {
  const start = new Date(startsAt);
  if (!startsAt || Number.isNaN(start.getTime())) return null;
  const end = new Date(endsAt);
  const a = parts(start);
  if (!endsAt || Number.isNaN(end.getTime())) {
    return {
      year: a.year,
      short: `${a.day}.${a.month}`,
      shortYear: `${a.day}.${a.month}.${a.year}`,
      long: `${a.day} ${a.mon} ${a.year}`,
      hours: 0,
    };
  }
  const b = parts(end);
  return {
    year: a.year,
    short: `${a.day}.${a.month} → ${b.day}.${b.month}`,
    shortYear: `${a.day}.${a.month} → ${b.day}.${b.month}.${b.year}`,
    long: `${a.day} ${a.mon} → ${b.day} ${b.mon} ${b.year}`,
    hours: Math.max(0, Math.round((end.getTime() - start.getTime()) / 36e5)),
  };
}

/** A label as a path segment for the terminal voice, e.g. "Why Q?" → "why-q". */
export function slug(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
