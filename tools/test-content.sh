#!/bin/bash
# Run the offline fixtures through headless Chrome and report the results.
# Exercises the real src/ code -- no bank, no Safari, no extension install.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

if [[ ! -x "$CHROME" ]]; then
  echo "Google Chrome not found; open the tools/mock-*.html files in a browser instead." >&2
  exit 2
fi

status=0

echo "── test-seal.mjs"
node "$ROOT/tools/test-seal.mjs" || status=1
echo

for fixture in "$ROOT"/tools/mock-*.html; do
  echo "── $(basename "$fixture")"

  # --allow-file-access-from-files lets a fixture fetch the page it is testing,
  # so the assertions run against the real markup rather than a copy.
  DOM="$("$CHROME" --headless --disable-gpu --no-sandbox \
    --allow-file-access-from-files --virtual-time-budget=4000 \
    --dump-dom "file://$fixture" 2>/dev/null)"

  python3 - "$DOM" <<'PY' || status=1
import re, sys
dom = sys.argv[1]
for cls, label in re.findall(r'<li class="(pass|fail)">(.*?)</li>', dom, re.S):
    print(f"   {cls.upper():4} {label}")
title = re.search(r"<title>(.*?)</title>", dom, re.S)
verdict = title.group(1) if title else "no result -- fixture did not run"
print(f"   {verdict}\n")
sys.exit(0 if "PASSED" in verdict else 1)
PY
done

exit $status
