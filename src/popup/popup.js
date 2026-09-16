const summary = document.getElementById("summary");
const positionsLine = document.getElementById("positions");
const entrySection = document.getElementById("entry");
const onceField = document.getElementById("once");
const fillOnce = document.getElementById("fill-once");
const message = document.getElementById("message");

let target = null; // { tabId, positions }
let rule = null;

init();

async function init() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab) return say(summary, "Brak aktywnej karty.");

  // Which rule applies is decided in the background, from the user's rule list.
  rule = await browser.runtime.sendMessage({ type: "ruleFor", url: tab.url });
  if (!rule) return say(summary, "Brak reguły dla tej strony.");

  let probe;
  try {
    probe = await browser.tabs.sendMessage(tab.id, { type: "probe", rule });
  } catch {
    return say(summary, "Ta strona nie ma maskowanego hasła.");
  }

  if (!probe?.found) return say(summary, "Nie znalazłem pól maskowanego hasła.");
  if (!probe.positions.length) return say(summary, "Bank nie prosi teraz o żadne znaki.");

  target = { tabId: tab.id, positions: probe.positions };
  summary.textContent = `${rule.name}: ${probe.positions.length} z ${probe.total} znaków:`;
  positionsLine.textContent = probe.positions.join(", ");
  positionsLine.hidden = false;

  entrySection.hidden = false;
  onceField.focus();
}

onceField.addEventListener("input", () => {
  fillOnce.disabled = onceField.value.length === 0;
});

fillOnce.addEventListener("click", async () => {
  const password = onceField.value;
  // Clear immediately: from here the value lives only in this local, and the
  // popup is torn down as soon as it closes.
  onceField.value = "";
  fillOnce.disabled = true;

  try {
    await send(charsFrom(password, target.positions));
  } catch (error) {
    fail(error.message);
  }
});

/** @returns {Record<number, string>} */
function charsFrom(password, positions) {
  const characters = [...password];
  const chars = {};
  for (const position of positions) {
    if (position > characters.length) {
      throw new Error(
        `Hasło ma ${characters.length} znaków, a bank prosi o pozycję ${position}.`
      );
    }
    chars[position] = characters[position - 1];
  }
  return chars;
}

async function send(chars) {
  const result = await browser.tabs.sendMessage(target.tabId, { type: "fill", rule, chars });
  if (result.error) return fail(result.error);
  say(message, `Wypełniono ${result.filled} pól. Sprawdź i zaloguj się.`);
  setTimeout(() => window.close(), 1200);
}

document.getElementById("open-options").addEventListener("click", () => {
  browser.runtime.openOptionsPage();
  window.close();
});

function say(el, text) {
  el.textContent = text;
  el.hidden = false;
}

function fail(text) {
  message.classList.add("error");
  say(message, text);
}
