#!/bin/bash
# Build the app + extension. Ad-hoc signs so the build works without a
# developer account; Safari will only load the result if "Allow Unsigned
# Extensions" is enabled in its Develop menu.
#
# Usage: tools/build.sh [Debug|Release]
set -euo pipefail

CONFIG="${1:-Debug}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

xcodebuild \
  -project "$ROOT/xcode/PageInfo/PageInfo.xcodeproj" \
  -scheme PageInfo \
  -configuration "$CONFIG" \
  CODE_SIGN_IDENTITY="-" \
  CODE_SIGN_STYLE=Manual \
  DEVELOPMENT_TEAM="" \
  build

xcodebuild -project "$ROOT/xcode/PageInfo/PageInfo.xcodeproj" -scheme PageInfo \
  -configuration "$CONFIG" -showBuildSettings 2>/dev/null \
  | awk '/ BUILT_PRODUCTS_DIR = /{print "Built: " $3 "/PageInfo.app"}'
