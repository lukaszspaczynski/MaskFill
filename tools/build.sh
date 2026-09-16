#!/bin/bash
# Build the app + extension.
#
# By default signs ad-hoc, which works without any Apple account but means
# Safari treats the extension as unsigned: Develop > Allow Unsigned Extensions
# has to be re-enabled after every Safari restart.
#
# With --signed, uses the personal team configured in the project. That removes
# the unsigned-extension dance, but needs a valid Apple ID session in Xcode
# (Xcode > Settings > Accounts) and an unexpired development certificate.
#
# Usage: tools/build.sh [Debug|Release] [--signed]
set -euo pipefail

CONFIG="${1:-Debug}"
MODE="${2:-}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT="$ROOT/xcode/MaskFill/MaskFill.xcodeproj"

if [[ "$MODE" == "--signed" ]]; then
  xcodebuild -project "$PROJECT" -scheme MaskFill -configuration "$CONFIG" \
    -allowProvisioningUpdates build
else
  # Ad-hoc: override the project's automatic signing settings.
  xcodebuild -project "$PROJECT" -scheme MaskFill -configuration "$CONFIG" \
    CODE_SIGN_IDENTITY="-" \
    CODE_SIGN_STYLE=Manual \
    DEVELOPMENT_TEAM="" \
    build
fi

xcodebuild -project "$PROJECT" -scheme MaskFill -configuration "$CONFIG" \
  -showBuildSettings 2>/dev/null \
  | awk '/ BUILT_PRODUCTS_DIR = /{print "Built: " $3 "/MaskFill.app"}'
