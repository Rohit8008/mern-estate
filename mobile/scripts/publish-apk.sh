#!/bin/sh
# Build the Android app and publish it at https://realvista.duckdns.org/download
# (sideloaded APK; the app is not on the Play Store yet).
#
# Needs: Flutter 3.47+ (see RELEASE.md). The Android toolchain was upgraded
# project), android/key.properties pointing at the release keystore, and the
# "realvista" host in ~/.ssh/config.
#
# Bump `version:` in pubspec.yaml before publishing an update, and always sign
# with the same keystore: Android refuses to install an update signed with a
# different key over the existing app.
#
#   ./scripts/publish-apk.sh "What changed in this version"
set -e
cd "$(dirname "$0")/.."

# Flutter: $FLUTTER, else `flutter` on PATH, else a known install location.
# Must be 3.24.5 (see RELEASE.md).
if [ -z "${FLUTTER:-}" ]; then
  if command -v flutter >/dev/null 2>&1; then
    FLUTTER="$(command -v flutter)"
  else
    for dir in "$HOME/sdks/flutter-3.24.5" "$HOME/development/flutter-3.24.5"; do
      if [ -x "$dir/bin/flutter" ]; then FLUTTER="$dir/bin/flutter"; break; fi
    done
  fi
fi
if [ -z "${FLUTTER:-}" ] || [ ! -x "$FLUTTER" ]; then
  echo "Flutter not found. Set FLUTTER=/path/to/flutter-3.24.5/bin/flutter, put flutter on PATH, or install it at ~/sdks/flutter-3.24.5 (or ~/development/flutter-3.24.5)." >&2
  exit 1
fi
API_BASE_URL="${API_BASE_URL:-https://realvista.duckdns.org}"
NOTES="${1:-}"

[ -f android/key.properties ] || { echo "android/key.properties is missing: releases must be signed with the release key." >&2; exit 1; }

VERSION_LINE=$(grep -E '^version:' pubspec.yaml | awk '{print $2}')
VERSION=${VERSION_LINE%%+*}
BUILD=${VERSION_LINE##*+}

"$FLUTTER" build apk --release --target-platform android-arm64 --dart-define=API_BASE_URL="$API_BASE_URL"
# Flutter re-resolves pubspec.lock; keep the committed one.
git checkout -- pubspec.lock 2>/dev/null || true

APK=build/app/outputs/flutter-apk/app-release.apk
FILE="realvista-$VERSION.apk"
SIZE=$(stat -f%z "$APK" 2>/dev/null || stat -c%s "$APK")
SHA=$(shasum -a 256 "$APK" | awk '{print $1}')
NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)

TMP=$(mktemp -d)
cp "$APK" "$TMP/$FILE"
python3 - "$TMP/latest.json" "$VERSION" "$BUILD" "$FILE" "$SIZE" "$SHA" "$NOW" "$NOTES" <<'PY'
import json, sys
out, version, build, file, size, sha, now, notes = sys.argv[1:]
json.dump({"version": version, "build": int(build), "file": file, "sizeBytes": int(size),
           "sha256": sha, "releasedAt": now, "notes": notes}, open(out, "w"), indent=2)
PY

# The APK first, then latest.json, so the page never points at a file that is
# not there yet.
ssh realvista 'mkdir -p ~/sites/realvista-app'
rsync -az "$TMP/$FILE" realvista:sites/realvista-app/
rsync -az "$TMP/latest.json" realvista:sites/realvista-app/
rm -rf "$TMP"
echo "Published $FILE ($SIZE bytes): https://realvista.duckdns.org/download"
