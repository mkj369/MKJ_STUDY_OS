# Building and installing the Android APK

This is the practical guide for putting MKJ StudyOS on a real phone. It assumes you
already have this repository and a computer with internet access.

**Status of this document:** the steps below were verified up to the point this
environment allows. The web build, the Capacitor sync, the committed native project and
the toolchain checks were all executed here. The Gradle compile was **not** — this machine
has no JDK and no Android SDK, and cannot reach `services.gradle.org` or `dl.google.com`.
See [VERIFICATION.md](VERIFICATION.md) §2.3 for the recorded state. Nothing in this file
claims the APK has been built.

---

## 0. What you need

| Requirement | Why | How to check |
| --- | --- | --- |
| Node.js 20.19+ | builds the web bundle, runs Capacitor | `node -v` |
| JDK 17 or newer | Android Gradle Plugin 8.7 requires it | `java -version` |
| Android SDK: platform 35, build-tools, platform-tools | compiles and packages the APK | Android Studio → SDK Manager |
| ~2 GB free disk and internet (first build only) | Gradle 8.11.1 plus Android dependencies | — |

You can install the SDK either with **Android Studio** (easiest — it includes a JDK and
sets `ANDROID_HOME` for you) or with the **command-line tools**. You do not need Android
Studio after the build; the APK is a normal file you copy to the phone.

---

## 1. Check the toolchain

From the repository root:

```bash
npm ci                 # or: npm install
npm run android:preflight
```

The preflight prints one line per requirement with a `fix:` line for anything missing:

```
  [PASS] Node.js ≥ 20.19
  [FAIL] JDK 17+
         found: java not found on PATH
         fix:   Install JDK 17 ...
  [FAIL] Android SDK
         found: no ANDROID_HOME / ANDROID_SDK_ROOT ...
  [PASS] Gradle wrapper (offline-capable)
  [PASS] Web assets synced into android/
```

Exit code `0` means you are ready. `2` means something is missing. Add `--json` if you
want to pipe the result somewhere.

