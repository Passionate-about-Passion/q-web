// Ask Q-Hack: the FAQ as a terminal conversation, in one window that shows
// one thing at a time under its field.
//
//   ? your question >  [type or pick below]        enter   the field, always there
//
//   // pick a topic                                        1. tap the field: the topics
//   [ about ] [ skills ] [ teams ] ...
//
//   < topics / about                                       2. a topic: its questions
//   > What is Q-Hack?
//     When and where does Q-Hack take place?
//
//   ? Who can apply?                                       3. a question: it stands on
//   > Everyone. ...                                           top, the answer is typed
//
// Nothing is open at first. Tapping the field brings the topics, a topic its
// questions, a question the answer in the same place; tapping the field again
// starts over, and so does the button under an answer. Typing skips the
// topics and filters all questions at once; a question nobody has an answer
// for gets the contact address instead. Arrow keys and enter walk the same
// steps, escape goes one step back. The enter key works like the enter
// button beside the field, also while the field does not have the focus.
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

/** Where the window is: nothing open, a step of the picker, or an answer. */
type Mode = "closed" | "topics" | "questions" | "search" | "answer";

/** What `?debug` exposes to the test tools as `window.qask`. */
interface AskDebug {
  search: (text: string) => string[];
  readonly shown: string[];
  readonly mode: Mode;
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
 * The ask terminal inside `root`. It expects the field (`[data-chat]` with
 * its `.ask__input`), the picker (`[data-chat-pick]` with `[data-chat-crumb]`
 * and `[data-chat-list]`), the answer (`[data-chat-log]`) and the counter
 * (`[data-chat-count]`).
 */
export function initAsk(
  root: HTMLElement,
  { topics: faq, typeEl, contactEmail }: AskOptions,
): void {
  const form = need<HTMLFormElement>(root, "[data-chat]");
  const input = need<HTMLInputElement>(form, ".ask__input");
  const picker = need<HTMLElement>(root, "[data-chat-pick]");
  const crumb = need<HTMLElement>(root, "[data-chat-crumb]");
  const list = need<HTMLElement>(root, "[data-chat-list]");
  const log = need<HTMLElement>(root, "[data-chat-log]");
  const count = need<HTMLElement>(root, "[data-chat-count]");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  // A phone: the first tap on the field must bring the topics, not the
  // keyboard over them. The field takes no keyboard until it is tapped again.
  const touch = matchMedia("(hover: none)").matches;
  const idle = input.placeholder;
  let typing = false;

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
  let mode: Mode = "closed";
  let topic = faq[0]?.id ?? "";
  let shown: Entry[] = [];
  let active = 0;
  let answered = false;

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

  const picking = (): boolean =>
    mode === "topics" || mode === "questions" || mode === "search";
  /** how many things the list offers right now */
  const offered = (): number => (mode === "topics" ? faq.length : shown.length);
  const mark = (i: number): string =>
    `<span class="chat__mark" aria-hidden="true">${i === active ? "❯" : " "}</span>`;

  function render(): void {
    const open = picking();
    picker.hidden = !open;
    log.hidden = mode !== "answer";
    input.setAttribute("aria-expanded", String(open));
    if (touch) {
      if (!open) typing = false;
      input.inputMode = typing ? "text" : "none";
      input.placeholder = open && !typing ? "tap again to type" : idle;
    }
    list.classList.toggle("is-topics", mode === "topics");
    if (mode === "topics") {
      active = Math.min(active, Math.max(0, faq.length - 1));
      crumb.innerHTML = `<span class="p">//</span> pick a topic`;
      list.innerHTML = faq
        .map(
          (t, i) =>
            `<li role="option" id="ask-opt-${i}" aria-selected="${i === active}" class="chat__opt chat__opt--topic" data-i="${i}"><span aria-hidden="true">[ </span>${esc(t.label)}<span aria-hidden="true"> ]</span></li>`,
        )
        .join("");
    } else if (open) {
      shown =
        mode === "search"
          ? search(input.value.trim())
          : all.filter((i) => i.topic === topic);
      active = Math.min(active, Math.max(0, shown.length - 1));
      const here =
        mode === "search"
          ? "matches"
          : (faq.find((t) => t.id === topic)?.label ?? "");
      crumb.innerHTML = `<button type="button" class="chat__back" data-chat-back><span aria-hidden="true">‹ </span>topics</button><span class="chat__here"><span aria-hidden="true"> / </span>${esc(here)}</span>`;
      list.innerHTML = shown.length
        ? shown
            .map(
              (item, i) =>
                `<li role="option" id="ask-opt-${i}" aria-selected="${i === active}" class="chat__opt${item.asked ? " is-asked" : ""}" data-i="${i}">${mark(i)}<span>${esc(item.q)}</span>${item.asked ? '<span class="chat__done" aria-hidden="true">✓</span>' : ""}</li>`,
            )
            .join("")
        : `<li class="chat__none">${none}</li>`;
    }
    input.setAttribute(
      "aria-activedescendant",
      open && offered() ? `ask-opt-${active}` : "",
    );
    const left = all.filter((i) => !i.asked).length;
    count.textContent =
      left === all.length
        ? `${all.length} answers`
        : `${all.length - left}/${all.length} read`;
  }

  // Whatever just opened under the field must be in view: the window moves
  // down as far as needed, but never so far that the field leaves it. (The
  // page's header is `[data-top]`, its status line `.status`.)
  function reveal(): void {
    // a timer, not an animation frame: those pause while the window is covered
    setTimeout(() => {
      const top =
        (document.querySelector<HTMLElement>("[data-top]")?.offsetHeight ||
          60) + 12;
      const bottom =
        innerHeight -
        (document.querySelector<HTMLElement>(".status")?.offsetHeight || 36) -
        12;
      const field = form.getBoundingClientRect().top;
      const end = root.getBoundingClientRect().bottom;
      const by =
        field < top ? field - top : Math.min(end - bottom, field - top);
      if (field < top || by > 0)
        scrollBy({ top: by, behavior: reduce ? "auto" : "smooth" });
    }, 30);
  }

  function show(next: Mode): void {
    mode = next;
    active = 0;
    render();
    reveal();
  }

  // the field was tapped, or somebody starts over from an answer
  function open(): void {
    if (picking()) return;
    show(input.value.trim() ? "search" : "topics");
  }

  // the answer takes the picker's place: the question on top, the answer
  // typed out under it
  function say(question: string, answerHtml: string): void {
    const turn = document.createElement("div");
    turn.className = "chat__turn is-new";
    turn.innerHTML = `<p class="chat__q"><span class="q">?</span> ${esc(question)}</p>`;
    const answer = answerEl(answerHtml);
    turn.append(answer);
    // the way back, said plainly: without it nobody knows how to ask again
    const more = document.createElement("p");
    more.className = "chat__more";
    more.innerHTML = `<button type="button" class="chat__back" data-chat-back><span aria-hidden="true">‹ </span>back to topics</button>`;
    log.replaceChildren(turn, more);
    answered = true;
    input.value = "";
    if (touch) input.blur(); // the keyboard leaves, the answer has the screen
    show("answer");
    void typeEl(answer).then(reveal);
  }

  function pick(item: Entry): void {
    item.asked = true;
    topic = item.topic;
    say(item.q, item.a);
  }

  // one step on: a topic opens its questions, a question is answered
  function choose(i: number): void {
    if (mode === "topics") {
      topic = faq[i]?.id ?? topic;
      show("questions");
    } else if (shown[i]) pick(shown[i]);
  }

  form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const text = input.value.trim();
    if (!picking()) {
      if (!text) return open();
      mode = "search";
      shown = search(text);
    }
    if (mode === "topics") return choose(active);
    if (shown.length) return pick(shown[active]);
    if (text) say(text.slice(0, 140), noEntry);
  });
  input.addEventListener("focus", open);
  input.addEventListener("pointerdown", () => {
    // on a phone the second tap is the one that wants to type
    if (touch && picking() && !typing) {
      typing = true;
      render();
      if (document.activeElement === input) {
        // the keyboard only follows a fresh focus
        input.blur();
        input.focus({ preventScroll: true });
      }
      return;
    }
    open();
  });
  input.addEventListener("input", () => {
    show(input.value.trim() ? "search" : "topics");
  });
  input.addEventListener("keydown", (ev) => {
    if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
      ev.preventDefault();
      if (!picking()) return open();
      const n = offered();
      if (!n) return;
      active = (active + (ev.key === "ArrowDown" ? 1 : n - 1)) % n;
      render();
    } else if (ev.key === "Escape" && picking()) {
      // one step back: typing and questions to the topics, the topics to the
      // answer that was there (or to the closed window)
      if (mode === "topics") show(answered ? "answer" : "closed");
      else {
        input.value = "";
        show("topics");
      }
    }
  });
  const optionAt = (ev: Event): HTMLElement | null =>
    ev.target instanceof Element
      ? ev.target.closest<HTMLElement>("[data-i]")
      : null;
  list.addEventListener("click", (ev) => {
    const li = optionAt(ev);
    if (!li) return;
    const topics = mode === "topics";
    choose(Number(li.dataset.i));
    // after a topic the field keeps the keys (arrows, enter, typing); on a
    // phone that would only call the keyboard
    if (topics && !touch) input.focus({ preventScroll: true });
  });
  list.addEventListener("pointermove", (ev) => {
    const li = optionAt(ev);
    if (!li || Number(li.dataset.i) === active) return;
    active = Number(li.dataset.i);
    for (const el of list.children as HTMLCollectionOf<HTMLElement>) {
      const on = Number(el.dataset.i) === active;
      el.setAttribute("aria-selected", String(on));
      const first = el.firstElementChild;
      if (first?.classList.contains("chat__mark"))
        first.textContent = on ? "❯" : " ";
    }
  });
  // back to the topics: from the questions, and from under an answer
  root.addEventListener("click", (ev) => {
    if (!(
      ev.target instanceof Element && ev.target.closest("[data-chat-back]")
    ))
      return;
    input.value = "";
    show("topics");
  });
  // The enter button beside the field shows the enter sign, so the key does
  // the same wherever the focus is not on something of its own: one step on
  // (the topics, the marked topic, the marked question). Only while this
  // window is the one in view.
  document.addEventListener(
    "keydown",
    (ev) => {
      if (ev.key !== "Enter" || ev.repeat) return;
      if (ev.ctrlKey || ev.metaKey || ev.altKey || ev.shiftKey) return;
      const at = ev.target instanceof Element ? ev.target : null;
      if (at?.closest("a, button, input, textarea, select, summary, dialog"))
        return;
      if (document.querySelector("dialog[open]")) return;
      const box = root.getBoundingClientRect();
      if (box.top > innerHeight * 0.6 || box.bottom < innerHeight * 0.4) return;
      ev.preventDefault();
      form.requestSubmit();
    },
    true,
  );

  render();
  if (new URLSearchParams(location.search).has("debug"))
    window.qask = {
      search: (t) => search(t).map((i) => i.q),
      get shown() {
        return shown.map((i) => i.q);
      },
      get mode() {
        return mode;
      },
    };
}
