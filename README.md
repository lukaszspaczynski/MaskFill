# Page Info — Safari Web Extension

A Manifest V3 Safari Web Extension that reports structural information about the
page you are viewing (word, link and image counts), plus the macOS container app
Safari needs in order to install it.

## Requirements

- macOS with Safari 16.4 or later (first release supporting MV3 service workers)
- Xcode with the macOS SDK (developed against Xcode 26.2)

## Build and run

```sh
tools/run.sh          # build, then launch the container app
```

Launching the app once registers the extension with Safari. Then:

1. Safari → Settings → Advanced → **Show features for web developers**
2. Safari → Develop → **Allow Unsigned Extensions** (required for local builds;
   resets every time Safari restarts)
3. Safari → Settings → Extensions → enable **Page Info**

## Layout

| Path     | Contents                                                          |
| -------- | ----------------------------------------------------------------- |
| `src/`   | The web extension itself — plain HTML/CSS/JS, no build step        |
| `xcode/` | Generated Xcode project; references `src/` in place                |
| `tools/` | Build/run scripts and the placeholder icon generator               |

See `CLAUDE.md` for architecture notes and the Xcode project's regeneration
procedure.
