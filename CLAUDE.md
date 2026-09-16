# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Safari Web Extension that fills the characters a masked-password login asks
for (e.g. "give me characters 10, 14, 15, 17, 19 of 32"). Password managers
cannot autofill that kind of widget, which is the entire reason this exists.

The **branding is deliberately bank-neutral** -- no bank name, no bank colours --
because the project is headed for distribution and using a bank's marks
commercially is a legal exposure. The **implementation is still ING-only**: the
host permission, the selectors and the fixture all target Moje ING. Those are
different things; do not "fix" the comments in `content.js` that name ING, they
describe what the selectors actually match.

## Commands

```sh
tools/build.sh [Debug|Release]   # build app + extension (ad-hoc signed)
tools/run.sh   [Debug|Release]   # build, then launch the app to register it with Safari
tools/install.sh [Debug|Release] # install to /Applications; use when Safari will not list the extension
tools/test-content.sh            # run the content-script tests headless (needs Google Chrome)
python3 tools/make-icons.py      # regenerate the placeholder icons
node --check src/content.js      # syntax check; there is no JS toolchain
```

`tools/test-content.sh` runs every `tools/mock-*.html` fixture through headless
Chrome. Each loads the real source rather than a copy, so the assertions cannot
drift from what ships:

- `mock-widget.html` replicates ING's Lion/Lit widget -- shadow roots, slotted
  inputs, disabled boxes -- and drives `src/content.js`. Use it instead of the
  bank's site when changing detection or filling.
- `mock-options.html` fetches `src/options/options.html`, mounts its markup,
  stubs the extension APIs and runs the real `src/options/options.js` against
  it. This is why the runner passes Chrome `--allow-file-access-from-files`.

Opening either file in a browser shows the same results.

There is no Swift to test -- the native handler is a stub.

Detection and filling have been confirmed working against the live ING site.

## Security model

**Nothing is persisted.** The popup takes the password from the user's password
manager (macOS autofill, which means Touch ID), derives the characters for the
positions the site asked for, and lets it go when the popup closes. It is held
in one local variable and the field is cleared on click.

This is the whole point of the design, and it is what removed the extension's
original tension: storing a full banking password undercuts the reason masked
passwords exist, and duplicated what the password manager already held. There is
no Keychain item, no `storage` of secrets, no native messaging. **Do not add a
"remember my password" convenience** -- an earlier version had one and it was
deliberately deleted.

`SafariWebExtensionHandler.swift` is a stub. Safari requires the class to exist
and requires the container app to ship the extension at all, but no message
needs native code. The container app is otherwise an empty shell.

One consequence worth knowing: because nothing native is required, everything
except the Safari app wrapper is portable to Chrome and Firefox as-is.

Other deliberate constraints, all worth preserving:

- Static `host_permissions` name one path. Broad access exists only as an
  optional permission the user grants per site.
- Filling requires an explicit click. Nothing fills on page load.
- Rules are user-authored only. **Never add "import rules from a URL"** -- a
  rule is a selector plus a regex applied to a login page, so a hostile rule is
  a credential-theft primitive.

## Architecture

Two layers built together but developed differently:

- **`src/`** — the Manifest V3 extension. Plain HTML/CSS/JS, no build step, no
  ES modules (Safari has no module service workers, so `background.js` uses
  `importScripts` if it ever needs shared code).
- **`xcode/MaskFill/`** — the macOS container app. Safari can only install an
  extension that ships inside an app; beyond that the app does nothing and
  `SafariWebExtensionHandler.swift` is a stub.

The Xcode project references `src/` through **relative paths** (`../../../src/...`),
not copies — edit `src/` and rebuild; never re-run the converter just to pick up
source changes. `src/popup`, `src/options` and `src/images` are Xcode *folder
references* so new files inside them are bundled automatically, but a new file at
the top level of `src/` must be added to the extension target's Resources phase.

### Native messaging protocol

`background.js` is the only caller. Every reply is either the documented shape or
`{error: string}`, which surfaces as a rejected promise in the UI.

| Request                            | Reply                          |
| ---------------------------------- | ------------------------------ |
| `{action:"status"}`                | `{stored: bool, length: int}`  |
| `{action:"save", password}`        | same as `status`               |
| `{action:"delete"}`                | same as `status`               |
| `{action:"chars", positions:[int]}`| `{chars: {"10":"j", …}}`       |

Positions are 1-based to match ING's own labels.

### Rules, not hardcoded selectors

Detection is driven by a user-editable rule list in `browser.storage.local`.
`content.js` contains no site-specific knowledge; it is handed a rule and applies
it. `BUILTIN_RULES` in `background.js` seeds one entry for Moje ING, which is
also the worked example users copy.

