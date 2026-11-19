/**
 * The site header's links and its fullscreen menu (HomeHeader.astro,
 * DESIGN.md COMP-6, HOME-1).
 *
 * Wide screens show the navigation as links in the bar. "Why Q?" (an item
 * with sub-items, no link of its own) is a button with a small panel of
 * its audience pages: it opens on hover, with a click, Enter or Space,
 * stays open while focus is on one of its pages, and Escape, a click
 * outside or leaving it closes it. The bar checks that every link fits beside the Tickets
 * button; should they not (a longer navigation), it shows the menu instead
 * (data-collapsed), so nothing overlaps or is cut.
 *
 * The menu is a native popover, so it opens, closes and answers Escape
 * without this script. This adds what a modal sheet needs: the page under
 * it stops scrolling, focus moves into the menu and stays there while it
 * is open, the Menu button reports its state, focus returns to it on
 * close, and following a link inside the menu closes the menu first. When
 * the window grows past the phone layout, an open menu closes.
 */
function initHeaderNav(menu: HTMLElement): void {
  const header = document.querySelector<HTMLElement>("[data-home-header]");
  const inner = header?.querySelector<HTMLElement>("[data-hh-inner]");
  const nav = header?.querySelector<HTMLElement>("[data-hh-nav]");
  const opener = header?.querySelector<HTMLElement>("[data-home-menu-open]");
  if (!header || !inner || !nav || !opener || header.dataset.ready) return;
  header.dataset.ready = "";

  // ---- the audience panel(s)
  for (const item of header.querySelectorAll<HTMLElement>("[data-hh-sub]")) {
    const toggle = item.querySelector<HTMLButtonElement>(
      "[data-hh-sub-toggle]",
    );
    if (!toggle) continue;
    let hovered = false;
    let focused = false;
    let pinned = false;
    let dismissed = false;
    const render = () => {
      const open = !dismissed && (hovered || focused || pinned);
      item.toggleAttribute("data-open", open);
      toggle.setAttribute("aria-expanded", String(open));
    };
    item.addEventListener("pointerenter", (event) => {
      if (event.pointerType !== "mouse") return;
      hovered = true;
      render();
    });
    item.addEventListener("pointerleave", (event) => {
      if (event.pointerType !== "mouse") return;
      hovered = false;
      dismissed = false;
      render();
    });
    // Focus on one of its pages keeps the panel open (Tab walks through
    // them); focus on the button alone does not open it (a disclosure:
    // Enter or Space does).
    item.addEventListener("focusin", (event) => {
      focused = event.target !== toggle;
      render();
    });
    item.addEventListener("focusout", (event) => {
      if (item.contains(event.relatedTarget as Node | null)) return;
      focused = false;
      pinned = false;
      dismissed = false;
      render();
    });
    toggle.addEventListener("click", () => {
      const open = item.hasAttribute("data-open");
      if (open && hovered && !pinned) {
        // Opened by the pointer resting on it: a click keeps it open.
        pinned = true;
        dismissed = false;
      } else {
        pinned = !open;
        dismissed = open;
      }
      render();
    });
    item.addEventListener("keydown", (event) => {
      if (event.key !== "Escape" || !item.hasAttribute("data-open")) return;
      event.stopPropagation();
      pinned = false;
      dismissed = true;
      render();
      toggle.focus();
    });
    document.addEventListener("pointerdown", (event) => {
      if (item.contains(event.target as Node)) return;
      if (!pinned && !dismissed) return;
      pinned = false;
      dismissed = false;
      render();
    });
  }

  // ---- do all links fit? Otherwise the menu takes over.
  const tickets = inner.querySelector<HTMLElement>(".hh-tickets");
  const brand = inner.querySelector<HTMLElement>(".hh-brand");
  const wide = window.matchMedia("(min-width: 48rem)");
  const fit = () => {
    if (!wide.matches) {
      delete header.dataset.collapsed;
    } else {
      const style = getComputedStyle(inner);
      const gap = parseFloat(style.columnGap) || 0;
      const pad =
        (parseFloat(style.paddingLeft) || 0) +
        (parseFloat(style.paddingRight) || 0);
      const need =
        (brand?.offsetWidth ?? 0) +
        nav.scrollWidth +
        (tickets?.offsetWidth ?? 0) +
        gap * (tickets ? 2 : 1) +
        pad;
      header.toggleAttribute("data-collapsed", need > inner.clientWidth);
    }
    // The menu belongs to the narrow bar: once the stripes are gone, an
    // open menu closes.
    try {
      if (
        getComputedStyle(opener).display === "none" &&
        menu.matches(":popover-open")
      )
        menu.hidePopover();
    } catch {
      /* no popover support: the sheet is a plain block then */
    }
  };
  new ResizeObserver(fit).observe(inner);
  wide.addEventListener("change", fit);
  void document.fonts?.ready.then(fit);
  fit();
}

export function initHomeMenu(): void {
  const menu = document.querySelector<HTMLElement>("[data-home-menu]");
  const opener = document.querySelector<HTMLButtonElement>(
    "[data-home-menu-open]",
  );
  if (!menu || !opener || menu.dataset.ready) return;
  menu.dataset.ready = "";
  initHeaderNav(menu);

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
