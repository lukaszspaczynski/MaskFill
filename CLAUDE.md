# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Safari Web Extension that fills the masked-password characters ING's Moje ING
login asks for (e.g. "give me characters 10, 14, 15, 17, 19 of 32"). Password
managers cannot autofill that widget, which is the entire reason this exists.

## Commands

```sh
tools/build.sh [Debug|Release]   # build app + extension (ad-hoc signed)
tools/run.sh   [Debug|Release]   # build, then launch the app to register it with Safari
tools/install.sh [Debug|Release] # install to /Applications; use when Safari will not list the extension
tools/test-content.sh            # run the content-script tests headless (needs Google Chrome)
python3 tools/make-icons.py      # regenerate the placeholder icons
node --check src/content.js      # syntax check; there is no JS toolchain
```

`tools/test-content.sh` drives `tools/mock-ing.html`, an offline stand-in for the
ING widget that loads the real `src/content.js`. Use it instead of the bank's
site when changing detection or filling. Opening the fixture in a browser shows
the same results.

There are no Swift tests. The Keychain code was verified once out-of-band by
compiling `SafariWebExtensionHandler.swift` standalone against a throwaway
service name; if you change it, do that again rather than testing against the
real stored password.

The whole path -- shadow-piercing detection, native messaging, Keychain
read/write, and filling -- has been confirmed working against the live ING site
with an ad-hoc signed build. A real development team is therefore not required
for Keychain access from the sandboxed appex, contrary to what the signing
warnings suggest.

## Security model

Three zones, and the password crosses as few boundaries as possible:

| Zone                          | What it may hold                                  |
| ----------------------------- | ------------------------------------------------- |
| Native handler (`.appex`)     | the full password, read from the Keychain         |
| Extension JS (background/popup) | only the characters for the positions requested |
| Page (`content.js`)           | only those same characters, written into the boxes |

This is why `background.js` asks the native side for `{action:"chars", positions}`
rather than fetching the password and slicing it in JavaScript. **Do not add a
native action that returns the whole password** — it would collapse the top two
rows of that table for no gain.

Other deliberate constraints, all worth preserving:

- Host permissions are limited to the single path `https://login.ingbank.pl/mojeing/app/*`.
  Never widen this; the extension has access to a banking password. Match
  patterns cannot express the `#login-oauth2` fragment, and the app is a SPA that
  changes route without reloading, so the content script deliberately does not
  check `location.hash` -- `probe()` returning `found: false` when the widget is
  absent is the reliable signal.
- Filling requires an explicit click in the popup. Nothing fills automatically on
  page load.
- The Keychain item is `kSecAttrSynchronizable: false`, so the password stays on
  this Mac and does not go to iCloud.
- The native handler logs failures but never the secret. Keep it that way.

## Architecture

Two layers built together but developed differently:

- **`src/`** — the Manifest V3 extension. Plain HTML/CSS/JS, no build step, no
  ES modules (Safari has no module service workers, so `background.js` uses
  `importScripts` if it ever needs shared code).
- **`xcode/INGMaskFill/`** — the macOS container app. Safari can only install an
  extension that ships inside an app. `SafariWebExtensionHandler.swift` is the
  real work: Keychain storage plus the position→character lookup.

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

### Widget detection

Verified against the real page markup, not guessed. ING's widget is built from
Lit/Lion custom elements:

```html
<ing-input-masked-password-field name="password-9" ...>   <!-- 10th character -->
  <label slot="label">Wpisz 10. znak hasła</label>
  <input slot="input" type="password" name="password-9">  <!-- light DOM -->
  <ing-paragraph slot="after">10</ing-paragraph>
</ing-input-masked-password-field>
```

Three facts that drive `content.js`:

- **Inputs are `type="password"` with no `maxlength`.** An earlier version
  selected `input[maxlength="1"]` and matched nothing at all. The selector is
  `input[name^="password-"]`.
- **`name` is 0-based, the UI is 1-based.** `password-9` is the 10th character.
  Position comes from the name, never from DOM order, so a box missing from the
  page cannot shift every other position. `positionOf()` falls back to the digit
  in `slot="after"`, then to the label text.
- **The widget lives inside the app's shadow tree**, so a plain
  `document.querySelectorAll` finds nothing at all -- this was the second bug
  found on the live site. `findFields()` uses `deepQueryAll()`, which recurses
  into open shadow roots. The fixture nests its widget the same way and asserts
  that a non-piercing query returns zero, so the regression cannot come back
  unnoticed. Closed shadow roots would be unreachable by any script; if ING ever
  switches to `mode: "closed"` this approach dies and there is no workaround
  from a content script.

Boxes the bank is not asking for carry `disabled` on both the host and the inner
input, so `!input.disabled && !input.readOnly` is the fillable test.

**Writing a value requires dispatching events.** The Lion field keeps its own
`modelValue` and syncs it from `input` events, so `input.value = char` is
silently ignored. `setValue()` goes through the native
`HTMLInputElement.prototype.value` setter and then fires `input` and `change`.
`tools/mock-ing.html` has a negative-control assertion for exactly this; if
filling ever stops working, that is the first thing to suspect and the fixture
is where to reproduce it.

`tools/inspect-widget.js` dumps the live widget's structure from the Web
Inspector console (never values) if the markup changes again.

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

**Native messaging needs both halves installed.** "Native handler unreachable"
in the UI means the container app is missing or signed inconsistently with the
extension, not that the Keychain is empty.

## Regenerating the Xcode project

Only needed when changing platform, app name, or identifiers. It discards
`SafariWebExtensionHandler.swift` and the manual edit listed below, so copy them
aside first.

```sh
rm -rf xcode
xcrun safari-web-extension-converter src \
  --project-location xcode --app-name INGMaskFill \
  --bundle-identifier com.example.INGMaskFill \
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

- Bundle identifier is `com.example.INGMaskFill`, and `NATIVE_APP_ID` in
  `background.js` must be kept in sync with it.
- `src/images/*` are generated placeholders (an orange disc with an "i").
  Replacing them means deleting `tools/make-icons.py`, which would otherwise
  overwrite real artwork.
- Builds are ad-hoc signed with no development team.
- UI strings are Polish and hardcoded; there is no `_locales`.
