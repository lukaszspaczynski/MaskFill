#!/bin/bash
# Run the offline widget fixture through headless Chrome and report the result.
# Exercises src/content.js directly -- no bank, no Safari, no extension install.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

if [[ ! -x "$CHROME" ]]; then
  echo "Google Chrome not found; open tools/mock-ing.html in a browser instead." >&2
  exit 2
fi

DOM="$("$CHROME" --headless --disable-gpu --no-sandbox --virtual-time-budget=2000 \
  --dump-dom "file://$ROOT/tools/mock-ing.html" 2>/dev/null)"

python3 - "$DOM" <<'PY'
import re, sys
dom = sys.argv[1]
for cls, label in re.findall(r'<li class="(pass|fail)">(.*?)</li>', dom, re.S):
    print(f"{cls.upper():4}  {label}")
title = re.search(r"<title>(.*?)</title>", dom, re.S)
print()
print(title.group(1) if title else "no result -- fixture did not run")
sys.exit(0 if title and "PASSED" in title.group(1) else 1)
PY
