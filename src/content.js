// Content script. Runs in the page's isolated world on every URL the user has
// granted access to. shared/settings.js is injected ahead of this file by the
// manifest, so Settings.* is available here.

(async () => {
  const settings = await Settings.loadSettings();
  if (Settings.isBlocked(settings, location.href)) return;

  browser.runtime.sendMessage({
    type: "reportPageInfo",
    stats: collectStats(settings),
  });
})();

browser.runtime.onMessage.addListener((message) => {
  if (message?.type !== "getPageInfo") return false;
  return Promise.resolve(collectStats(message.settings));
});

function collectStats(settings) {
  const stats = {
    title: document.title,
    url: location.href,
    host: location.hostname,
  };

  if (settings.countWords) {
    stats.words = (document.body?.innerText.match(/\S+/g) ?? []).length;
  }
  if (settings.countLinks) {
    stats.links = document.links.length;
  }
  if (settings.countImages) {
    stats.images = document.images.length;
  }

  return stats;
}
