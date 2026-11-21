// The Q-Hack colors for canvas and WebGL code (DESIGN.md HACK-1). Drawing
// code cannot use CSS custom properties directly, so it reads the tokens from
// the page once: tokens.css stays the single source of every color here.

const cache = new Map<string, string>();

/** The value of a color token as a CSS color string, e.g. `token("hack-ink")`. */
export function token(name: string): string {
  let value = cache.get(name);
  if (value === undefined) {
    value = getComputedStyle(document.documentElement)
      .getPropertyValue(`--color-${name}`)
      .trim();
    cache.set(name, value);
  }
  return value;
}

/** A color token as red, green, blue in 0..255. */
export function rgb(name: string): [number, number, number] {
  const hex = token(name).replace("#", "");
  const full =
    hex.length === 3
      ? hex
          .split("")
          .map((c) => c + c)
          .join("")
      : hex;
  const n = Number.parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** A color token with an alpha, as an `rgba()` string for 2D canvas work. */
export function rgba(name: string, alpha: number): string {
  const [r, g, b] = rgb(name);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** A color token as red, green, blue in 0..1, for shader uniforms. */
export function unit(name: string): [number, number, number] {
  const [r, g, b] = rgb(name);
  return [r / 255, g / 255, b / 255];
}
