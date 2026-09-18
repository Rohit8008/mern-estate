import 'package:dio/dio.dart';

import '../../../core/errors/app_failure.dart';
import '../domain/chat_message.dart';
import '../domain/chat_user.dart';

/// Bare array/object responses — message.controller.js has no
/// {success,data} envelope. Real-time delivery (Socket.IO message:new etc.)
/// is deferred — see mobile_app_progress memory — this is REST-only,
/// refreshed via pull-to-refresh.
class MessagesApi {
  MessagesApi(this._dio);

  final Dio _dio;

  Future<List<Conversation>> conversations() async {
    try {
      final res = await _dio.get<List<dynamic>>('/api/message/conversations');
      return (res.data ?? const []).map((e) => Conversation.fromJson(e as Map<String, dynamic>)).toList();
    } on DioException catch (e) {
      throw AppFailure.fromDioException(e);
    }
  }

  Future<List<ChatMessage>> thread(String otherId) async {
    try {
      final res = await _dio.get<List<dynamic>>('/api/message/thread/$otherId');
      return (res.data ?? const []).map((e) => ChatMessage.fromJson(e as Map<String, dynamic>)).toList();
    } on DioException catch (e) {
      throw AppFailure.fromDioException(e);
    }
  }

  Future<void> send({required String receiverId, required String content}) async {
    try {
      await _dio.post<void>('/api/message/send', data: {'receiverId': receiverId, 'content': content});
    } on DioException catch (e) {
      throw AppFailure.fromDioException(e);
    }
  }

  Future<void> markRead(String otherId) async {
    try {
      await _dio.post<void>('/api/message/read', data: {'otherId': otherId});
    } on DioException catch (e) {
      throw AppFailure.fromDioException(e);
    }
  }

  Future<List<ChatUser>> searchUsers(String q) async {
    try {
      final res = await _dio.get<List<dynamic>>('/api/user/search', queryParameters: {'q': q});
      return (res.data ?? const []).map((e) => ChatUser.fromJson(e as Map<String, dynamic>)).toList();
    } on DioException catch (e) {
      throw AppFailure.fromDioException(e);
    }
  }
}
