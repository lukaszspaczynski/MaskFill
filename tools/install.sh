#!/bin/bash
# Install the built app into /Applications and register it with Safari.
#
# Safari can be unreliable about extensions living in DerivedData, and a clean
# build wipes that path anyway. Installing gives the extension a stable home.
# Also drops the old DerivedData registration so Safari does not list the
# extension twice.
#
# Usage: tools/install.sh [Debug|Release]
set -euo pipefail

CONFIG="${1:-Debug}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="/Applications/INGMaskFill.app"

"$ROOT/tools/build.sh" "$CONFIG"

BUILT="$(xcodebuild -project "$ROOT/xcode/INGMaskFill/INGMaskFill.xcodeproj" \
  -scheme INGMaskFill -configuration "$CONFIG" -showBuildSettings 2>/dev/null \
  | awk '/ BUILT_PRODUCTS_DIR = /{print $3}')/INGMaskFill.app"

# Unregister the DerivedData copy before replacing it.
pluginkit -r "$BUILT/Contents/PlugIns/INGMaskFill Extension.appex" 2>/dev/null || true

rm -rf "$DEST"
cp -R "$BUILT" "$DEST"
open "$DEST"

echo
echo "Installed to $DEST and launched it."
echo "Now, without restarting Safari:"
echo "  1. Safari > Settings > Advanced > Show features for web developers"
echo "  2. Develop > Allow Unsigned Extensions   (resets on every Safari restart)"
echo "  3. Safari > Settings > Extensions > enable ING Mask Fill"
