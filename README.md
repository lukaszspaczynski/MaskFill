# ING Mask Fill — Safari Web Extension

Moje ING asks for characters at specific positions of your password ("wpisz
wskazane znaki hasła" — e.g. 10, 14, 15, 17, 19 of 32). No password manager can
fill that. This extension can: it keeps the password in the macOS Keychain and,
on an explicit click, types only the characters the bank is currently asking for.

## Trade-offs, read before installing

Masked passwords exist partly so that no single capture reveals the whole
secret. Storing the full password anywhere — including the Keychain — gives up
some of that protection, and the extension is only as safe as the Mac it runs
on. Automating a bank login may also conflict with ING's terms of service.
This is a personal convenience tool; decide knowingly.

What it does not do: nothing runs automatically, nothing is transmitted
anywhere, and the password is never written to iCloud or to extension storage.

## Requirements

- macOS 12.3 or later with Safari 16.4 or later
- Xcode (developed against Xcode 26.2)

## Install

```sh
tools/run.sh
```

Launching the app once registers the extension with Safari. Then:

1. Safari → Settings → Advanced → **Show features for web developers**
2. Safari → Develop → **Allow Unsigned Extensions** (needed for local builds;
   resets every time Safari restarts)
3. Safari → Settings → Extensions → enable **ING Mask Fill** and grant it access
   to `login.ingbank.pl`
4. Open the extension's **Ustawienia** and save your Moje ING password

## Use

On the masked-password step of `login.ingbank.pl/mojeing/app/#login-oauth2`,
click the toolbar button. The popup shows which
positions ING is asking for; press **Wypełnij hasło** and review the boxes before
submitting. Signing in is always left to you.

## Testing without the bank

```sh
tools/test-content.sh
```

Runs `tools/mock-ing.html`, an offline replica of the widget, against the real
content script. Open that file in a browser to see the same checks visually.

## Layout

| Path      | Contents                                                     |
| --------- | ------------------------------------------------------------ |
| `src/`    | the extension — plain HTML/CSS/JS, no build step              |
| `xcode/`  | container app; `SafariWebExtensionHandler.swift` owns the Keychain |
| `tools/`  | build/run scripts, the offline test fixture, icon generator   |

See `CLAUDE.md` for the security model and architecture notes.
