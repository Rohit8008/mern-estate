import 'package:dio/dio.dart';

import '../../../core/errors/app_failure.dart';
import '../domain/notification_preferences.dart';

class SettingsApi {
  SettingsApi(this._dio);

  final Dio _dio;

  Future<NotificationPreferences> preferences() async {
    try {
      final res = await _dio.get<Map<String, dynamic>>('/api/notifications/preferences');
      final body = res.data!;
      final data = body['data'] is Map<String, dynamic> ? body['data'] as Map<String, dynamic> : body;
      return NotificationPreferences.fromJson(data);
    } on DioException catch (e) {
      throw AppFailure.fromDioException(e);
    }
  }

  /// PATCH, not PUT — the server merges, and it rejects a body with nothing
  /// recognisable in it rather than silently doing nothing.
  Future<void> save(NotificationPreferences prefs) async {
    try {
      await _dio.patch<Map<String, dynamic>>(
        '/api/notifications/preferences',
        data: {
          'notifications': prefs.notificationsPayload(),
          'privacy': prefs.privacy.toJson(),
        },
      );
    } on DioException catch (e) {
      throw AppFailure.fromDioException(e);
    }
  }
}
