import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/realtime/socket_provider.dart';
import '../core/utils/root_messenger.dart';
import '../features/auth/application/auth_state.dart';
import '../features/auth/auth_providers.dart';
import '../features/messages/messages_providers.dart';
import '../features/owners/owners_providers.dart';
import '../features/properties/properties_providers.dart';
import 'offline_banner.dart';

/// Mounted once at the app root (see main.dart's MaterialApp.router
/// `builder`) — owns the socket connection's lifecycle against auth state
/// and turns its events into provider invalidations + toasts, mirroring
/// PushNotificationsListener.jsx. Also renders the offline banner as an
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

    socket.on('message:new', (data) {
      ref.invalidate(conversationsProvider);
      final map = data is Map ? data : const {};
      final from = (map['senderName'] ?? map['senderUsername'] ?? 'Someone').toString();
      final preview = (map['content'] ?? '').toString();
      _toast('$from: $preview');
    });

    socket.on('conversations:update', (_) => ref.invalidate(conversationsProvider));

    socket.on('listing:update', (data) {
      ref.invalidate(listingsControllerProvider);
      final map = data is Map ? data : const {};
      _toast(_listingUpdateMessage(map));
    });

    socket.on('owners:changed', (_) => ref.invalidate(ownersControllerProvider));
  }

  String _listingUpdateMessage(Map data) {
    switch (data['action']) {
      case 'bulk_import':
        return '${data['count'] ?? 'Several'} listings imported';
      case 'created':
        return 'A new listing was added';
      case 'deleted':
      case 'soft_deleted':
        return 'A listing was removed';
      case 'restored':
        return 'A listing was restored';
      case 'assigned':
        return 'A listing was assigned to you';
      case 'unassigned':
        return 'A listing was unassigned';
      default:
        return 'Listings were updated';
    }
  }

  void _toast(String message) {
    rootScaffoldMessengerKey.currentState?.showSnackBar(SnackBar(content: Text(message)));
  }
}
