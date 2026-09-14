#!/bin/bash
# Build, then launch the container app once. Launching is what registers the
# extension with Safari; after that, enable it in Safari Settings > Extensions.
#
# Usage: tools/run.sh [Debug|Release]
set -euo pipefail

CONFIG="${1:-Debug}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

"$ROOT/tools/build.sh" "$CONFIG"

APP_DIR="$(xcodebuild -project "$ROOT/xcode/INGMaskFill/INGMaskFill.xcodeproj" -scheme INGMaskFill \
  -configuration "$CONFIG" -showBuildSettings 2>/dev/null \
  | awk '/ BUILT_PRODUCTS_DIR = /{print $3}')"

open "$APP_DIR/INGMaskFill.app"
