import 'package:flutter/foundation.dart';

/// API base URL resolution. The backend is cookie-auth only (see
/// core/network/api_client.dart), so this must point at a reachable host —
/// 'localhost' from inside the Android emulator means the emulator itself,
/// not the host machine, hence the 10.0.2.2 loopback alias.
abstract final class Env {
  static const String _override = String.fromEnvironment('API_BASE_URL');

  static String get apiBaseUrl {
    if (_override.isNotEmpty) return _override;
    if (kIsWeb) return 'http://localhost:3000';
    if (defaultTargetPlatform == TargetPlatform.android) return 'http://10.0.2.2:3000';
    return 'http://localhost:3000';
  }
}
