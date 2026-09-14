const summary = document.getElementById("summary");
const positionsLine = document.getElementById("positions");
const managerSection = document.getElementById("manager");
const storedSection = document.getElementById("stored");
const onceField = document.getElementById("once");
const fillOnce = document.getElementById("fill-once");
const fillStored = document.getElementById("fill-stored");
const message = document.getElementById("message");

let target = null; // { tabId, positions }

init();

async function init() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab) return say(summary, "Brak aktywnej karty.");

  let probe;
  try {
    probe = await browser.tabs.sendMessage(tab.id, { type: "probe" });
  } catch {
    return say(summary, "To nie jest strona logowania ING.");
  }

  if (!probe?.found) return say(summary, "Nie znalazłem pól maskowanego hasła.");
  if (!probe.positions.length) return say(summary, "Bank nie prosi teraz o żadne znaki.");

  target = { tabId: tab.id, positions: probe.positions };
  summary.textContent = `Bank prosi o ${probe.positions.length} z ${probe.total} znaków:`;
  positionsLine.textContent = probe.positions.join(", ");
  positionsLine.hidden = false;

  // Path A: type or autofill the password here, use it once, never store it.
  managerSection.hidden = false;
  onceField.focus();

  // Path B: the copy held in the Keychain, if there is one.
  await offerStoredPassword();
}

async function offerStoredPassword() {
  let status;
  try {
    status = await browser.runtime.sendMessage({ type: "status" });
  } catch (error) {
    return fail(error.message);
  }
  if (!status?.stored) return;

  storedSection.hidden = false;
  const highest = Math.max(...target.positions);
  if (status.length < highest) {
    say(message, `Zapisane hasło ma ${status.length} znaków, a bank prosi o pozycję ${highest}.`);
    return;
  }
  fillStored.disabled = false;
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

fillStored.addEventListener("click", async () => {
  fillStored.disabled = true;
  try {
    // The full password stays in the Keychain; only the requested characters
    // come back.
    const { chars } = await browser.runtime.sendMessage({
      type: "charsFor",
      positions: target.positions,
    });
    await send(chars);
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
  const result = await browser.tabs.sendMessage(target.tabId, { type: "fill", chars });
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
