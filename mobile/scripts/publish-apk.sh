#!/bin/sh
# Build the Android app and publish it at https://realvista.duckdns.org/download
# (sideloaded APK; the app is not on the Play Store yet).
#
# Needs: Flutter 3.24.5 (see RELEASE.md; newer Flutter cannot build this
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

FLUTTER="${FLUTTER:-$HOME/development/flutter-3.24.5/bin/flutter}"
API_BASE_URL="${API_BASE_URL:-https://realvista.duckdns.org}"
NOTES="${1:-}"

[ -f android/key.properties ] || { echo "android/key.properties is missing: releases must be signed with the release key." >&2; exit 1; }

VERSION_LINE=$(grep -E '^version:' pubspec.yaml | awk '{print $2}')
VERSION=${VERSION_LINE%%+*}
BUILD=${VERSION_LINE##*+}

"$FLUTTER" build apk --release --dart-define=API_BASE_URL="$API_BASE_URL"
# Flutter 3.24.5 re-resolves pubspec.lock; keep the committed one.
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
