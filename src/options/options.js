const container = document.getElementById("rules");
const rulesMessage = document.getElementById("rules-message");
const jsonField = document.getElementById("json");

const POSITION_SOURCES = [
  ["name", "atrybut name"],
  ["id", "atrybut id"],
  ["label", "etykieta"],
  ["printed", "widoczna cyfra"],
  ["order", "kolejność w DOM"],
];

/** The editor's working copy. Saved only when the user asks. */
let rules = [];

init();

async function init() {
  rules = await browser.runtime.sendMessage({ type: "getRules" });
  render();
}

// ---------- rendering ----------

// Rebuilt wholesale only when rules are added or removed; typing updates the
// model in place so the field never loses focus mid-edit.
function render() {
  container.replaceChildren(...rules.map(renderRule));
  syncJson();
}

function renderRule(rule, index) {
  const card = el("div", { className: "rule" });

  const head = el("div", { className: "rule-head" });
  head.append(
    bind(el("input", { type: "text", placeholder: "Nazwa, np. Moje ING" }), rule, "name"),
    button("Usuń regułę", () => {
      rules.splice(index, 1);
      render();
    })
  );
  card.append(head);

  card.append(renderMatches(rule));

  card.append(
    labelled(
      "Selektor pól ze znakami hasła",
      bind(el("input", { type: "text", placeholder: 'input[name^="password-"]' }), rule, "field")
    )
  );

  rule.position ??= {};
  const grid = el("div", { className: "grid" });
  grid.append(
    labelled("Numer znaku z", select(POSITION_SOURCES, rule.position, "from", "order")),
    labelled(
      "Wzorzec (regex, opcjonalny)",
      bind(el("input", { type: "text", placeholder: "(\\d+)" }), rule.position, "pattern")
    ),
    labelled(
      "Numeracja od",
      select([["1", "1"], ["0", "0"]], rule.position, "base", "1", Number)
    )
  );
  card.append(grid);

  if ((rule.position.from ?? "order") === "printed") {
    card.append(
      labelled(
        "Element z cyfrą (selektor, względem rodzica pola)",
        bind(el("input", { type: "text", placeholder: '[slot="after"]' }), rule.position, "in")
      )
    );
  }

  card.append(
    labelled(
      "Pola zablokowane (selektor)",
      bind(
        el("input", { type: "text", placeholder: "[disabled],[readonly]" }),
        rule,
        "disabledWhen"
      )
    )
  );

  return card;
}

function renderMatches(rule) {
  rule.matches ??= [];
  const wrap = labelled("Adresy", el("div", { className: "matches" }));
  const list = wrap.querySelector(".matches");

  rule.matches.forEach((pattern, index) => {
    const row = el("div");
    const input = el("input", {
      type: "text",
      value: pattern,
      placeholder: "https://login.example.pl/*",
    });
    input.addEventListener("input", () => {
      rule.matches[index] = input.value;
      syncJson();
    });
    row.append(
      input,
      button("×", () => {
        rule.matches.splice(index, 1);
        render();
      })
    );
    list.append(row);
  });

  const add = el("div");
  add.append(
    button("+ Dodaj adres", () => {
      rule.matches.push("");
      render();
    })
  );
  list.append(add);

  return wrap;
}

// ---------- small DOM helpers ----------

function el(tag, props = {}) {
  return Object.assign(document.createElement(tag), props);
}

function button(text, onClick) {
  const b = el("button", { type: "button", className: "small", textContent: text });
  b.addEventListener("click", onClick);
  return b;
}

function labelled(text, control) {
  const wrap = el("label", { className: "field" });
  wrap.append(el("span", { textContent: text }), control);
  return wrap;
}

function bind(input, object, key) {
  input.value = object[key] ?? "";
  input.addEventListener("input", () => {
    if (input.value) object[key] = input.value;
    else delete object[key];
    syncJson();
  });
  return input;
}

function select(options, object, key, fallback, cast = String) {
  const s = el("select");
  for (const [value, text] of options) s.append(el("option", { value, textContent: text }));
  s.value = String(object[key] ?? fallback);
  s.addEventListener("change", () => {
    object[key] = cast(s.value);
    render(); // `printed` reveals an extra field, so the card is rebuilt.
  });
  return s;
}

function syncJson() {
  jsonField.value = JSON.stringify(rules, null, 2);
}

// ---------- actions ----------

document.getElementById("add-rule").addEventListener("click", () => {
  rules.push({ name: "", matches: [""], field: "", position: { from: "order", base: 1 } });
  render();
});

document.getElementById("apply-json").addEventListener("click", () => {
  let parsed;
  try {
    parsed = JSON.parse(jsonField.value);
  } catch (error) {
    return report(rulesMessage, `Niepoprawny JSON: ${error.message}`, true);
  }
  if (!Array.isArray(parsed)) return report(rulesMessage, "JSON musi być listą reguł.", true);
  rules = parsed;
  render();
  report(rulesMessage, "Wczytano. Kliknij „Zapisz reguły”, żeby zachować.");
});

document.getElementById("reset-rules").addEventListener("click", async () => {
  await browser.storage.local.remove("rules");
  rules = await browser.runtime.sendMessage({ type: "getRules" });
  render();
  report(rulesMessage, "Przywrócono domyślne reguły.");
});

document.getElementById("save-rules").addEventListener("click", async () => {
  const cleaned = rules.map((rule) => ({
    ...rule,
    matches: (rule.matches ?? []).map((m) => m.trim()).filter(Boolean),
  }));

  // The service worker has no DOM, so selectors are checked here.
  for (const [index, rule] of cleaned.entries()) {
    try {
      document.createDocumentFragment().querySelector(rule.field);
    } catch {
      return report(rulesMessage, `Reguła ${index + 1}: selektor pól jest niepoprawny.`, true);
    }
  }

  // Asking for host access needs a user gesture, which is why it happens here
  // rather than in the background when the rule is stored.
  const origins = cleaned.flatMap((rule) => rule.matches);
  let granted = true;
  if (origins.length) {
    try {
      granted = await browser.permissions.request({ origins });
    } catch (error) {
      return report(rulesMessage, `Nie udało się poprosić o dostęp: ${error.message}`, true);
    }
  }

  try {
    await browser.runtime.sendMessage({ type: "saveRules", rules: cleaned });
  } catch (error) {
    return report(rulesMessage, error.message, true);
  }

  rules = cleaned;
  render();
  report(
    rulesMessage,
    granted
      ? "Zapisano reguły."
      : "Zapisano, ale bez dostępu do części adresów — nadaj go w Ustawieniach Safari.",
    !granted
  );
});

function report(element, text, isError = false) {
  element.classList.toggle("error", isError);
  element.textContent = text;
  element.hidden = false;
}
