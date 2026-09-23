import 'package:dio/dio.dart';

import '../../../core/errors/app_failure.dart';
import '../domain/app_notification.dart';

class NotificationsApi {
  NotificationsApi(this._dio);

  final Dio _dio;

  Future<NotificationPage> list({int limit = 30, int offset = 0}) async {
    try {
      final res = await _dio.get<Map<String, dynamic>>('/api/notifications', queryParameters: {'limit': limit, 'offset': offset});
      final data = res.data?['data'] as Map<String, dynamic>? ?? const {};
      return NotificationPage(
        items: ((data['items'] as List?) ?? const []).map((e) => AppNotification.fromJson(e as Map<String, dynamic>)).toList(),
        total: (data['total'] as num?)?.toInt() ?? 0,
        unread: (data['unread'] as num?)?.toInt() ?? 0,
      );
    } on DioException catch (e) {
      throw AppFailure.fromDioException(e);
    }
  }

  Future<int> unreadCount() async {
    try {
      final res = await _dio.get<Map<String, dynamic>>('/api/notifications/unread-count');
      return ((res.data?['data'] as Map?)?['unread'] as num?)?.toInt() ?? 0;
    } on DioException catch (e) {
      throw AppFailure.fromDioException(e);
    }
  }

  Future<void> markRead(String id) async {
    try {
      await _dio.patch<void>('/api/notifications/$id/read');
    } on DioException catch (e) {
      // Already read elsewhere (the website) answers 404; nothing to undo.
      if (e.response?.statusCode == 404) return;
      throw AppFailure.fromDioException(e);
    }
  }

  Future<void> markAllRead() async {
    try {
      await _dio.patch<void>('/api/notifications/read-all');
    } on DioException catch (e) {
      throw AppFailure.fromDioException(e);
    }
  }
}
