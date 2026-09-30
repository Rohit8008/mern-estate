import 'package:flutter/foundation.dart';

/// API base URL resolution. The backend is cookie-auth only (see
/// core/network/api_client.dart), so this must point at a reachable host —
/// 'localhost' from inside the Android emulator means the emulator itself,
/// not the host machine, hence the 10.0.2.2 loopback alias.
abstract final class Env {
  /// App version for log lines. Defaults track `version:` in pubspec.yaml
  /// (test/app_logger_test.dart fails if they drift); a CI build can pass
  /// --dart-define=APP_VERSION=… / BUILD_NUMBER=… instead. Read this way to
  /// avoid a plugin dependency just for two strings.
  static const String appVersion = String.fromEnvironment('APP_VERSION', defaultValue: '1.0.4');
  static const String buildNumber = String.fromEnvironment('BUILD_NUMBER', defaultValue: '5');

  static const String _override = String.fromEnvironment('API_BASE_URL');

  static String get apiBaseUrl {
    if (_override.isNotEmpty) return _override;
    if (kIsWeb) return 'http://localhost:3000';
    if (defaultTargetPlatform == TargetPlatform.android) return 'http://10.0.2.2:3000';
    return 'http://localhost:3000';
  }
}
