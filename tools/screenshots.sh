#!/bin/bash
# Regenerate the README screenshots in docs/screenshots/ with headless Chrome.
#
# Everything on screen is shipped code: the real popup, options page and content
# script, with only the extension API stubbed. The bank is a neutral
# bank.example page (tools/screenshot-stage.html), never the live site -- it
# would show a real login and a bank's marks.
#
# The pages are served over a local HTTP server rather than file:// because the
# popup iframe calls the content script in its parent, which file:// origins
# do not allow.
#
# Usage: tools/screenshots.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
OUT="$ROOT/docs/screenshots"

if [[ ! -x "$CHROME" ]]; then
  echo "Google Chrome not found." >&2
  exit 2
fi

WORK="$(mktemp -d)"
SERVER=""
cleanup() {
  if [[ -n "$SERVER" ]]; then
    kill "$SERVER" 2>/dev/null
    wait "$SERVER" 2>/dev/null || true
  fi
  rm -rf "$WORK"
}
trap cleanup EXIT

ln -s "$ROOT/src" "$WORK/src"
cp "$ROOT/tools/screenshot-stage.html" "$WORK/stage.html"

# Wrap the shipped popup and options pages: same markup, plus a stub of the
# extension API injected just before their own script.
python3 - "$ROOT/src" "$WORK" <<'PY'
import pathlib, sys

src, work = map(pathlib.Path, sys.argv[1:])

def wrap(page, base, stub, out):
    html = (src / page).read_text()
    html = html.replace("<head>", f'<head>\n    <base href="{base}" />', 1)
    at = html.rindex("<script src=")
    (work / out).write_text(html[:at] + f"<script>{stub}</script>\n    " + html[at:])

# The popup asks the stage page's content script, then types a password and
# presses the button, so the shot shows the filled boxes and the result line.
wrap("popup/popup.html", "/src/popup/", r"""
const RULE = {
  name: "Mój bank",
  matches: ["https://bank.example/login/*"],
  field: 'input[name^="password-"]',
  position: { from: "name", pattern: "password-(\\d+)", base: 0 },
};
window.browser = {
  tabs: {
    async query() { return [{ id: 1, url: "https://bank.example/login/" }]; },
    sendMessage: (id, message) => parent.contentListener(message),
  },
  runtime: {
    async sendMessage(message) { return message.type === "ruleFor" ? RULE : null; },
    openOptionsPage() {},
  },
};
window.close = () => {};
setTimeout(() => {
  const field = document.getElementById("once");
  field.value = "correct-horse-battery-staple-42!";
  field.dispatchEvent(new Event("input"));
  document.getElementById("fill-once").click();
}, 400);
""", "popup.html")

# The shipped rule, a user rule using a different position source, and one
# sealed package -- of which the page only ever sees the addresses.
wrap("options/options.html", "/src/options/", r"""
const RULES = [
  { name: "Moje ING",
    matches: ["https://login.ingbank.pl/mojeing/app/*"],
    field: 'input[name^="password-"]',
    position: { from: "name", pattern: "password-(\\d+)", base: 0 } },
  { name: "Mój drugi bank",
    matches: ["https://bank.example/login/*", "https://m.bank.example/*"],
    field: "input.mask-char",
    position: { from: "label", pattern: "(\\d+)\\. znak", base: 1 } },
];
window.browser = {
  runtime: {
    async sendMessage(message) {
      if (message.type === "getRules") return structuredClone(RULES);
      if (message.type === "getSealedRules")
        return [{ matches: ["https://online.otherbank.example/*"] }];
      return null;
    },
  },
  permissions: { async request() { return true; } },
  storage: { local: { async remove() {} } },
};
""", "options.html")
PY

PORT="$(python3 -c 'import socket; s = socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1])')"
python3 -m http.server "$PORT" --bind 127.0.0.1 --directory "$WORK" >/dev/null 2>&1 &
SERVER=$!
for _ in {1..50}; do
  curl -fs "http://127.0.0.1:$PORT/stage.html" >/dev/null && break
  sleep 0.1
done

mkdir -p "$OUT"

# Light scheme regardless of the Mac's appearance, at 2x for retina displays.
shoot() {
  "$CHROME" --headless --disable-gpu --hide-scrollbars \
    --force-device-scale-factor=2 --blink-settings=preferredColorScheme=1 \
    --virtual-time-budget=3000 --window-size="$2" \
    --screenshot="$OUT/$3" "http://127.0.0.1:$PORT/$1" 2>/dev/null
  echo "   $3"
}

shoot stage.html   1124,450 fill.png
shoot options.html 708,1078 rules.png
