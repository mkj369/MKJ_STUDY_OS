# Building and signing the MKJ StudyOS release APK

This page covers the release build only. Toolchain installation, emulator and
`adb install` steps are in [ANDROID_APK.md](ANDROID_APK.md).

| Field | Value |
| --- | --- |
| Application ID | `com.mkjstudyos.app` |
| App name | MKJ StudyOS |
| versionName | `1.0.0` |
| versionCode | `1` |
| minSdk / targetSdk / compileSdk | 23 / 35 / 35 |
| Permissions | `INTERNET`, `POST_NOTIFICATIONS` (+ `RECEIVE_BOOT_COMPLETED`, `WAKE_LOCK` merged by the notification plugin) |
| Backup | disabled (`allowBackup=false`) |
| Icon / splash | generated from `public/logo-mark.svg`; `node scripts/generate-splash.mjs` rebuilds the 11 splash PNGs, launcher icons are already branded |

## 1. One-time: create the signing key

The key is the app's identity. Losing it means you can never update the app on
Google Play — a new key means a new listing. Keep **three** copies: the keystore
file, a password manager entry for the passwords, and an offline backup.

```bash
./scripts/generate-keystore.sh          # macOS / Linux, needs JDK 17+
```

It creates:

```
~/.mkj-keystore/mkj-release.jks       # the key (never in Git)
android/keystore.properties           # git-ignored, points at it
```

Manual equivalent:

```bash
keytool -genkeypair -v \
  -keystore ~/.mkj-keystore/mkj-release.jks \
  -alias mkj-release \
  -keyalg RSA -keysize 4096 -validity 10000 \
  -storetype JKS
```

`android/keystore.properties`:

```properties
storeFile=/Users/you/.mkj-keystore/mkj-release.jks
storePassword=…
keyAlias=mkj-release
keyPassword=…
```

`android/keystore.properties`, `*.jks`, `*.keystore` and `*.p12` are all in
`.gitignore`; a test asserts the build script contains no hard-coded password.

### CI / no-file alternative

`android/app/build.gradle` also reads these environment variables:

```
MKJ_KEYSTORE_FILE  MKJ_KEYSTORE_PASSWORD  MKJ_KEY_ALIAS  MKJ_KEY_PASSWORD
```

Store them as masked CI secrets, never in the repository.

## 2. Build

```bash
npm ci
npm run android:preflight     # JDK 17 + SDK 35 + wrapper + synced assets
npm run android:sync          # vite build (production, no demo fixtures) + cap sync
npm run android:build:release # → android/app/build/outputs/apk/release/app-release.apk
# or, for Play:
npm run android:bundle:release # → android/app/build/outputs/bundle/release/app-release.aab
```

The splash is not decoration: the unmodified Capacitor template ships a blue X on
white and the build stays green while the app launches with it. `tests/android/config.test.ts`
fails the suite if any density is still that template, and
`node scripts/generate-splash.mjs` regenerates all eleven sizes from the project
logo in one command.

Without signing material the release build still finishes but is **unsigned** and
cannot be installed. `scripts/verify-apk.sh` checks the output and reports which
case you are in.

## 3. Verify before publishing

```bash
$ANDROID_HOME/build-tools/35.0.0/apksigner verify --print-certs \
  android/app/build/outputs/apk/release/app-release.apk
ls -lh android/app/build/outputs/apk/release/app-release.apk
```

- Signature scheme: at least v1 + v2 (apksigner reports v3 too when available).
- File size: expect roughly 4–7 MB — the web bundle plus the Capacitor runtime.
  A 100 kB APK means the assets were not synced; a 40 MB APK means a debug-like
  build slipped through.
- `aapt2 dump badging` should report `package: name='com.mkjstudyos.app'
  versionCode='1' versionName='1.0.0'` and `sdkVersion:'23'`.

## 4. Test on a device

Fresh-install checklist (also see `docs/VERIFICATION.md`):

1. Uninstall any previous build: `adb uninstall com.mkjstudyos.app`.
2. `adb install app-release.apk`.
3. Launch → welcome screen, choose a class and group → **no sample data**.
4. Add a subject and two chapters, tick one, log a study session.
5. Force-stop and reopen the app; every record must still be there.
6. Turn on airplane mode and repeat step 4 — it must work.
7. Switch theme, switch class and back; records stay.
8. Settings → Export all data → the JSON opens and contains your records.

## 5. Publishing

- Play Console → Create app → upload `app-release.aab`.
- Data safety form: the app stores data **on the device by default**; it collects
  email only if you ship a cloud-enabled build. Declare “no data shared” and “no
  data collected” for the device-only build; adjust if you enable Supabase.
- Content rating: everyone; the app has no ads, no user-generated public content.
- Privacy policy URL: host `docs/PRIVACY.md` (also readable inside the app).

## 6. Future updates

1. Bump `versionCode` (must increase) and `versionName` in
   `android/app/build.gradle` and `version` in `package.json` — a unit test keeps
   the two version names equal.
2. Re-run `npm run verify:release` and the test suite.
3. Build with the **same keystore**. Play will reject an update signed by a
   different key.
4. Add a `docs/RELEASE_NOTES.md` section for the new version.

## 7. What the build environment here could not do

The sandbox that produced this repository has **no JDK** (`java: command not
found`), **no Android SDK**, and no network access to `dl.google.com`,
`repo1.maven.org` or `services.gradle.org` (all return `000`). Consequently:

- `./gradlew assembleRelease` stops immediately with
  `ERROR: JAVA_HOME is not set and no 'java' command could be found`;
- no APK or AAB was produced, so no file path or size is reported;
- nothing was installed on a device or emulator.

Everything up to that line was done: the production bundle builds, the Android
assets are synced (`cap sync` reports the notification plugin), the signing
configuration is in place and tested by inspection, and the release gate
(`npm run verify:release`) confirms a production build starts empty. The exact
commands above reproduce the APK on any machine with JDK 17 + Android SDK 35.
