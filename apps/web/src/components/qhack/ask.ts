// Ask Q-Hack: the FAQ as a terminal conversation.
//
//   [ about ] [ skills ] [ teams ] ...                   topics first
//   ? your question >  [type here]                       enter
//   > What is Q-Hack?                                    the questions of a topic,
//     When and where does Q-Hack take place?             or what matches the typing
//   - - - - - - - - - - - - - - - - - - - - - - - - -
//   // answers                          [ ask another ]  the conversation, below
//   ? Who can apply?
//   > Everyone. ...
//
// Picking a question (click, tap, or arrow keys and enter) writes it into the
// answers below the picker, types the answer under it like a chat, and scrolls
// the window down to it, so it is plain where the answer is. Typing filters
// all questions at once; a question nobody has an answer for gets the contact
// address instead.
//
// Topics, questions and answers come from the page (the CMS), and so does the
// contact address.

export interface AskTopic {
  id: string;
  label: string;
  items: {
    question: string;
    /** trusted HTML from the CMS rich text renderer: paragraphs, links, emphasis */
    answerHtml: string;
  }[];
}

export interface AskOptions {
  topics: AskTopic[];
  /** The page's typing effect: types the element's content, resolves when done. */
  typeEl: (el: HTMLElement) => Promise<void>;
  /** Where to write when no entry matches. Empty: the answer only says so. */
  contactEmail: string;
}

/** One question of the FAQ, with what the search needs to find it. */
interface Entry {
  topic: string;
  q: string;
  /** the answer, as HTML */
  a: string;
  asked: boolean;
  keys: Set<string>;
  qkeys: Set<string>;
}

/** What `?debug` exposes to the test tools as `window.qask`. */
interface AskDebug {
  search: (text: string) => string[];
  readonly shown: string[];
}

declare global {
  interface Window {
    qask?: AskDebug;
  }
}

// words that say nothing about what somebody wants to know
const FILLER = new Set(
  "a an the is are am do does did i you we it to of in on at for and or be can will there my me your with what which have has need get any some about tell please know want much many also q-hack qhack hackathon".split(
    " ",
  ),
);
// what people type, mapped to the word the answers use
// prettier-ignore
const ALIAS: Record<string, string> = {
  cost: "fee", costs: "fee", price: "fee", pay: "fee", paid: "fee", money: "fee", free: "fee", ticket: "fee", tickets: "fee",
  location: "where", city: "mannheim", address: "where", date: "when", dates: "when", time: "when",
  online: "remotely", remote: "remotely", virtual: "remotely", german: "language", deutsch: "language", english: "language",
  bed: "sleep", night: "sleep", overnight: "sleep", eat: "food", meal: "food", meals: "food", lunch: "food", dinner: "food", drink: "drinks", coffee: "drinks",
  beginner: "experience", beginners: "experience", newbie: "experience", first: "experience", coding: "technical", code: "technical", programming: "technical", developer: "technical",
  alone: "team", solo: "team", group: "team", teammates: "team", friends: "team",
  prize: "judged", prizes: "judged", win: "judged", winner: "judged", criteria: "judged",
  mail: "contact", email: "contact", reach: "contact", phone: "contact",
  deadline: "apply", register: "apply", registration: "apply", signup: "apply", sign: "apply", application: "apply",
  wheelchair: "accessible", accessibility: "accessible", camera: "photos", pictures: "photos", filmed: "videos",
  mentor: "support", mentors: "support", help: "support", task: "challenge", topic: "challenge", project: "projects", pitch: "present",
};

const ENTITY: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
};
const esc = (s: string): string => s.replace(/[&<>"]/g, (ch) => ENTITY[ch]);
const words = (s: string): string[] =>
  s
    .toLowerCase()
    // keep letters of any alphabet (questions may carry umlauts), digits and hyphens
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !FILLER.has(w))
    .map((w) => ALIAS[w] || w);

const BLOCKS = "p, ul, ol, li, h1, h2, h3, h4, h5, h6, blockquote, hr, div";

// An answer's words for the search: its HTML without the tags. Blocks and
// line breaks end a word, or the last word of a paragraph would run into the
// first of the next.
function plainText(html: string): string {
  const box = document.createElement("template");
  box.innerHTML = html;
  for (const el of box.content.querySelectorAll(`${BLOCKS}, br`)) el.after(" ");
  return box.content.textContent ?? "";
}

// The element an answer is typed in: the `>` and the answer's HTML behind it,
// so the typing effect can walk its text nodes and keeps links and emphasis.
// The CMS wraps an answer in paragraphs. A single paragraph is set as one line
// of text, the way a plain answer reads; a longer answer keeps its blocks and
// carries the `>` in front of the first.
function answerEl(html: string): HTMLElement {
  const box = document.createElement("template");
  box.innerHTML = html.trim();
  const content = box.content;
  const only =
    content.childNodes.length === 1 ? content.firstElementChild : null;
  if (only?.tagName === "P") content.replaceChildren(...only.childNodes);
  // typing carries text over, with the elements around it: a line break has
  // no text and would be lost, so it becomes a new line in the text itself
  for (const br of content.querySelectorAll("br")) br.replaceWith("\n");
  const blocks = content.querySelector(BLOCKS) !== null;
  const el = document.createElement(blocks ? "div" : "p"); // a paragraph cannot hold blocks
  el.className = "chat__a";
  el.dataset.type = "";
  el.dataset.typeSpeed = "6";
  el.append(content);
  const mark = document.createElement("span");
  mark.className = "k";
  mark.textContent = ">";
  const first = el.firstElementChild;
  (blocks && first?.tagName === "P" ? first : el).prepend(mark, " ");
  return el;
}

function need<T extends Element>(root: ParentNode, selector: string): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`the ask terminal has no "${selector}"`);
  return el;
}

