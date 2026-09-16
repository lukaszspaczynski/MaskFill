# Mask Fill — Safari Web Extension

Some banks ask for characters at specific positions of your password ("wpisz
wskazane znaki hasła" — e.g. 10, 14, 15, 17, 19 of 32). No password manager can
fill that. This extension can: on an explicit click it types only the characters
the bank is currently asking for, taking the password from your password manager
and keeping nothing.

Ships with a rule for Moje ING and lets you add your own: each rule says which
addresses it covers, how to find the character boxes, and how to read the
position number off them. Rules can also be imported as signed, encrypted
packages whose only readable part is the address they run on. See
**Ustawienia → Reguły**.

## Trade-offs, read before installing

The extension stores nothing: the password goes from your password manager
straight into the boxes and is gone when the popup closes. It is still only as
safe as the Mac it runs on, and automating a bank login may conflict with your
bank's terms of service. Decide knowingly.

Nothing runs automatically and nothing is transmitted anywhere.

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
3. Safari → Settings → Extensions → enable **Mask Fill** and grant it access
   to `login.ingbank.pl`
4. Open the masked-password step and fill from your password manager

## Use

On the masked-password step of `login.ingbank.pl/mojeing/app/#login-oauth2`,
click the toolbar button. The popup shows which
positions ING is asking for; press **Wypełnij hasło** and review the boxes before
submitting. Signing in is always left to you.

## Testing without the bank

```sh
tools/test-content.sh
```

Runs `tools/mock-widget.html`, an offline replica of the widget, against the real
content script. Open that file in a browser to see the same checks visually.

## Layout

| Path      | Contents                                                     |
| --------- | ------------------------------------------------------------ |
| `src/`    | the extension — plain HTML/CSS/JS, no build step              |
| `xcode/`  | container app Safari requires; the native handler is a stub   |
| `tools/`  | build/run scripts, the offline test fixture, icon generator   |

## Writing a rule for another site

Open the masked-password step, paste `tools/inspect-widget.js` into the Web
Inspector console, and it prints the widget's structure — attribute names,
which boxes are disabled, where the position number is rendered. It never reads
values, so the output is safe to share. Then add a rule in the settings page;
Safari will ask for access to the new site.

See `CLAUDE.md` for the security model and architecture notes.
