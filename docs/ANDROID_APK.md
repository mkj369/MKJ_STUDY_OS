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
| JDK 17 (17 or 21 both work) | Android Gradle Plugin 8.7 requires 17+ | `java -version` |
| Android SDK: `platforms;android-35`, `build-tools;35.0.0`, `platform-tools` | compiles and packages the APK | §1.2 |
| ~2 GB free disk and internet (first build only) | Gradle 8.11.1 plus Android dependencies | — |

Two ways to satisfy the toolchain: **Android Studio** (bundles a JDK and the SDK, and is
easiest on macOS/Windows) or the **command-line tools** (smallest footprint, and the path
described below for Linux). You do not need Android Studio after the build — the APK is a
plain file you copy to the phone.

The rest of this section is Linux; §1.4 has the macOS/Windows shortcuts.

---

## 1. Set up the toolchain on Linux

The commands assume Debian/Ubuntu (`apt`). Fedora and Arch equivalents are listed where
they differ. Only the JDK install, the udev rules and the `plugdev` group change need
`sudo`; the SDK itself installs into your home directory.

### 1.1 Install JDK 17

```bash
# Debian / Ubuntu (22.04, 24.04, Debian 12)
sudo apt update && sudo apt install -y openjdk-17-jdk-headless

# Fedora
sudo dnf install -y java-17-openjdk-devel

# Arch
sudo pacman -S --needed jdk17-openjdk
```

Prefer Eclipse Temurin? Download the `.tar.gz` from <https://adoptium.net> and unpack it
to a stable location, e.g.:

```bash
mkdir -p "$HOME/.jdks" && tar -xzf ~/Downloads/OpenJDK17U-jdk_x64_linux_hotspot_*.tar.gz -C "$HOME/.jdks"
export JAVA_HOME="$HOME/.jdks/$(ls "$HOME/.jdks" | grep -m1 'jdk-17')"
```

Confirm the version:

```bash
java -version        # must print 17.x (or 21.x); anything lower will fail the build
```

Now make `JAVA_HOME` explicit. The robust way to find it, whatever install method you used:

```bash
export JAVA_HOME="$(readlink -f "$(command -v java)" | sed 's:/bin/java$::')"
echo "$JAVA_HOME"    # e.g. /usr/lib/jvm/java-17-openjdk-amd64
```

Add it permanently so a new terminal keeps it (log out/in once after editing):

```bash
cat >> ~/.bashrc <<'EOF'
export JAVA_HOME="$(readlink -f "$(command -v java)" | sed 's:/bin/java$::')"
EOF
```

`java -version` and `javac -version` should both report 17. Gradle reads `JAVA_HOME`
first; if it is unset it falls back to `java` on `PATH`, which is why a wrong default JDK
(for example 11 or 24) shows up as `Unsupported class file major version`.

### 1.2 Install the Android SDK (command-line tools)

No Android Studio needed. Download the current command-line tools for Linux from
<https://developer.android.com/studio#command-tools> (the file is
`commandlinetools-linux-<build>_latest.zip`), then lay them out where `sdkmanager`
expects them. The `cmdline-tools/latest/` folder name matters:

```bash
sudo apt install -y unzip          # needed once, to unpack the tools archive
export ANDROID_HOME="$HOME/Android/Sdk"
mkdir -p "$ANDROID_HOME/cmdline-tools"

unzip ~/Downloads/commandlinetools-linux-*_latest.zip -d /tmp/cmdline-tools
mv /tmp/cmdline-tools/cmdline-tools "$ANDROID_HOME/cmdline-tools/latest"

export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"

sdkmanager --version             # proves JDK 17 + the tools layout are correct
yes | sdkmanager --licenses      # accept the SDK licences (required before Gradle builds)
sdkmanager "platforms;android-35" "build-tools;35.0.0" "platform-tools"
```

If you already have Android Studio, either use its SDK (`$HOME/Android/Sdk` by default on
Linux) or point `ANDROID_HOME` at the SDK path shown in *SDK Manager*. You can also skip
the environment variable entirely by creating `android/local.properties`:

```properties
sdk.dir=/home/YOUR_USER/Android/Sdk
```

Persist the variables (this is the step people forget, which then makes the preflight and
Gradle disagree):

```bash
cat >> ~/.bashrc <<'EOF'
export ANDROID_HOME="$HOME/Android/Sdk"
export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"
EOF
source ~/.bashrc
```

**Allow `adb` to see the phone (Linux only).** Without udev rules `adb devices` reports
`no permissions` or shows nothing:

```bash
sudo apt install -y android-sdk-platform-tools-common   # Debian/Ubuntu udev rules
sudo usermod -aG plugdev "$USER"                        # then log out and back in
adb kill-server && adb devices                          # replug the cable first
```

Fedora/Arch: install the distribution's `android-udev` rules package, or copy the vendor
rules from the Android documentation, then repeat the `usermod` and `adb` steps.

### 1.3 Run the preflight

From the repository root:

```bash
npm ci                 # or: npm install
npm run android:preflight
```

It prints one line per requirement with a `fix:` line for anything missing:

```
  [PASS] Node.js ≥ 20.19        found: v22.22.3
  [FAIL] JDK 17+                found: java not found on PATH
         fix:   Install JDK 17 ...
  [FAIL] Android SDK (platform 35)
         found: no ANDROID_HOME / ANDROID_SDK_ROOT and no default SDK folder
         fix:   sdkmanager "platforms;android-35" "build-tools;35.0.0" "platform-tools" ...
  [PASS] Gradle wrapper (offline-capable)
  [PASS] Web assets synced into android/
```

Exit code `0` means you are ready; `2` means something is still missing. `--json` gives the
same data in machine-readable form. The SDK check accepts `ANDROID_HOME` or the legacy
`ANDROID_SDK_ROOT`, and requires the platform-35 folder plus build-tools and platform-tools
to exist.

If the web-assets line fails, run `npm run android:sync` (step §3) before building —
otherwise the app installs but opens a blank white screen.

### 1.4 macOS and Windows shortcuts

- **macOS:** `brew install --cask temurin` (installs the current LTS — 17 and 21 both work),
  or install Android Studio, then
  `export JAVA_HOME=$(/usr/libexec/java_home -v 17)`; SDK via Android Studio or
  `brew install --cask android-commandlinetools`, `export ANDROID_HOME="$HOME/Library/Android/sdk"`.
- **Windows:** install Android Studio (it sets `ANDROID_HOME` and supplies a JDK), or
  Temurin 17 plus `setx JAVA_HOME "C:\Program Files\Eclipse Adoptium\jdk-17"` and
  `setx ANDROID_HOME "%LOCALAPPDATA%\Android\Sdk"`. Open a **new** terminal afterwards.
  Gradle's Unix wrapper is not used there — see §3.

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

On Linux, if the wrapper is not executable (for example after unzipping a download rather
than cloning), run `chmod +x android/gradlew` once.

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
| `adb devices` shows `no permissions` or an empty list (Linux) | no udev rules for the phone's vendor id | §1.2: install the udev rules package, `usermod -aG plugdev`, replug, `adb kill-server` |
| `Failed to install … licenses have not been accepted` | SDK licences pending | run `sdkmanager --licenses` and accept every prompt (see §1.2) |
| `Unsupported class file major version` / `class file has wrong version` | Gradle is running on a JDK other than 17/21 (Gradle 8.11 does not support JDK 24+) | point `JAVA_HOME` at JDK 17 or 21, §1.1 |
| `permission denied: ./gradlew` | executable bit lost | `chmod +x android/gradlew` |

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
