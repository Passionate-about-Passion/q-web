/**
 * Speech bubbles for the partner testimonials (TestimonialQuotes.astro).
 * Reveals the photo buttons, hides the quotes and opens one at a time as a
 * bubble. Escape closes it and returns focus to its photo; a click anywhere
 * outside the open card closes it too. Without this script every quote
 * stays visible under its photo.
 */

function initVoiceList(list: HTMLElement): void {
  const voices = [...list.querySelectorAll<HTMLElement>("[data-voice]")];
  const pairs = voices.flatMap((voice) => {
    const trigger = voice.querySelector<HTMLButtonElement>(
      "[data-voice-trigger]",
    );
    const quote = voice.querySelector<HTMLElement>("[data-voice-quote]");
    return trigger && quote ? [{ voice, trigger, quote }] : [];
  });
  if (pairs.length === 0) return;

  let open: (typeof pairs)[number] | null = null;

  function close(returnFocus = false): void {
    if (!open) return;
    open.trigger.setAttribute("aria-expanded", "false");
    open.quote.hidden = true;
    if (returnFocus) open.trigger.focus();
    open = null;
  }

  function show(pair: (typeof pairs)[number]): void {
    close();
    // Keep the bubble on screen: it hangs under the card, from the card's
    // right edge when it would run past the viewport from the left edge,
    // and above the card when the window ends below it, unless the site
    // header or the top of the window would cut it off there.
    pair.quote.removeAttribute("data-edge");
    pair.quote.removeAttribute("data-side");
    pair.quote.hidden = false;
    const rect = pair.quote.getBoundingClientRect();
    if (rect.right > document.documentElement.clientWidth) {
      pair.quote.setAttribute("data-edge", "end");
    }
    if (rect.bottom > window.innerHeight) {
      pair.quote.setAttribute("data-side", "above");
      const header = document.querySelector(".site-header");
      const topLimit = header ? header.getBoundingClientRect().bottom : 0;
      if (pair.quote.getBoundingClientRect().top < topLimit) {
        pair.quote.removeAttribute("data-side");
      }
    }
    pair.trigger.setAttribute("aria-expanded", "true");
    open = pair;
  }

  // Hide first, then switch to bubble styles, so nothing animates on load.
  for (const { trigger, quote } of pairs) {
    quote.hidden = true;
    trigger.hidden = false;
  }
  list.setAttribute("data-enhanced", "");

  for (const pair of pairs) {
    pair.trigger.addEventListener("click", () => {
      if (open === pair) close();
      else show(pair);
    });
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && open) {
      event.preventDefault();
      close(true);
    }
  });

  document.addEventListener("pointerdown", (event) => {
    if (open && !open.voice.contains(event.target as Node)) close();
  });

  // Focus moving out of the open card (Tab past the bubble) closes it, so a
  // bubble never covers the photo a keyboard user lands on next.
  list.addEventListener("focusout", (event) => {
    const next = event.relatedTarget as Node | null;
    if (open && next && !open.voice.contains(next)) close();
  });
}

export function initVoices(): void {
  document
    .querySelectorAll<HTMLElement>("[data-voices]")
    .forEach(initVoiceList);
}
