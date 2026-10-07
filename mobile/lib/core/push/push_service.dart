import 'dart:io';

import 'package:dio/dio.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';

import '../logging/app_logger.dart';

/// Push notifications (FCM): lets the server reach a phone whose app is closed.
///
/// Everything here is best-effort. A device without Google services, a denied
/// permission or a network blip must leave the app working exactly as before —
/// the bell and the live socket still deliver while it is open.
class PushService {
  PushService(this._dio);

  final Dio _dio;
  bool _ready = false;
  String? _token;

  /// Call once at startup, before runApp's first frame needs it.
  static Future<bool> initFirebase() async {
    if (!Platform.isAndroid) return false; // iOS needs APNs setup first.
    try {
      await Firebase.initializeApp();
      return true;
    } catch (e) {
      appLog.warn('push: firebase unavailable', fields: {'error': e.toString()});
      return false;
    }
  }

  /// Ask permission (Android 13+), fetch the token and tell the server.
  Future<void> register() async {
    try {
      final messaging = FirebaseMessaging.instance;
      final settings = await messaging.requestPermission();
      if (settings.authorizationStatus == AuthorizationStatus.denied) {
        appLog.info('push: permission denied');
        return;
      }
      _token = await messaging.getToken();
      if (_token == null) return;
      await _send(_token!);
      if (!_ready) {
        _ready = true;
        messaging.onTokenRefresh.listen((t) {
          _token = t;
          _send(t);
        });
      }
    } catch (e) {
      appLog.warn('push: register failed', fields: {'error': e.toString()});
    }
  }

  /// Sign-out: stop this phone receiving the previous user's notifications.
  Future<void> unregister() async {
    final token = _token;
    if (token == null) return;
    try {
      await _dio.delete<void>('/api/notifications/devices', data: {'token': token});
    } catch (_) {
      // The server also drops tokens FCM reports dead; nothing to undo here.
    }
  }

  Future<void> _send(String token) async {
    try {
      await _dio.post<void>('/api/notifications/devices', data: {'token': token, 'platform': 'android'});
    } catch (e) {
      appLog.warn('push: token upload failed', fields: {'error': e.toString()});
    }
  }
}
