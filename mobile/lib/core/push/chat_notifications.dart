import 'dart:convert';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Chat notifications that behave like a messaging app: one notification per
/// conversation, showing the latest messages from that person, replaced (not
/// duplicated) as more arrive, cleared when the chat is opened, and silent
/// while that chat is already on screen.
///
/// The server sends each message as a data-only push; this builds the
/// notification, both when the app is open and when it is closed (the
/// background handler below runs in its own isolate).
class ChatNotifications {
  ChatNotifications._();

  static const _channelId = 'realvista_chat';
  static const _groupKey = 'realvista_chats';
  static const _summaryId = 1;
  static const _maxLines = 8;

  static final _plugin = FlutterLocalNotificationsPlugin();
  static bool _ready = false;

  /// The chat currently on screen, so its own messages don't pop a banner.
  static String? activeChatId;

  /// Called with the sender when a chat notification is tapped.
  static void Function(String senderId, String senderName)? onOpenChat;

  static Future<void> init() async {
    if (_ready) return;
    await _plugin.initialize(
      const InitializationSettings(android: AndroidInitializationSettings('ic_stat_notify')),
      onDidReceiveNotificationResponse: (r) => _open(r.payload),
    );
    await _plugin
        .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()
        ?.createNotificationChannel(const AndroidNotificationChannel(
          _channelId,
          'Messages',
          description: 'New chat messages',
          importance: Importance.high,
        ));
    _ready = true;
  }

  /// The chat that launched the app from a notification tap, if any.
  static Future<void> handleLaunch() async {
    final details = await _plugin.getNotificationAppLaunchDetails();
    if (details?.didNotificationLaunchApp == true) _open(details?.notificationResponse?.payload);
  }

  static void _open(String? payload) {
    if (payload == null) return;
    try {
      final m = jsonDecode(payload) as Map<String, dynamic>;
      onOpenChat?.call(m['senderId'] as String, (m['senderName'] as String?) ?? '');
    } catch (_) {}
  }

  /// Stable across isolates and launches, unlike String.hashCode.
  static int _idFor(String senderId) {
    var h = 0x811c9dc5;
    for (final c in senderId.codeUnits) {
      h = ((h ^ c) * 0x01000193) & 0x7fffffff;
    }
    return h < 2 ? h + 2 : h; // keep clear of the summary id
  }

  static Future<void> show(Map<String, dynamic> data) async {
    final senderId = data['senderId'] as String?;
    if (senderId == null || senderId.isEmpty) return;
    if (senderId == activeChatId) return;
    await init();

    final name = (data['senderName'] as String?)?.trim().isNotEmpty == true ? data['senderName'] as String : 'New message';
    final text = (data['text'] as String?) ?? '';
    final sentAt = DateTime.fromMillisecondsSinceEpoch(int.tryParse('${data['sentAt']}') ?? DateTime.now().millisecondsSinceEpoch);

    final prefs = await SharedPreferences.getInstance();
    final key = 'chatnotif.$senderId';
    final lines = (prefs.getStringList(key) ?? <String>[])
      ..add(jsonEncode({'t': text, 'ts': sentAt.millisecondsSinceEpoch}));
    while (lines.length > _maxLines) {
      lines.removeAt(0);
    }
    await prefs.setStringList(key, lines);

    final sender = Person(name: name, key: senderId);
    final messages = lines.map((l) {
      final m = jsonDecode(l) as Map<String, dynamic>;
      return Message(m['t'] as String, DateTime.fromMillisecondsSinceEpoch(m['ts'] as int), sender);
    }).toList();

    await _plugin.show(
      _idFor(senderId),
      name,
      lines.length > 1 ? '${lines.length} new messages' : text,
      NotificationDetails(
        android: AndroidNotificationDetails(
          _channelId,
          'Messages',
          importance: Importance.high,
          priority: Priority.high,
          icon: 'ic_stat_notify',
          category: AndroidNotificationCategory.message,
          groupKey: _groupKey,
          styleInformation: MessagingStyleInformation(const Person(name: 'You'), messages: messages),
        ),
      ),
      payload: jsonEncode({'senderId': senderId, 'senderName': name}),
    );

    // Bundles several people's chats under one heading; silent itself, so the
    // sound comes from the conversation that just changed.
    await _plugin.show(
      _summaryId,
      'Real Vista',
      'New messages',
      const NotificationDetails(
        android: AndroidNotificationDetails(
          _channelId,
          'Messages',
          icon: 'ic_stat_notify',
          groupKey: _groupKey,
          setAsGroupSummary: true,
          groupAlertBehavior: GroupAlertBehavior.children,
        ),
      ),
    );
  }

  /// Opening a chat settles its notification, as in any messaging app.
  static Future<void> clear(String senderId) async {
    try {
      await init();
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove('chatnotif.$senderId');
      await _plugin.cancel(_idFor(senderId));
    } catch (_) {}
  }
}

/// Runs in a separate isolate when a push arrives while the app is closed or in
/// the background, which is why it re-initialises Firebase itself.
@pragma('vm:entry-point')
Future<void> firebaseBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp();
  if (message.data['type'] == 'chat') await ChatNotifications.show(message.data);
}
