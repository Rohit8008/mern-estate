import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/realtime/socket_provider.dart';
import '../features/auth/application/auth_state.dart';
import '../features/auth/auth_providers.dart';
import '../features/messages/messages_providers.dart';
import '../features/notifications/notifications_providers.dart';
import '../features/owners/owners_providers.dart';
import '../features/properties/properties_providers.dart';
import 'offline_banner.dart';

/// Mounted once at the app root (see main.dart's MaterialApp.router
/// `builder`) — owns the socket connection's lifecycle against auth state
/// and turns its events into provider invalidations, mirroring
/// PushNotificationsListener.jsx. Events no longer pop a snackbar over the
/// open screen; the server writes a notification row for anything a person
/// should see, and the bell's badge picks it up. Also renders the offline banner as an
/// overlay above whatever screen is showing.
class RealtimeOverlay extends ConsumerStatefulWidget {
  const RealtimeOverlay({super.key, required this.child});
  final Widget child;

  @override
  ConsumerState<RealtimeOverlay> createState() => _RealtimeOverlayState();
}

class _RealtimeOverlayState extends ConsumerState<RealtimeOverlay> {
  bool _listenersRegistered = false;

  @override
  Widget build(BuildContext context) {
    ref.listen(authControllerProvider, (previous, next) {
      final wasAuthenticated = previous?.status == AuthStatus.authenticated;
      final isAuthenticated = next.status == AuthStatus.authenticated;

      if (isAuthenticated && !wasAuthenticated) {
        _connect();
      } else if (!isAuthenticated && wasAuthenticated) {
        ref.read(socketServiceProvider).disconnect();
        _listenersRegistered = false;
      }
    });

    return Stack(
      children: [
        widget.child,
        const OfflineBanner(),
      ],
    );
  }

  Future<void> _connect() async {
    final socket = ref.read(socketServiceProvider);
    await socket.connect();
    if (_listenersRegistered) return;
    _listenersRegistered = true;

    socket.on('message:new', (_) {
      ref.invalidate(conversationsProvider);
      // An open chat shows the new message without a pull-to-refresh.
      ref.invalidate(threadProvider);
    });
    socket.on('conversations:update', (_) {
      ref.invalidate(conversationsProvider);
      // Reading a chat settles its bell row on the server.
      ref.invalidate(unreadNotificationsProvider);
    });
    socket.on('listing:update', (_) => ref.invalidate(listingsControllerProvider));
    socket.on('owners:changed', (_) => ref.invalidate(ownersControllerProvider));
    socket.on('notification:new', (_) {
      ref.invalidate(unreadNotificationsProvider);
      ref.invalidate(notificationsProvider);
    });
  }
}
