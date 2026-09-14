const summary = document.getElementById("summary");
const positionsLine = document.getElementById("positions");
const fillButton = document.getElementById("fill");
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

  if (!probe?.found) {
    return say(summary, "Nie znalazłem pól maskowanego hasła.");
  }
  if (!probe.positions.length) {
    return say(summary, "Bank nie prosi teraz o żadne znaki.");
  }

  let status;
  try {
    status = await browser.runtime.sendMessage({ type: "status" });
  } catch (error) {
    return fail(error.message);
  }

  if (!status?.stored) {
    say(summary, "Najpierw zapisz hasło w ustawieniach.");
    return;
  }
  if (status.length < Math.max(...probe.positions)) {
    say(
      summary,
      `Zapisane hasło ma ${status.length} znaków, a bank prosi o pozycję ${Math.max(
        ...probe.positions
      )}.`
    );
    return;
  }

  target = { tabId: tab.id, positions: probe.positions };
  summary.textContent = `Bank prosi o ${probe.positions.length} z ${probe.total} znaków:`;
  positionsLine.textContent = probe.positions.join(", ");
  positionsLine.hidden = false;
  fillButton.disabled = false;
}

fillButton.addEventListener("click", async () => {
  if (!target) return;
  fillButton.disabled = true;

  try {
    // Only the requested characters cross into the page; the full password
    // stays in the Keychain.
    const { chars } = await browser.runtime.sendMessage({
      type: "charsFor",
      positions: target.positions,
    });

    const result = await browser.tabs.sendMessage(target.tabId, {
      type: "fill",
      chars,
    });

    if (result.error) return fail(result.error);
    say(message, `Wypełniono ${result.filled} pól. Sprawdź i zaloguj się.`);
    setTimeout(() => window.close(), 1200);
  } catch (error) {
    fail(error.message);
  }
});

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
  fillButton.disabled = true;
}
