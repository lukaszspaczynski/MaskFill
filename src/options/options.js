const TOGGLES = ["countWords", "countLinks", "countImages"];
const hostsField = document.getElementById("blockedHosts");
const status = document.getElementById("status");

init();

async function init() {
  const settings = await Settings.loadSettings();

  for (const key of TOGGLES) {
    const input = document.getElementById(key);
    input.checked = settings[key];
    input.addEventListener("change", () => persist({ [key]: input.checked }));
  }

  hostsField.value = settings.blockedHosts.join("\n");
  hostsField.addEventListener("change", () =>
    persist({ blockedHosts: parseHosts(hostsField.value) })
  );
}

async function persist(patch) {
  await Settings.saveSettings(patch);
  status.textContent = "Saved.";
  setTimeout(() => (status.textContent = ""), 1500);
}

function parseHosts(raw) {
  return raw
    .split("\n")
    .map((line) => line.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, ""))
    .filter(Boolean);
}
