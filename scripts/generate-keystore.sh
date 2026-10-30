#!/usr/bin/env bash
# Create a release keystore for MKJ StudyOS and the git-ignored properties file
# that Gradle reads. Run once; keep the keystore and its passwords safe forever.
#
#   ./scripts/generate-keystore.sh
#
# Options:
#   MKJ_KEYSTORE_DIR=~/.mkj-keystore   where the .jks lives (default)
#   MKJ_KEY_ALIAS=mkj-release          key alias
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
KEYSTORE_DIR="${MKJ_KEYSTORE_DIR:-$HOME/.mkj-keystore}"
KEYSTORE="$KEYSTORE_DIR/mkj-release.jks"
ALIAS="${MKJ_KEY_ALIAS:-mkj-release}"
PROPERTIES="$ROOT/android/keystore.properties"

if ! command -v keytool >/dev/null 2>&1; then
  echo "keytool not found. Install JDK 17 (Eclipse Temurin or Android Studio's JDK) and retry." >&2
  exit 1
fi

if [ -f "$KEYSTORE" ]; then
  echo "A keystore already exists at $KEYSTORE"
  echo "Refusing to overwrite it: replacing the key would make every future update impossible."
  exit 1
fi

mkdir -p "$KEYSTORE_DIR"
echo "Creating $KEYSTORE"
echo "You will be asked for two passwords. Use a password manager and store both there."
keytool -genkeypair -v \
  -keystore "$KEYSTORE" \
  -alias "$ALIAS" \
  -keyalg RSA -keysize 4096 -validity 10000 \
  -storetype JKS

read -r -s -p "Keystore password (again, to write keystore.properties): " STORE_PASS; echo
read -r -s -p "Key password (ENTER if the same): " KEY_PASS; echo
if [ -z "${KEY_PASS:-}" ]; then KEY_PASS="$STORE_PASS"; fi

umask 077
cat > "$PROPERTIES" <<PROPS
storeFile=$KEYSTORE
storePassword=$STORE_PASS
keyAlias=$ALIAS
keyPassword=$KEY_PASS
PROPS
chmod 600 "$PROPERTIES"

cat <<'NEXT'

Done. Next:
  1. Back up the .jks file and both passwords somewhere safe and offline.
  2. npm run android:sync
  3. npm run android:build:release
  4. ./scripts/verify-apk.sh

android/keystore.properties is git-ignored; never commit it or the .jks.
NEXT
