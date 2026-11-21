// Small HTML builders for the Q-Hack page's terminal voice (DESIGN.md
// HACK-1). Terminal lines and bracket buttons are laid out with
// `white-space: pre`, so a line break that a formatter puts into the markup
// would show on the page. Building these few strings here and writing them
// with `set:html` keeps their whitespace exact. Every piece of content that
// goes in is escaped first.

export const esc = (text: string): string =>
  text.replace(
    /[&<>"]/g,
    (ch) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch] ?? ch,
  );

/** A button label in brackets: `[ apply now ]`. The brackets are decoration. */
export const ascii = (label: string): string =>
  `<span aria-hidden="true">[ </span>${esc(label)}<span aria-hidden="true"> ]</span>`;

/** A command line: a dim `$`, then the command. */
export const prompt = (command: string): string =>
  `<span class="p">$</span> ${esc(command)}`;

/** A line the other side types: a pink `>`, then the text. */
export const out = (text: string): string =>
  `<span class="k">&gt;</span> ${esc(text)}`;

/** A fact line: `> label   value`, the values lined up at `width` characters. */
export const fact = (label: string, value: string, width: number): string =>
  `<span class="k">&gt; ${esc(label)}</span>${" ".repeat(Math.max(1, width - label.length))}${esc(value)}`;
