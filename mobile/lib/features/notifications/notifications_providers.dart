import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/network/providers.dart';
import 'data/notifications_api.dart';
import 'domain/app_notification.dart';

final notificationsApiProvider = Provider<NotificationsApi>((ref) => NotificationsApi(ref.watch(apiClientProvider).dio));

/// The number on the bell. Refreshed by the socket's `notification:new`
/// (see RealtimeOverlay) and whenever the feed is opened or read.
final unreadNotificationsProvider = FutureProvider<int>((ref) async {
  try {
    return await ref.watch(notificationsApiProvider).unreadCount();
  } catch (_) {
    // A missing badge is better than an error icon in the app bar.
    return 0;
  }
});

class NotificationsController extends AsyncNotifier<List<AppNotification>> {
  @override
  Future<List<AppNotification>> build() async {
    final page = await ref.watch(notificationsApiProvider).list();
    return page.items;
  }

  Future<void> refresh() async {
    state = await AsyncValue.guard(build);
    ref.invalidate(unreadNotificationsProvider);
  }

  Future<void> markRead(AppNotification n) async {
    if (n.read) return;
    _replace((list) => [for (final x in list) x.id == n.id ? x.markedRead() : x]);
    await ref.read(notificationsApiProvider).markRead(n.id);
    ref.invalidate(unreadNotificationsProvider);
  }

  Future<void> markAllRead() async {
    _replace((list) => [for (final x in list) x.markedRead()]);
    await ref.read(notificationsApiProvider).markAllRead();
    ref.invalidate(unreadNotificationsProvider);
  }

  /// Swipe-to-delete. Optimistic; if the server refuses, the list is reloaded
  /// so the row comes back rather than silently disagreeing with it.
  Future<void> delete(AppNotification n) async {
    _replace((list) => [for (final x in list) if (x.id != n.id) x]);
    try {
      await ref.read(notificationsApiProvider).delete(n.id);
    } catch (_) {
      await refresh();
      return;
    }
    ref.invalidate(unreadNotificationsProvider);
  }

  Future<void> clearAll() async {
    final before = state.valueOrNull;
    _replace((_) => const []);
    try {
      await ref.read(notificationsApiProvider).clearAll();
    } catch (_) {
      if (before != null) state = AsyncValue.data(before);
      return;
    }
    ref.invalidate(unreadNotificationsProvider);
  }

  void _replace(List<AppNotification> Function(List<AppNotification>) f) {
    final current = state.valueOrNull;
    if (current != null) state = AsyncValue.data(f(current));
  }
}

final notificationsProvider =
    AsyncNotifierProvider<NotificationsController, List<AppNotification>>(NotificationsController.new);
