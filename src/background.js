// Background service worker. Seeds defaults on first install and keeps the
// toolbar badge in sync as content scripts report in from each tab.

importScripts("shared/settings.js");

browser.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason === "install") {
    await browser.storage.sync.set(Settings.DEFAULTS);
  }
});

browser.runtime.onMessage.addListener((message, sender) => {
  if (message?.type !== "reportPageInfo") return false;

  const tabId = sender.tab?.id;
  if (tabId !== undefined) updateBadge(tabId, message.stats);
  return Promise.resolve({ ok: true });
});

async function updateBadge(tabId, stats) {
  const text = stats?.links ? String(stats.links) : "";
  try {
    // Badge text is per-tab, so Safari discards it when the tab goes away.
    await browser.action.setBadgeText({ tabId, text });
  } catch {
    // Tab closed between the report and this call; nothing to update.
  }
}
