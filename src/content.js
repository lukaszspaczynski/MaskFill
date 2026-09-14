// Runs on the ING login page. Two jobs: report which password positions the
// bank is currently asking for, and write characters into those boxes.
//
// ING's widget is a set of Lit/Lion custom elements. Each character is an
// <input name="password-N"> slotted into an <ing-input-masked-password-field>
// host, and the whole widget is rendered inside the app's shadow tree -- a plain
// document.querySelectorAll does NOT reach it. The inputs are type="password"
// with no maxlength; do not try to match on that either.

const FIELD_SELECTOR = 'input[name^="password-"]';

browser.runtime.onMessage.addListener((message) => {
  switch (message?.type) {
    case "probe":
      return Promise.resolve(probe());
    case "fill":
      return Promise.resolve(fill(message.chars));
    default:
      return false;
  }
});

/**
 * querySelectorAll that descends into open shadow roots. Closed roots are
 * invisible to any script, so if ING ever switches to mode:"closed" this stops
 * working and nothing can fix it from a content script.
 */
function deepQueryAll(selector, root = document) {
  const found = [...root.querySelectorAll(selector)];
  for (const element of root.querySelectorAll("*")) {
    if (element.shadowRoot) found.push(...deepQueryAll(selector, element.shadowRoot));
  }
  return found;
}

/** @returns {{input: HTMLInputElement, position: number}[]} */
function findFields() {
  return deepQueryAll(FIELD_SELECTOR)
    .map((input) => ({ input, position: positionOf(input) }))
    .filter((field) => field.position !== null);
}

// ING numbers the inputs from zero while labelling them from one:
// name="password-9" is the 10th character. Prefer that over DOM order, which
// would silently produce wrong positions if any box were not rendered.
function positionOf(input) {
  const fromName = /^password-(\d+)$/.exec(input.name);
  if (fromName) return Number(fromName[1]) + 1;

  // Fallbacks in case the naming changes: the digit printed under the box,
  // then the visually hidden label ("Wpisz 10. znak hasła").
  const host = input.closest("ing-input-masked-password-field");

  const printed = host?.querySelector('[slot="after"]')?.textContent.trim();
  if (printed && /^\d+$/.test(printed)) return Number(printed);

  const fromLabel = /(\d+)\s*\./.exec(host?.querySelector("label")?.textContent ?? "");
  return fromLabel ? Number(fromLabel[1]) : null;
}

function isEditable({ input }) {
  return !input.disabled && !input.readOnly;
}

function probe() {
  const fields = findFields();
  if (!fields.length) return { found: false };

  return {
    found: true,
    total: fields.length,
    positions: fields.filter(isEditable).map((field) => field.position).sort((a, b) => a - b),
  };
}

/** @param {Record<string, string>} chars position (1-based, as string) -> character */
function fill(chars) {
  const fields = findFields();
  if (!fields.length) return { filled: 0, error: "Widget not found." };

  const byPosition = new Map(fields.map((field) => [field.position, field]));

  let filled = 0;
  for (const [position, char] of Object.entries(chars)) {
    const field = byPosition.get(Number(position));
    if (!field || !isEditable(field)) continue;
    setValue(field.input, char);
    filled += 1;
  }

  // Leave focus on the last editable box so the user can review and submit.
  fields.filter(isEditable).at(-1)?.input.focus();
  return { filled };
}

// The Lion field keeps its own copy of the value and only updates it from
// events, so a plain `input.value = char` is silently ignored. Assign through
// the native setter, then replay the events the component listens for.
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
