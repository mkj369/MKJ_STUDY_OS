#!/usr/bin/env bash
# Inspect a built APK: does it exist, is it signed, what identity does it carry?
# Usage: ./scripts/verify-apk.sh [path-to-apk]
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APK="${1:-$ROOT/android/app/build/outputs/apk/release/app-release.apk}"

if [ ! -f "$APK" ]; then
  echo "No APK at $APK"
  echo "Build one first: npm run android:sync && npm run android:build:release"
  exit 1
fi

SIZE=$(wc -c < "$APK")
echo "APK:  $APK"
echo "Size: $((SIZE / 1024)) KB"

if [ -z "${ANDROID_HOME:-}" ]; then
  echo "ANDROID_HOME is not set, so apksigner/aapt2 cannot run."
  echo "The file exists, but signature and badging are unverified."
  exit 2
fi

APKSIGNER=$(ls "$ANDROID_HOME"/build-tools/*/apksigner 2>/dev/null | sort -V | tail -1 || true)
if [ -n "$APKSIGNER" ]; then
  "$APKSIGNER" verify --print-certs "$APK"
else
  echo "apksigner not found under $ANDROID_HOME/build-tools"
fi

AAPT=$(ls "$ANDROID_HOME"/build-tools/*/aapt2 2>/dev/null | sort -V | tail -1 || true)
if [ -n "$AAPT" ]; then
  "$AAPT" dump badging "$APK" | grep -E "^package:|^sdkVersion|^targetSdkVersion|uses-permission" | head -12
fi