/**
 * The ask terminal inside `root`. It expects the picker (`[data-chat]` with
 * its `.ask__input`, `[data-chat-topics]`, `[data-chat-list]`,
 * `[data-chat-count]`) and the answers (`[data-chat-out]`, `[data-chat-log]`,
 * `[data-chat-again]`, optionally `[data-chat-empty]`).
 */
export function initAsk(
  root: HTMLElement,
  { topics: faq, typeEl, contactEmail }: AskOptions,
): void {
  const form = need<HTMLFormElement>(root, "[data-chat]");
  const input = need<HTMLInputElement>(form, ".ask__input");
  const log = need<HTMLElement>(root, "[data-chat-log]");
  const list = need<HTMLElement>(root, "[data-chat-list]");
  const topics = need<HTMLElement>(root, "[data-chat-topics]");
  const count = need<HTMLElement>(root, "[data-chat-count]");
  const out = need<HTMLElement>(root, "[data-chat-out]");
  const again = need<HTMLElement>(root, "[data-chat-again]");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const all: Entry[] = faq.flatMap((t) =>
    t.items.map(({ question: q, answerHtml: a }) => ({
      topic: t.id,
      q,
      a,
      asked: false,
      keys: new Set([...words(q), ...words(plainText(a))]),
      qkeys: new Set(words(q)),
    })),
  );
  let topic = faq[0]?.id ?? "";
  let shown: Entry[] = [];
  let active = 0;
  let busy: Promise<void> = Promise.resolve();

  topics.innerHTML = faq
    .map(
      (t) =>
        `<button type="button" class="chat__topic" data-topic="${esc(t.id)}" aria-pressed="${t.id === topic}"><span aria-hidden="true">[ </span>${esc(t.label)}<span aria-hidden="true"> ]</span></button>`,
    )
    .join("");

  // Best matches for what was typed: every word that occurs counts, words in
  // the question itself count double, and the start of a word is enough.
  const search = (text: string): Entry[] => {
    const want = words(text);
    if (!want.length) return [];
    return all
      .map((item) => {
        let score = 0;
        for (const w of want) {
          for (const k of item.keys) {
            // the same word, or the same word stem (apply / applications)
            if (
              k === w ||
              (w.length > 3 && k.length > 3 && k.slice(0, 4) === w.slice(0, 4))
            ) {
              score += item.qkeys.has(k) ? 2 : 1;
              break;
            }
          }
        }
        return { item, score };
      })
      .filter((m) => m.score > 1) // one stray word from an answer is not a match
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)
      .map((m) => m.item);
  };

  // what the list and the answer say when nothing matches
  const none = contactEmail
    ? "no entry matches that. press enter and the team's address comes up."
    : "no entry matches that.";
  const noEntry = contactEmail
    ? `no entry for that yet. write to <a href="mailto:${esc(contactEmail)}">${esc(contactEmail)}</a> and a human answers.`
    : "no entry for that yet.";

  function render(): void {
    const text = input.value.trim();
    shown = text ? search(text) : all.filter((i) => i.topic === topic);
    active = Math.min(active, Math.max(0, shown.length - 1));
    list.innerHTML = shown.length
      ? shown
          .map(
            (item, i) =>
              `<li role="option" id="ask-opt-${i}" aria-selected="${i === active}" class="chat__opt${item.asked ? " is-asked" : ""}" data-i="${i}"><span class="chat__mark" aria-hidden="true">${i === active ? "❯" : " "}</span><span>${esc(item.q)}</span>${item.asked ? '<span class="chat__done" aria-hidden="true">✓</span>' : ""}</li>`,
          )
          .join("")
      : `<li class="chat__none">${none}</li>`;
    input.setAttribute(
      "aria-activedescendant",
      shown.length ? `ask-opt-${active}` : "",
    );
    for (const b of topics.children as HTMLCollectionOf<HTMLElement>)
      b.setAttribute(
        "aria-pressed",
        String(!text && b.dataset.topic === topic),
      );
    const left = all.filter((i) => !i.asked).length;
    count.textContent =
      left === all.length
        ? `${all.length} answers`
        : `${all.length - left}/${all.length} read`;
  }

  // The answers sit below the picker. Asking moves the window down to them,
  // so it is plain where the answer is being typed: centered between the header
  // and the status line, or from their top edge when they are taller than that.
  // (The page's header is `[data-top]`, its status line `.status`.)
  function reveal(): void {
    const box = out.getBoundingClientRect();
    const top =
      (document.querySelector<HTMLElement>("[data-top]")?.offsetHeight || 60) +
      12;
    const bottom =
      innerHeight -
      (document.querySelector<HTMLElement>(".status")?.offsetHeight || 36) -
      12;
    const free = bottom - top;
    // nothing to do when they are in full view and not down at the edge of the window
    if (
      box.top >= top &&
      box.bottom <= bottom &&
      (box.top + box.bottom) / 2 <= top + free * 0.62
    )
      return;
    const want = box.height < free ? top + (free - box.height) / 2 : top;
    scrollBy({ top: box.top - want, behavior: reduce ? "auto" : "smooth" });
  }

  // one turn of the conversation: the question, then the answer typed out
  function say(question: string, answerHtml: string): void {
    root.querySelector("[data-chat-empty]")?.remove();
    for (const old of log.children) old.classList.remove("is-new");
    const turn = document.createElement("div");
    turn.className = "chat__turn is-new";
    turn.innerHTML = `<p class="chat__q"><span class="q">?</span> ${esc(question)}</p>`;
    const answer = answerEl(answerHtml);
    turn.append(answer);
    log.appendChild(turn);
    log.scrollTop = log.scrollHeight;
    again.hidden = false;
    setTimeout(reveal, 30); // a timer, not an animation frame: those pause while the window is covered
    // answers queue up, so two quick picks do not type over each other
    busy = busy.then(async () => {
      const follow = window.setInterval(
        () => (log.scrollTop = log.scrollHeight),
        120,
      );
      await typeEl(answer);
      window.clearInterval(follow);
    });
  }

  function pick(item: Entry): void {
    item.asked = true;
    say(item.q, item.a);
    input.value = "";
    topic = item.topic;
    active = 0;
    render();
  }

  form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const text = input.value.trim();
    if (shown.length) return pick(shown[active]);
    if (!text) return;
    say(text.slice(0, 140), noEntry);
    input.value = "";
    render();
  });
  input.addEventListener("input", () => {
    active = 0;
    render();
  });
  input.addEventListener("keydown", (ev) => {
    if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
      if (!shown.length) return;
      ev.preventDefault();
      active =
        (active + (ev.key === "ArrowDown" ? 1 : shown.length - 1)) %
        shown.length;
      render();
    } else if (ev.key === "Escape") {
      input.value = "";
      render();
    }
  });
  const optionAt = (ev: Event): HTMLElement | null =>
    ev.target instanceof Element
      ? ev.target.closest<HTMLElement>("[data-i]")
      : null;
  list.addEventListener("click", (ev) => {
    const li = optionAt(ev);
    if (li) pick(shown[Number(li.dataset.i)]);
  });
  list.addEventListener("pointermove", (ev) => {
    const li = optionAt(ev);
    if (!li || Number(li.dataset.i) === active) return;
    active = Number(li.dataset.i);
    for (const el of list.children as HTMLCollectionOf<HTMLElement>) {
      const on = Number(el.dataset.i) === active;
      el.setAttribute("aria-selected", String(on));
      if (el.firstElementChild)
        el.firstElementChild.textContent = on ? "❯" : " ";
    }
  });
  // back up to the picker for the next question
  again.addEventListener("click", () => {
    const top =
      (document.querySelector<HTMLElement>("[data-top]")?.offsetHeight || 60) +
      16;
    scrollBy({
      top: root.getBoundingClientRect().top - top,
      behavior: reduce ? "auto" : "smooth",
    });
    if (matchMedia("(hover: hover)").matches)
      input.focus({ preventScroll: true }); // on a phone this would only pop the keyboard
  });
  topics.addEventListener("click", (ev) => {
    const b =
      ev.target instanceof Element
        ? ev.target.closest<HTMLElement>("[data-topic]")
        : null;
    if (!b) return;
    topic = b.dataset.topic ?? "";
    input.value = "";
    active = 0;
    render();
  });

  render();
  if (new URLSearchParams(location.search).has("debug"))
    window.qask = {
      search: (t) => search(t).map((i) => i.q),
      get shown() {
        return shown.map((i) => i.q);
      },
    };
}
