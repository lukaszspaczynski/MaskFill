// Runs on pages a rule matches. Two jobs: report which password positions the
// site is currently asking for, and write characters into those boxes.
//
// Nothing here is site-specific any more -- the selectors come from a rule the
// user can edit. The shipped rule targets Moje ING, whose widget is a set of
// Lit/Lion custom elements rendered inside the app's shadow tree, which is why
// the query has to pierce shadow roots rather than use document directly.

const DEFAULT_DISABLED_WHEN = "[disabled],[readonly]";

browser.runtime.onMessage.addListener((message) => {
  switch (message?.type) {
    case "probe":
      return Promise.resolve(probe(message.rule));
    case "fill":
      return Promise.resolve(fill(message.rule, message.chars));
    default:
      return false;
  }
});

/**
 * querySelectorAll that descends into open shadow roots. Closed roots are
 * invisible to any script, so a site using mode:"closed" cannot be supported
 * by any rule.
 */
function deepQueryAll(selector, root = document) {
  const found = [...root.querySelectorAll(selector)];
  for (const element of root.querySelectorAll("*")) {
    if (element.shadowRoot) found.push(...deepQueryAll(selector, element.shadowRoot));
  }
  return found;
}

/** @returns {{input: HTMLInputElement, position: number}[]} */
function findFields(rule) {
  let inputs;
  try {
    inputs = deepQueryAll(rule.field);
  } catch {
    return []; // Invalid selector in a hand-written rule.
  }

  return inputs
    .map((input, index) => ({ input, position: positionOf(rule, input, index) }))
    .filter((field) => Number.isInteger(field.position) && field.position > 0);
}

/**
 * Where the character's position comes from. Reading it from an attribute
 * beats counting DOM order, because a site that omits some boxes would
 * otherwise shift every position silently.
 */
function positionOf(rule, input, index) {
  const { from = "order", pattern, base = 1 } = rule.position ?? {};

  if (from === "order") return index + 1;

  const haystack = {
    name: () => input.name,
    id: () => input.id,
    label: () => labelTextFor(input),
    printed: () => printedTextFor(rule, input),
  }[from]?.();

  if (!haystack) return null;

  const digits = pattern
    ? new RegExp(pattern).exec(haystack)?.[1]
    : /(\d+)/.exec(haystack)?.[1];

  if (digits === undefined) return null;
  return Number(digits) + (base === 0 ? 1 : 0);
}

function labelTextFor(input) {
  if (input.getAttribute("aria-label")) return input.getAttribute("aria-label");
  const id = input.id;
  const root = input.getRootNode();
  const label = (id && root.querySelector?.(`label[for="${CSS.escape(id)}"]`))
    ?? input.closest("label")
    ?? input.parentElement?.querySelector("label");
  return label?.textContent ?? "";
}

/** The digit a site renders next to each box, e.g. ING's slot="after" node. */
function printedTextFor(rule, input) {
  const selector = rule.position?.in;
  const host = input.parentElement;
  if (!host) return "";
  const node = selector ? host.querySelector(selector) : host;
  return node?.textContent ?? "";
}

function isEditable(rule, { input }) {
  const disabledWhen = rule.disabledWhen ?? DEFAULT_DISABLED_WHEN;
  try {
    return !input.matches(disabledWhen);
  } catch {
    return !input.disabled && !input.readOnly;
  }
}

function probe(rule) {
  const fields = findFields(rule);
  if (!fields.length) return { found: false };

  return {
    found: true,
    total: fields.length,
    positions: fields
      .filter((field) => isEditable(rule, field))
      .map((field) => field.position)
      .sort((a, b) => a - b),
  };
}

/** @param {Record<string, string>} chars position (1-based, as string) -> character */
function fill(rule, chars) {
  const fields = findFields(rule);
  if (!fields.length) return { filled: 0, error: "Nie znalazłem pól." };

  const byPosition = new Map(fields.map((field) => [field.position, field]));

  let filled = 0;
  for (const [position, char] of Object.entries(chars)) {
    const field = byPosition.get(Number(position));
    if (!field || !isEditable(rule, field)) continue;
    setValue(field.input, char);
    filled += 1;
  }

  fields.filter((field) => isEditable(rule, field)).at(-1)?.input.focus();
  return { filled };
}

// The page's framework keeps its own copy of the value and only updates it from
// events, so a plain `input.value = char` is silently ignored. Assign through
// the native setter, then replay the events it listens for.
function setValue(input, char) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value"
  ).set;

  input.focus();
  setter.call(input, char);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}