**If the JDK is the only thing missing:** install Eclipse Temurin 17
(<https://adoptium.net>), then point `JAVA_HOME` at it:

```bash
# macOS / Linux
export JAVA_HOME="$HOME/Library/Java/JavaVirtualMachines/temurin-17.jdk/Contents/Home"  # macOS
export JAVA_HOME=/usr/lib/jvm/temurin-17-jdk-amd64                                        # Linux
# Windows (new terminal after this)
setx JAVA_HOME "C:\Program Files\Eclipse Adoptium\jdk-17"
```

Android Studio's bundled JDK also works (`Settings → Build, Execution, Deployment →
Build Tools → Gradle → Gradle JDK`).

**If the SDK is missing**, either open Android Studio → **SDK Manager** → *SDK Platforms*
→ check **Android 15 (API 35)**, and *SDK Tools* → check **Android SDK Build-Tools** and
**Android SDK Platform-Tools**; or with the command-line tools:

```bash
sdkmanager "platforms;android-35" "build-tools;35.0.0" "platform-tools"
sdkmanager --licenses        # accept the prompts
export ANDROID_HOME="$HOME/Android/Sdk"      # Windows: setx ANDROID_HOME "%LOCALAPPDATA%\Android\Sdk"
```

If you would rather not set an environment variable, create `android/local.properties`:

```properties
sdk.dir=/absolute/path/to/Android/Sdk
```

---

## 2. Decide which backend the APK should use

You have two options. Choose **one** before building, because the choice is compiled into
the JavaScript bundle.

### Option A — local demo mode (recommended for a first install, this is the default)

Do nothing. With no `.env.local`, the app starts in **local demo mode**: everything is
stored in the phone's WebView storage, there is no server, no account and **no key of any
kind inside the APK**. The app shows a "Local demo mode" banner so you always know.

Trade-off: data lives only on that phone and disappears if you clear the app's storage or
uninstall it. Use **Export** in the app to keep a JSON/CSV copy.

### Option B — your own Supabase project (multi-device, accounts, AI coach)

```bash
cp .env.example .env.local
# then edit .env.local:
#   VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
#   VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
npm run build   # or npm run android:sync, which builds first
```

Two rules that matter more than anything else in this file:

1. **`VITE_*` variables are compiled into the APK.** Anyone can extract them from the
   bundle. Only ever put the **anon / publishable** key there. It is safe *only* because
   Row Level Security is enabled on every table (migrations `0001`–`0005`) — readers can
   reach only their own rows.
2. **Never put these in `.env.local` or any `VITE_*` variable:**
   `SUPABASE_SERVICE_ROLE_KEY`, `AI_API_KEY`, or any provider secret. They belong in
   `supabase secrets set …` on the server (see README §8). A service-role key in a mobile
   app is a full database compromise, because the key *is* the permission.

Verify what actually shipped, before you install:

```bash
npm run build
npx vitest run tests/bundle     # scans dist/ for keys, key headers and Deno.env
```

On the server side, the Supabase functions read their secrets from the function
environment; if they are not set the AI screen says so explicitly and the deterministic
report still works.

---

## 3. Build the APK

```bash
npm run android:sync     # vite build → copy dist/ into android/ → update plugins
npm run android:build    # cd android && ./gradlew assembleDebug
```

`android:sync` takes a few seconds and was verified here (40 hashed asset files copied,
plugin list `@capacitor/local-notifications@7.0.7`). `android:build` is the step that
needs the JDK and SDK.

The first Gradle run downloads the Gradle 8.11.1 distribution and the Android dependencies
(several hundred MB). If your network blocks those hosts it fails with a download error —
that is a network problem, not a project problem; use a different network, or configure
your proxy in `~/.gradle/gradle.properties`:

```properties
systemProp.https.proxyHost=proxy.example.com
systemProp.https.proxyPort=8080
```

Windows: use `cd android; .\gradlew.bat assembleDebug` (the `npm run android:build`
script uses the Unix wrapper, so run it from Git Bash/WSL or use the `.bat` directly).

Alternative without npm: open the `android/` folder in Android Studio and press **Run ▶**
with a device attached — it builds the same debug APK.

---

## 4. Confirm the APK exists

The output path is fixed:

```
android/app/build/outputs/apk/debug/app-debug.apk
```

Check it yourself — do not trust a summary:

```bash
ls -lh android/app/build/outputs/apk/debug/app-debug.apk
unzip -l android/app/build/outputs/apk/debug/app-debug.apk | head -20      # should list classes.dex, assets/public/...
```

`app/build.gradle` defines no ABI split and the project adds no native libraries, so this is
one universal APK that installs on both 64-bit and 32-bit phones. Its size is roughly the
web bundle plus the Capacitor runtime; `ls -lh` above is the authoritative number — record
it from your own build rather than trusting any figure quoted elsewhere.

Optional signature check (path inside your SDK):

```bash
$ANDROID_HOME/build-tools/35.0.0/apksigner verify --print-certs \
  android/app/build/outputs/apk/debug/app-debug.apk
```

A debug APK is signed with the debug keystore generated on your machine
(`~/.android/debug.keystore`). That is fine for personal installation. It is **not** a
Play Store upload — for that you need your own keystore and a signed AAB, and you must
never commit the keystore.

---

## 5. Install it on the phone

### With a USB cable (fastest)

1. On the phone: **Settings → About phone → tap Build number 7×** to unlock Developer
   options, then **Developer options → USB debugging: on**.
2. Connect the cable, choose "File transfer / Android Auto" mode, and accept the
   "Allow USB debugging?" prompt on the phone.
3. Check the computer can see it, then install:

```bash
adb devices                     # your phone should be listed as "device", not "unauthorized"
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

`-r` reinstalls over an existing copy. If you see
`INSTALL_FAILED_UPDATE_INCOMPATIBLE`, the installed app was signed with a different key:
`adb uninstall com.mkjstudyos.app` first (this erases its local data).

### Without a cable

Copy `app-debug.apk` to the phone (USB storage, Google Drive, email to yourself), tap it in
the Files app, and allow "Install unknown apps" for that file manager when prompted. Play
Protect may warn about an app from outside the store; that is expected for a self-signed
build you produced.

The app id is `com.mkjstudyos.app` and it needs **Android 6.0 (API 23) or newer**.

---

## 6. First run checklist on the device

- [ ] The launcher shows **MKJ StudyOS** with the MKJ icon; it opens to the auth screen.
- [ ] **Start local workspace** (Option A) or sign in with your Supabase account (Option B)
      and land on the dashboard.
- [ ] The banner states the mode honestly ("Local demo mode" vs cloud).
- [ ] **Syllabus Tracker** loads; demo rows are labelled **Demo**.
- [ ] Log a study session, kill the app, reopen: the row is still there (persistence).
- [ ] **Export** produces a JSON download you can open in the Files app.
- [ ] **Reminders**: on Android 13+ grant the notification permission when asked, schedule
      one reminder, and confirm it appears. Timing may be a few minutes late because the
      app does not request exact-alarm access — that limitation is documented.
- [ ] Press Back from a sub-screen: it returns inside the app instead of closing it.

If something fails on device that passes in the browser, capture it with:

```bash
adb logcat -s Capacitor:V CapacitorConsole:V chromium:V | tee studyos-logcat.txt
```

---

## 7. Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `JAVA_HOME is not set` / `Unsupported class file major version` | wrong or missing JDK | install JDK 17+, set `JAVA_HOME`, reopen the terminal |
| `SDK location not found` | no `ANDROID_HOME`, no `local.properties` | one of the two, see §1 |
| `Failed to install the following Android SDK packages … platforms;android-35` | SDK platform missing | `sdkmanager "platforms;android-35"` then accept licenses |
| build hangs downloading `gradle-8.11.1-all.zip` | `services.gradle.org` blocked | rest of the internet? use a proxy, or build from a network that allows it |
| `Could not resolve com.android.tools.build:gradle:8.7.2` | Maven hosts blocked | same as above; check proxy settings |
| app shows a blank white screen | `android/app/src/main/assets/public` empty | run `npm run android:sync` **before** building |
| "App not installed" when tapping the APK | older version with a different signature | uninstall the old copy, install again |
| notifications never appear | permission denied, or battery optimisation | Settings → Apps → MKJ StudyOS → Notifications; disable battery optimisation |

---

## 8. What this environment could and could not do

| Step | Result here |
| --- | --- |
| `npm run android:sync` (web build + asset copy + plugin sync) | **Executed** — 40 asset files, plugin `@capacitor/local-notifications@7.0.7` |
| Capacitor project, manifest, permissions, status-bar icon | **Committed and config-tested** (`tests/android/config.test.ts`, 8 assertions) |
| `npm run android:preflight` | **Executed** — reports Node ✓ (v22.22.3), wrapper ✓, synced assets ✓, **JDK ✗** (`java` not on PATH), **SDK ✗** (no `ANDROID_HOME`, no default SDK folder); exit code 2 |
| `npm run android:build` (`gradlew assembleDebug`) | **Not executed** — no JDK, no Android SDK, and `services.gradle.org`, `dl.google.com`, `maven.google.com`, `repo.maven.apache.org`, `plugins.gradle.org`, `api.adoptium.net` all unreachable from this sandbox |
| APK existence, size, signature | **Not verified** — no APK was produced |
| Install on a phone | **Not performed** — no device |

So the honest state is: **source and native project are complete and the pre-build stages
pass; the compiled APK is unverified.** Running §3–§4 on a normal machine with JDK 17 and
the Android SDK is all that remains.
