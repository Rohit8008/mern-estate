# Release / Store Prep

What's already done, and the manual steps that are left — all of them need
either your own accounts/secrets or an Android SDK/Xcode install this
dev machine doesn't have, so none of it could be verified end-to-end here.

## Done

- **App identity**: Android `applicationId` / iOS bundle ID both
  `com.realvista.realvista_crm`; display name "Real Vista" on both platforms.
- **Icon & splash**: regenerated from the existing web brand mark
  (`frontend/public/pwa-512.svg`) via `flutter_launcher_icons` /
  `flutter_native_splash` — source files in `mobile/assets/icon/`. Re-run
  after changing them:
  ```
  flutter pub run flutter_launcher_icons
  flutter pub run flutter_native_splash:create
  ```
- **Android manifest fixes**: added the `INTERNET` permission (the release
  manifest didn't have it at all — only debug/profile builds get it for
  free, for the Dart VM service — so every network call would have silently
  failed in a release build) and package-visibility `<queries>` entries for
  `url_launcher`'s call/email/web actions.
- **Android signing scaffold**: `android/app/build.gradle` reads
  `android/key.properties` if present and falls back to debug signing
  otherwise (so `flutter build apk --release` still works without one).

## The SDK this project builds with

**Flutter 3.24.5.** `pubspec.yaml` asks for Dart `^3.5.3`, which is the 3.24
series, and the Android build is pinned to that era too: Gradle 8.3,
AGP 8.1.0, Kotlin 1.8.22.

Current Flutter (3.47) cannot build it. Its Gradle plugin declares a minimum
Gradle of 8.14, and `--android-skip-build-dependency-validation` does not
rescue it — the build then fails further in, inside AGP's `KgpUtils`, because
8.1.0 does not expose the API the newer plugin calls. Flutter 3.47's own
template is Gradle 9.3.1 / AGP 9.1.0 / Kotlin 2.4.0, so closing this gap is an
Android toolchain migration across all 21 plugin dependencies, not a version
bump. Worth doing before store submission; not worth doing by accident.

Running a newer `flutter` against this project also rewrites files in place —
`android/gradle.properties` (adds `android.builtInKotlin` / `android.newDsl`),
`analysis_options.yaml`, and `pubspec.lock`. Check `git status` after, and
revert those if you did not mean to migrate.

## Sideloaded releases (until the app is on the Play Store)

The app is published as an APK at **https://realvista.duckdns.org/download**.
The page reads `/app/latest.json`, so a new version needs no web deploy:

```
# bump `version:` in pubspec.yaml first
./scripts/publish-apk.sh "What changed in this version"
```

It builds with Flutter 3.24.5 from `~/development/flutter-3.24.5` (override with
`FLUTTER=`), points the app at `https://realvista.duckdns.org`, uploads the APK
and then `latest.json` to `~/sites/realvista-app/` on the server (nginx serves
it at `/app/`), and restores the committed `pubspec.lock`.

**The release keystore is `~/.realvista/realvista-upload.jks`** (password in
`android/key.properties`, with a copy in `~/.realvista/key.properties.backup`).
Back up both somewhere safe. Android only installs an update signed with the
same key as the installed app, so losing it means every user has to uninstall
and reinstall. Use the same key for the Play Store upload key later.

## Testing against a dev backend on your LAN

The app is cookie-auth only, so it needs a reachable backend — not `localhost`,
which on a phone means the phone. Point it at the dev machine's LAN address:

```
flutter build apk --debug --dart-define=API_BASE_URL=http://<lan-ip>:3000
```

Serve the APK from `build/app/outputs/flutter-apk/` over the same network and
install it on the phone; no cable and no adb pairing is involved. For hot
reload instead, pair over Android's wireless debugging and
`flutter run --dart-define=API_BASE_URL=http://<lan-ip>:3000`.

Two things this needs on the backend side: it already binds `0.0.0.0`, and the
app's origin has to be in the CORS allowlist for Socket.IO to connect —
`EXTRA_CORS_ORIGINS` in `backend/.env` is the dev hook for that.

**Cleartext HTTP** is handled: `android/app/src/{debug,profile}/res/xml/
network_security_config.xml` permits it, wired in from each source set's
manifest. Android has refused cleartext by default since targetSdk 28 and this
app compiles against 35, so without it every request fails as a generic socket
error that names nothing about permissions. Release builds do not get the file
and keep the default refusal.

iOS has no equivalent exception, so an iOS device cannot reach a plain-HTTP dev
backend without an ATS entry in `Info.plist` — deliberately not added, since it
would ship. Use an HTTPS tunnel for iOS testing.

## Still required — needs your accounts/secrets

### 1. Point the app at your real backend
`mobile/lib/core/config/env.dart` defaults to `localhost` for local dev.
**A release build must override this** or it'll try to reach `localhost` on
the user's phone:
```
flutter build appbundle --release --dart-define=API_BASE_URL=https://your-api-domain.com
flutter build ipa --release --dart-define=API_BASE_URL=https://your-api-domain.com
```
Also add that production origin to the backend's CORS allowlist if it isn't
already covered by `FRONTEND_URL`/`ADMIN_URL`/`EXTRA_CORS_ORIGINS`.

### 2. Android release keystore
```
keytool -genkey -v -keystore ~/upload-keystore.jks -keyalg RSA -keysize 2048 -validity 10000 -alias upload
```
Copy `android/key.properties.example` to `android/key.properties` (already
gitignored) and fill in the four values from that command. Then:
```
flutter build appbundle --release --dart-define=API_BASE_URL=...
```
produces the `.aab` for Play Console.

### 3. iOS signing
Open `ios/Runner.xcworkspace` in Xcode (not the `.xcodeproj`), select the
Runner target → Signing & Capabilities, and set your Apple Developer Team.
The bundle ID (`com.realvista.realvista_crm`) needs to match an App ID
registered in your Apple Developer account / App Store Connect record.
Then either Archive from Xcode, or:
```
flutter build ipa --release --dart-define=API_BASE_URL=...
```

### 4. Before flipping on R8/ProGuard minification
`android/app/build.gradle` has `minifyEnabled false` deliberately — this
machine has no Android SDK to build and run a release APK, so enabling
minification here would be an unverified guess. `proguard-rules.pro` has
starter rules. If you turn it on, **test a real release build on a device
first** (minification bugs are runtime-only — they don't show up in `flutter
analyze`/`flutter test`).

### 5. Store listing assets
Screenshots, feature graphic, privacy policy URL, etc. — none of that exists
yet and isn't something to generate without your input on copy/positioning.
