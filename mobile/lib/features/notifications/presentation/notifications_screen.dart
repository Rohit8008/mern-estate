import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/utils/format.dart';
import '../../../shared/widgets/widgets.dart';
import '../../leads/presentation/lead_detail_screen.dart';
import '../../messages/presentation/messages_list_screen.dart';
import '../../properties/presentation/property_detail_screen.dart';
import '../../settings/presentation/settings_screen.dart';
import '../../tasks/presentation/tasks_list_screen.dart';
import '../domain/app_notification.dart';
import '../notifications_providers.dart';

/// The in-app notification feed — the same rows as the website's bell.
/// Real-time events used to appear as snackbars over whatever screen was
/// open ("A listing was removed" covering the dashboard); they now land
/// here, with a badge on the bell, and nothing interrupts.
class NotificationsScreen extends ConsumerWidget {
  const NotificationsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(notificationsProvider);
    final hasUnread = async.valueOrNull?.any((n) => !n.read) ?? false;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Notifications'),
        actions: [
          if (hasUnread)
            TextButton(
              onPressed: () => ref.read(notificationsProvider.notifier).markAllRead(),
              child: const Text('Mark all read'),
            ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () => ref.read(notificationsProvider.notifier).refresh(),
        child: async.when(
          loading: () => const AppPageLoader(),
          error: (e, _) => ListView(children: [
            SizedBox(
              height: 420,
              child: AppErrorState(
                title: 'Unable to load notifications',
                message: 'Check your internet connection and try again.',
                onRetry: () => ref.read(notificationsProvider.notifier).refresh(),
              ),
            ),
          ]),
          data: (items) => items.isEmpty
              ? ListView(children: const [
                  SizedBox(
                    height: 420,
                    child: AppEmptyState(
                      icon: Icons.notifications_none_rounded,
                      title: "You're all caught up",
                      message: 'New messages, assignments and reminders will show up here.',
                    ),
                  ),
                ])
              : ListView.separated(
                  padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
                  itemCount: items.length,
                  separatorBuilder: (_, __) => const Divider(height: 1, indent: 72),
                  itemBuilder: (context, i) => _NotificationTile(
                    notification: items[i],
                    onTap: () {
                      ref.read(notificationsProvider.notifier).markRead(items[i]);
                      openNotificationTarget(context, items[i]);
                    },
                  ),
                ),
        ),
      ),
    );
  }
}

/// Opens the screen a notification's web link points at. Unknown links just
/// mark the row read and stay here.
void openNotificationTarget(BuildContext context, AppNotification n) {
  final segments = Uri.parse(n.path.isEmpty ? '/' : n.path).pathSegments;
  if (segments.isEmpty) return;
  void push(Widget screen) => Navigator.of(context).push(MaterialPageRoute(builder: (_) => screen));
  final id = segments.length > 1 ? segments[1] : null;
  switch (segments.first) {
    case 'messages':
      push(const MessagesListScreen());
    case 'listing':
    case 'properties':
      id != null ? push(PropertyDetailScreen(listingId: id)) : context.go('/properties');
    case 'clients':
    case 'leads':
      id != null ? push(LeadDetailScreen(leadId: id)) : context.go('/leads');
    case 'pipeline':
      context.go('/leads');
    case 'tasks':
    case 'calendar':
      push(const TasksListScreen());
    case 'settings':
      push(const SettingsScreen());
  }
}

class _NotificationTile extends StatelessWidget {
  const _NotificationTile({required this.notification, required this.onTap});

  final AppNotification notification;
  final VoidCallback onTap;

  static (IconData, AppAccent) _look(String type) {
    if (type.startsWith('message')) return (Icons.chat_bubble_outline_rounded, AppAccent.blue);
    if (type.startsWith('listing')) return (Icons.apartment_rounded, AppAccent.purple);
    if (type.startsWith('task') || type.contains('reminder') || type.contains('follow')) {
      return (Icons.event_note_outlined, AppAccent.amber);
    }
    if (type.startsWith('client') || type.startsWith('lead')) return (Icons.person_outline_rounded, AppAccent.emerald);
    if (type.startsWith('deal')) return (Icons.trending_up_rounded, AppAccent.indigo);
    return (Icons.notifications_none_rounded, AppAccent.slate);
  }

  @override
  Widget build(BuildContext context) {
    final n = notification;
    final (icon, accent) = _look(n.type);
    final swatch = AppAccentSwatch.of(accent);
    final dark = Theme.of(context).brightness == Brightness.dark;
    final unreadBg = dark ? AppColors.indigo600.withOpacity(0.10) : AppColors.indigo600.withOpacity(0.05);

    return Material(
      color: n.read ? Colors.transparent : unreadBg,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg, vertical: AppSpacing.md),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: swatch.iconBg,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: swatch.iconRing),
                ),
                child: Icon(icon, size: 20, color: swatch.text),
              ),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            n.title,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(fontSize: 14, fontWeight: n.read ? FontWeight.w500 : FontWeight.w700),
                          ),
                        ),
                        const SizedBox(width: AppSpacing.sm),
                        Text(Fmt.ago(n.createdAt), style: const TextStyle(fontSize: 11.5, color: AppColors.slate500)),
                      ],
                    ),
                    if (n.body.isNotEmpty) ...[
                      const SizedBox(height: 3),
                      Text(n.body, maxLines: 3, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 13, color: AppColors.slate500)),
                    ],
                  ],
                ),
              ),
              if (!n.read) ...[
                const SizedBox(width: AppSpacing.sm),
                Container(
                  margin: const EdgeInsets.only(top: 6),
                  width: 8,
                  height: 8,
                  decoration: const BoxDecoration(color: AppColors.indigo600, shape: BoxShape.circle),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// The app-bar bell with an unread count.
class NotificationBell extends ConsumerWidget {
  const NotificationBell({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final unread = ref.watch(unreadNotificationsProvider).valueOrNull ?? 0;
    return IconButton(
      tooltip: unread > 0 ? 'Notifications, $unread unread' : 'Notifications',
      onPressed: () {
        ref.invalidate(notificationsProvider);
        Navigator.of(context).push(MaterialPageRoute(builder: (_) => const NotificationsScreen()));
      },
      icon: Badge(
        isLabelVisible: unread > 0,
        label: Text(unread > 99 ? '99+' : '$unread'),
        backgroundColor: AppColors.rose600,
        child: const Icon(Icons.notifications_none_rounded),
      ),
    );
  }
}
