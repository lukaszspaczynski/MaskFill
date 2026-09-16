// Owns the rule set and decides which rule applies to a given page.
//
// The password never reaches this worker at all. The popup takes it from the
// user's password manager, derives the requested characters there, and lets it
// go -- nothing is stored, here or anywhere else.

// Kept in step with manifest.json's content_scripts entry.
const MANIFEST_MATCHES = ["https://login.ingbank.pl/mojeing/app/*"];

// Shipped as a starting point, and as the worked example a user copies when
// writing their own. Stored on first run so it can be edited or deleted.
const BUILTIN_RULES = [
  {
    name: "Moje ING",
    matches: ["https://login.ingbank.pl/mojeing/app/*"],
    field: 'input[name^="password-"]',
    position: { from: "name", pattern: "password-(\\d+)", base: 0 },
  },
];

const DYNAMIC_SCRIPT_PREFIX = "rule-";

browser.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason === "install") {
    await browser.storage.local.set({ rules: BUILTIN_RULES });
  }
  await syncContentScripts();
});

browser.runtime.onStartup?.addListener(syncContentScripts);

browser.runtime.onMessage.addListener((message) => {
  switch (message?.type) {
    case "ruleFor":
      return ruleFor(message.url);
    case "getRules":
      return loadRules();
    case "saveRules":
      return saveRules(message.rules);

    default:
      return false;
  }
});

async function loadRules() {
  const { rules } = await browser.storage.local.get({ rules: BUILTIN_RULES });
  return rules;
}

async function saveRules(rules) {
  validate(rules);
  await browser.storage.local.set({ rules });
  await syncContentScripts();
  return rules;
}

/**
 * The manifest can only declare content scripts for hosts known at build time,
 * so user-written rules need their scripts registered at runtime -- and only
 * for hosts the user has actually granted. A rule the user has not approved
 * yet simply gets no script, which is the intended failure mode.
 */
async function syncContentScripts() {
  if (!browser.scripting?.registerContentScripts) return;

  const rules = await loadRules();
  const wanted = [];

  for (const [index, rule] of rules.entries()) {
    // Skip anything the static manifest entry already covers.
    const extra = rule.matches.filter((p) => !MANIFEST_MATCHES.includes(p));
    if (!extra.length) continue;

    let granted = false;
    try {
      granted = await browser.permissions.contains({ origins: extra });
    } catch {
      granted = false;
    }
    if (!granted) continue;

    wanted.push({
      id: `${DYNAMIC_SCRIPT_PREFIX}${index}`,
      matches: extra,
      js: ["content.js"],
      runAt: "document_idle",
      allFrames: true,
    });
  }

  try {
    const existing = await browser.scripting.getRegisteredContentScripts();
    const ours = existing
      .filter((script) => script.id.startsWith(DYNAMIC_SCRIPT_PREFIX))
      .map((script) => script.id);
    if (ours.length) await browser.scripting.unregisterContentScripts({ ids: ours });
    if (wanted.length) await browser.scripting.registerContentScripts(wanted);
  } catch (error) {
    // Safari has been inconsistent about dynamic registration; the built-in
    // rule still works from the manifest entry either way.
    console.warn("Could not sync dynamic content scripts:", error.message);
  }
}

/** First rule whose patterns match, or null. */
async function ruleFor(url) {
  const rules = await loadRules();
  return rules.find((rule) => rule.matches.some((p) => matchPattern(p, url))) ?? null;
}

/**
 * Minimal match-pattern implementation: scheme://host/path, where the host may
 * start with *. and the path may contain *. Deliberately not the full spec --
 * it only has to be strict enough that a rule cannot leak onto a host the user
 * did not write down.
 */
function matchPattern(pattern, url) {
  const parsed = /^(\*|https?):\/\/([^/]+)(\/.*)$/.exec(pattern);
  if (!parsed) return false;
  const [, scheme, host, path] = parsed;

  let target;
  try {
    target = new URL(url);
  } catch {
    return false;
  }

  if (scheme !== "*" && `${scheme}:` !== target.protocol) return false;

  if (host.startsWith("*.")) {
    const bare = host.slice(2);
    if (target.hostname !== bare && !target.hostname.endsWith(`.${bare}`)) return false;
  } else if (host !== "*" && host !== target.hostname) {
    return false;
  }

  const escaped = path.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`).test(target.pathname + target.search);
}

const POSITION_SOURCES = ["name", "id", "label", "printed", "order"];

function validate(rules) {
  if (!Array.isArray(rules)) throw new Error("Reguły muszą być listą.");

  rules.forEach((rule, index) => {
    const where = `Reguła ${index + 1}`;
    if (!rule.name) throw new Error(`${where}: brakuje "name".`);
    if (!Array.isArray(rule.matches) || !rule.matches.length) {
      throw new Error(`${where}: "matches" musi być niepustą listą.`);
    }
    for (const pattern of rule.matches) {
      if (!/^(\*|https?):\/\/[^/]+\/.*$/.test(pattern)) {
        throw new Error(`${where}: niepoprawny wzorzec "${pattern}".`);
      }
    }
    // A service worker has no DOM, so the selector can only be checked for
    // presence here; the options page verifies it actually parses.
    if (typeof rule.field !== "string" || !rule.field.trim()) {
      throw new Error(`${where}: brakuje "field".`);
    }

    const from = rule.position?.from ?? "order";
    if (!POSITION_SOURCES.includes(from)) {
      throw new Error(`${where}: "position.from" musi być jednym z: ${POSITION_SOURCES.join(", ")}.`);
    }
    if (rule.position?.pattern) {
      try {
        new RegExp(rule.position.pattern);
      } catch {
        throw new Error(`${where}: "position.pattern" nie jest poprawnym wyrażeniem regularnym.`);
      }
    }
  });
}
