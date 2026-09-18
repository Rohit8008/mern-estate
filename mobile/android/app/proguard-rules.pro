# Starter rules for when minifyEnabled/shrinkResources are switched on (see
# the comment in build.gradle — left off by default since this environment
# can't build/run a release APK to verify them). Every plugin this app uses
# (dio, path_provider, url_launcher, share_plus, connectivity_plus,
# flutter_map, cached_network_image, socket_io_client) ships its own
# consumer-rules.pro inside its AAR, which Gradle applies automatically —
# these are just the handful of app-level rules Flutter itself recommends.

# Flutter's own embedding — safe to keep unconditionally.
-keep class io.flutter.app.** { *; }
-keep class io.flutter.plugin.**  { *; }
-keep class io.flutter.util.**  { *; }
-keep class io.flutter.view.**  { *; }
-keep class io.flutter.**  { *; }
-keep class io.flutter.plugins.**  { *; }

# Gson-style reflection (some transitive deps use it for JSON models) —
# keeps generic signatures so deserialization doesn't silently break.
-keepattributes Signature
-keepattributes *Annotation*
