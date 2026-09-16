#!/bin/bash
# Install the built app into /Applications and register it with Safari.
#
# Safari can be unreliable about extensions living in DerivedData, and a clean
# build wipes that path anyway. Installing gives the extension a stable home.
# Also drops the old DerivedData registration so Safari does not list the
# extension twice.
#
# Usage: tools/install.sh [Debug|Release] [--signed]
set -euo pipefail

CONFIG="${1:-Debug}"
MODE="${2:-}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="/Applications/MaskFill.app"

"$ROOT/tools/build.sh" "$CONFIG" $MODE

BUILT="$(xcodebuild -project "$ROOT/xcode/MaskFill/MaskFill.xcodeproj" \
  -scheme MaskFill -configuration "$CONFIG" -showBuildSettings 2>/dev/null \
  | awk '/ BUILT_PRODUCTS_DIR = /{print $3}')/MaskFill.app"

# Unregister the DerivedData copy before replacing it.
pluginkit -r "$BUILT/Contents/PlugIns/MaskFill Extension.appex" 2>/dev/null || true

rm -rf "$DEST"
cp -R "$BUILT" "$DEST"
open "$DEST"

echo
echo "Installed to $DEST and launched it."
if [[ "$MODE" == "--signed" ]]; then
  echo "Signed with a real team, so Allow Unsigned Extensions is not needed."
  echo "Enable it in Safari > Settings > Extensions."
else
  echo "Ad-hoc signed. Without restarting Safari:"
  echo "  1. Safari > Settings > Advanced > Show features for web developers"
  echo "  2. Develop > Allow Unsigned Extensions   (resets on every Safari restart)"
  echo "  3. Safari > Settings > Extensions > enable Mask Fill"
fi
