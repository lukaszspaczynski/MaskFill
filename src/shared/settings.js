// Settings helpers shared by every context in the extension. Deliberately a
// classic script rather than an ES module so the same file can be loaded three
// ways: injected ahead of the content script by the manifest, pulled into the
// service worker with importScripts(), and included by the popup/options pages
// with a plain <script> tag. Safari does not support module service workers.

(() => {
  const DEFAULTS = {
    countWords: true,
    countLinks: true,
    countImages: true,
    blockedHosts: [],
  };

  async function loadSettings() {
    const stored = await browser.storage.sync.get(DEFAULTS);
    return { ...DEFAULTS, ...stored };
  }

  async function saveSettings(patch) {
    await browser.storage.sync.set(patch);
  }

  function isBlocked(settings, url) {
    let host;
    try {
      host = new URL(url).hostname;
    } catch {
      return true;
    }
    return (settings.blockedHosts ?? []).some(
      (blocked) => host === blocked || host.endsWith(`.${blocked}`)
    );
  }

  globalThis.Settings = { DEFAULTS, loadSettings, saveSettings, isBlocked };
})();