```json
{
  "name": "Moje ING",
  "matches": ["https://login.ingbank.pl/mojeing/app/*"],
  "field": "input[name^=\"password-\"]",
  "position": { "from": "name", "pattern": "password-(\\d+)", "base": 0 },
  "disabledWhen": "[disabled],[readonly]"
}
```

Rules are edited as cards in the options page: a rule owns a list of addresses,
and `[matches] -> rule` is always one tuple that can be added or removed whole.
The JSON view underneath is the same model, for copying rules between machines.
`render()` rebuilds the list only when rules or addresses are added or removed;
typing binds straight to the model so a field never loses focus mid-edit.

`position.from` is one of `name`, `id`, `label`, `printed`, `order`. Reading the
position from an attribute beats counting DOM order: a site that omits some
boxes would otherwise shift every position silently. `base: 0` handles sites
that number from zero -- ING's `password-9` is the 10th character.

Two facts about ING's markup that the shipped rule encodes, both found only
against the live site:

- The inputs are `type="password"` with **no `maxlength`**. An early version
  selected `input[maxlength="1"]` and matched nothing at all.
- **The widget lives inside the app's shadow tree**, so a plain
  `document.querySelectorAll` finds nothing. `deepQueryAll()` recurses into open
  shadow roots. The fixture nests its widget the same way and asserts a
  non-piercing query returns zero, so the regression cannot come back unnoticed.
  Closed shadow roots are unreachable by any script and no rule can fix that.

**Writing a value requires dispatching events.** The page framework keeps its own
copy and syncs it from `input` events, so `input.value = char` is silently
ignored. `setValue()` uses the native `HTMLInputElement.prototype.value` setter
and then fires `input` and `change`. The fixture has a negative-control
assertion for exactly this.

`tools/inspect-widget.js` dumps a live widget's structure from the Web Inspector
console (never values) when writing a rule for a new site.

### Permissions for user-added sites

The manifest can only name hosts known at build time, so there is a static
`content_scripts` entry for ING plus `optional_host_permissions: ["*://*/*"]`.
When rules are saved, the options page calls `permissions.request()` -- it has to
be there, because that API needs a user gesture -- and `syncContentScripts()` in
the background registers scripts only for rules whose hosts are actually
granted. An unapproved rule simply gets no content script.

`syncContentScripts()` swallows its errors on purpose: Safari has been
inconsistent about `scripting.registerContentScripts`, and the built-in ING rule
keeps working from the manifest entry regardless.

Never widen the static `host_permissions`. Broad access is available only as an
optional permission the user grants per site.

## Gotchas

**Safari forgets local extensions.** Builds are ad-hoc signed, which Safari
treats as unsigned: until Develop → *Allow Unsigned Extensions* is on, the
extension is **absent from the Extensions list entirely**, not greyed out. That
setting resets on every Safari restart, so enable it *after* restarting, then
open Settings → Extensions without restarting again.

**DerivedData is a fragile home for the app.** Safari can fail to list an
extension living there, and `xcodebuild clean` deletes it. `tools/install.sh`
copies the app to /Applications and unregisters the DerivedData copy so Safari
does not see two.

**Bundle identifier case must match `--app-name`.** The converter derives the app
id from `--app-name` but uses the literal `--bundle-identifier` for the extension
target, so a case mismatch fails `ValidateEmbeddedBinary` with "embedded binary's
bundle identifier is not prefixed with the parent app's".

## Regenerating the Xcode project

Only needed when changing platform, app name, or identifiers. It discards
`SafariWebExtensionHandler.swift` and the manual edit listed below, so copy them
aside first.

```sh
rm -rf xcode
xcrun safari-web-extension-converter src \
  --project-location xcode --app-name MaskFill \
  --bundle-identifier com.example.MaskFill \
  --macos-only --swift --no-open --no-prompt --force
```

Manual edit to re-apply afterwards: the converter sets
`MACOSX_DEPLOYMENT_TARGET` to 10.14 for the extension target and to the current
SDK for the app. Both are wrong — set all four occurrences to `12.3`, the macOS
version that shipped Safari 16.4 and therefore MV3 service workers. Anything
below 11.0 also fails to compile `Logger`.

The project is macOS-only; adding iOS later is `--rebuild-project`, not a fresh
conversion.

## Placeholders to replace before this is more than a personal tool

- Bundle identifier is `com.example.MaskFill`, and `NATIVE_APP_ID` in
  `background.js` must be kept in sync with it.
- `src/images/*` are generated placeholders (an orange disc with an "i").
  Replacing them means deleting `tools/make-icons.py`, which would otherwise
  overwrite real artwork.
- Builds are ad-hoc signed with no development team.
- UI strings are Polish and hardcoded; there is no `_locales`.
