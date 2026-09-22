import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme/app_colors.dart';
import '../../core/theme/app_spacing.dart';
import '../../features/auth/auth_providers.dart';
import '../../features/admin/presentation/admin_screen.dart';
import '../../features/analytics/presentation/analytics_screen.dart';
import '../../features/buyers/presentation/buyers_list_screen.dart';
import '../../features/messages/presentation/messages_list_screen.dart';
import '../../features/owners/presentation/owners_list_screen.dart';
import '../../features/permissions/permissions_providers.dart';
import '../../features/profile/presentation/profile_screen.dart';
import '../../features/reports/presentation/reports_screen.dart';
import '../../features/settings/presentation/settings_screen.dart';
import '../../features/tasks/presentation/tasks_list_screen.dart';
import '../../features/transactions/presentation/transactions_list_screen.dart';
import '../design_gallery_screen.dart';

class _MoreItem {
  const _MoreItem({required this.label, required this.icon, this.requires, required this.screenBuilder});
  final String label;
  final IconData icon;
  final String? requires;
  final WidgetBuilder screenBuilder;
}

/// Permission-pruned overflow list — same `can(item.requires)` filtering
/// as CrmShell.jsx's sidebar, just rendered as a list instead of nav links.
/// Tasks has no `requires`, matching the web sidebar (no permission gate).
final _items = [
  _MoreItem(label: 'Analytics', icon: Icons.bar_chart_rounded, requires: 'viewAnalytics', screenBuilder: (_) => const AnalyticsScreen()),
  _MoreItem(label: 'Property Owners', icon: Icons.groups_2_outlined, requires: 'viewOwners', screenBuilder: (_) => const OwnersListScreen()),
  _MoreItem(label: 'Buyer Requirements', icon: Icons.fact_check_outlined, requires: 'viewBuyerRequirements', screenBuilder: (_) => const BuyersListScreen()),
  _MoreItem(label: 'Tasks', icon: Icons.checklist_rounded, screenBuilder: (_) => const TasksListScreen()),
  _MoreItem(label: 'Transactions', icon: Icons.payments_outlined, requires: 'viewAnalytics', screenBuilder: (_) => const TransactionsListScreen()),
  _MoreItem(label: 'Client Reports', icon: Icons.description_outlined, requires: 'exportData', screenBuilder: (_) => const ReportsScreen()),
  _MoreItem(label: 'Messages', icon: Icons.chat_bubble_outline_rounded, screenBuilder: (_) => const MessagesListScreen()),
  _MoreItem(label: 'Settings', icon: Icons.settings_outlined, screenBuilder: (_) => const SettingsScreen()),
];

class MoreScreen extends ConsumerWidget {
  const MoreScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authControllerProvider).user;
    final visibleItems = _items.where((item) => ref.watch(canProvider(item.requires))).toList();

    return Scaffold(
      appBar: AppBar(title: const Text('More')),
      body: ListView(
        children: [
          for (final item in visibleItems)
            ListTile(
              leading: Icon(item.icon, color: AppColors.slate600),
              title: Text(item.label, style: const TextStyle(fontWeight: FontWeight.w500)),
              trailing: const Icon(Icons.chevron_right_rounded, color: AppColors.slate300),
              onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: item.screenBuilder)),
            ),
          if (user?.isAdmin ?? false)
            ListTile(
              leading: const Icon(Icons.shield_outlined, color: AppColors.slate600),
              title: const Text('Admin Panel', style: TextStyle(fontWeight: FontWeight.w500)),
              trailing: const Icon(Icons.chevron_right_rounded, color: AppColors.slate300),
              onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const AdminScreen())),
            ),
          const Divider(height: 1),
          const SizedBox(height: AppSpacing.sm),
          ListTile(
            leading: const Icon(Icons.person_outline_rounded, color: AppColors.slate600),
            title: const Text('Profile', style: TextStyle(fontWeight: FontWeight.w500)),
            subtitle: user != null ? Text(user.email) : null,
            trailing: const Icon(Icons.chevron_right_rounded, color: AppColors.slate300),
            onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const ProfileScreen())),
          ),
          // Debug only: it is a component reference, not something a user of
          // the product has any reason to open.
          if (kDebugMode)
            ListTile(
              leading: const Icon(Icons.palette_outlined, color: AppColors.slate600),
              title: const Text('Design system', style: TextStyle(fontWeight: FontWeight.w500)),
              subtitle: const Text('Component reference, not a product screen'),
              trailing: const Icon(Icons.chevron_right_rounded, color: AppColors.slate300),
              onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const DesignGalleryScreen())),
            ),
          const SizedBox(height: AppSpacing.sm),
          ListTile(
            leading: const Icon(Icons.logout_rounded, color: AppColors.rose600),
            title: const Text('Sign out', style: TextStyle(fontWeight: FontWeight.w600, color: AppColors.rose600)),
            onTap: () => ref.read(authControllerProvider.notifier).signOut(),
          ),
          const SizedBox(height: AppSpacing.xxl),
        ],
      ),
    );
  }
}
