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
