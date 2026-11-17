/**
 * The homepage's fullscreen menu (HomeHeader.astro, DESIGN.md HOME-1).
 *
 * The menu is a native popover, so it opens, closes and answers Escape
 * without this script. This adds what a modal sheet needs: the page under
 * it stops scrolling, focus moves into the menu and stays there while it
 * is open, the Menu button reports its state, focus returns to it on
 * close, and following a link inside the menu closes the menu first.
 */
export function initHomeMenu(): void {
  const menu = document.querySelector<HTMLElement>("[data-home-menu]");
  const opener = document.querySelector<HTMLButtonElement>(
    "[data-home-menu-open]",
  );
  if (!menu || !opener || menu.dataset.ready) return;
  menu.dataset.ready = "";

  const tabStops = (): HTMLElement[] =>
    [
      ...menu.querySelectorAll<HTMLElement>(
        "a[href], button:not([disabled]), summary",
      ),
    ].filter((el) => el.offsetParent !== null || el === document.activeElement);

  menu.addEventListener("toggle", (event) => {
    const open = (event as ToggleEvent).newState === "open";
    opener.setAttribute("aria-expanded", String(open));
    document.documentElement.style.overflow = open ? "hidden" : "";
    if (open) {
      // The first navigation item, not the logo: that is where a visitor
      // opening the menu wants to go.
      const first = menu.querySelector<HTMLElement>(".hm-link");
      requestAnimationFrame(() => first?.focus({ preventScroll: true }));
    } else if (
      menu.contains(document.activeElement) ||
      !document.activeElement ||
      document.activeElement === document.body
    ) {
      opener.focus({ preventScroll: true });
    }
  });

  // Keep Tab inside the open sheet.
  menu.addEventListener("keydown", (event) => {
    if (event.key !== "Tab") return;
    const items = tabStops();
    if (items.length === 0) return;
    const first = items[0]!;
    const last = items[items.length - 1]!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  // An in-page link closes the menu before the page moves.
  menu.addEventListener("click", (event) => {
    const link = (event.target as Element).closest<HTMLAnchorElement>(
      "a[href]",
    );
    if (!link) return;
    if (link.getAttribute("href")?.startsWith("#")) menu.hidePopover();
  });
}
