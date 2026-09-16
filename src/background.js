// Owns the rule set and decides which rule applies to a given page.
//
// Rules come in two kinds. User rules are plaintext and fully editable. Sealed
// rules are the paid ones: only their `matches` is readable, the rest is
// encrypted, and they only run if signed with the key we shipped. seal.js does
// the verifying and decrypting.
//
// The password never reaches this worker either way. The popup takes it from
// the user's password manager, derives the requested characters there, and lets
// it go -- nothing is stored, here or anywhere else.

importScripts("crypto/keys.js", "crypto/seal.js");

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

    case "getSealedRules":
      return listSealedRules();
    case "importSealedRule":
      return importSealedRule(message.package);
    case "deleteSealedRule":
      return deleteSealedRule(message.index);
    case "setSealedMatches":
      return setSealedMatches(message.index, message.matches);

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

  // Both kinds of rule need a content script; sealed rules expose their
  // matches in the clear, which is all this needs.
  const all = [...(await loadRules()), ...(await loadSealedRules())];
  const wanted = [];

  for (const [index, rule] of all.entries()) {
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

// User rules win over paid ones, so a user can always override with their own.
async function ruleFor(url) {
  const applies = (rule) => rule.matches.some((p) => matchPattern(p, url));

  const userRule = (await loadRules()).find(applies);
  if (userRule) return userRule;

  const sealed = (await loadSealedRules()).find(applies);
  if (!sealed) return null;
  try {
    return await Seal.open(sealed); // verifies signature, then decrypts
  } catch {
    return null; // tampered or not ours -- behave as if it were not there
  }
}

async function loadSealedRules() {
  const { sealedRules } = await browser.storage.local.get({ sealedRules: [] });
  return sealedRules;
}

/** For the options list: only the cleartext part is ever exposed. */
async function listSealedRules() {
  return (await loadSealedRules()).map((pkg) => ({ matches: pkg.matches }));
}

async function importSealedRule(pkg) {
  if (!(await Seal.isSignatureValid(pkg))) {
    throw new Error("To nie jest reguła podpisana dla tego rozszerzenia.");
  }
  const sealedRules = await loadSealedRules();

  // A re-imported package (same signature) replaces the old copy rather than
  // stacking up -- but keeps the domains the user had set, since those are
  // theirs, not the package's.
  const previous = sealedRules.find((existing) => existing.sig === pkg.sig);
  const matches = previous?.matches ?? (Array.isArray(pkg.matches) ? pkg.matches : []);

  const next = sealedRules.filter((existing) => existing.sig !== pkg.sig);
  next.push({ matches, sealed: pkg.sealed, sig: pkg.sig });

  await browser.storage.local.set({ sealedRules: next });
  await syncContentScripts();
  return listSealedRules();
}

// The user owns a sealed rule's domains; its signed contents are untouched.
async function setSealedMatches(index, matches) {
  const sealedRules = await loadSealedRules();
  const rule = sealedRules[index];
  if (!rule) throw new Error("Nie ma takiej reguły.");

  rule.matches = (matches ?? []).map((m) => m.trim()).filter(Boolean);
  await browser.storage.local.set({ sealedRules });
  await syncContentScripts();
  return listSealedRules();
}

async function deleteSealedRule(index) {
  const sealedRules = await loadSealedRules();
  sealedRules.splice(index, 1);
  await browser.storage.local.set({ sealedRules });
  await syncContentScripts();
  return listSealedRules();
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
