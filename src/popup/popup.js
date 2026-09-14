const LABELS = { words: "Words", links: "Links", images: "Images" };

init();

async function init() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab) return fail("No active tab.");

  const settings = await Settings.loadSettings();

  let stats;
  try {
    stats = await browser.tabs.sendMessage(tab.id, {
      type: "getPageInfo",
      settings,
    });
  } catch {
    // No content script in this tab: an internal page, or a host the user has
    // not granted access to yet.
    return fail("This page can't be inspected.");
  }

  render(stats);
}

function render(stats) {
  document.getElementById("page-title").textContent = stats.title || stats.url;

  const dl = document.getElementById("stats");
  for (const [key, label] of Object.entries(LABELS)) {
    if (!(key in stats)) continue;
    dl.append(
      Object.assign(document.createElement("dt"), { textContent: label }),
      Object.assign(document.createElement("dd"), {
        textContent: stats[key].toLocaleString(),
      })
    );
  }
}

function fail(message) {
  document.getElementById("page-title").hidden = true;
  const el = document.getElementById("error");
  el.textContent = message;
  el.hidden = false;
}

document.getElementById("open-options").addEventListener("click", () => {
  browser.runtime.openOptionsPage();
  window.close();
});
