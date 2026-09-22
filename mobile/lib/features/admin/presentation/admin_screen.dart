import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/errors/app_failure.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../shared/widgets/widgets.dart';
import '../../auth/auth_providers.dart';
import '../admin_providers.dart';
import '../domain/team_member.dart';

/// Workspace administration: who is on the team, and what the roles grant.
///
/// Creating people and editing role permissions stay on the web app — those
/// are consequential, multi-field operations. This screen covers the thing an
/// admin actually needs from a phone: seeing the team, and switching someone
/// off quickly when they leave.
class AdminScreen extends ConsumerWidget {
  const AdminScreen({super.key});

  Future<void> _toggle(BuildContext context, WidgetRef ref, TeamMember member) async {
    final next = member.isActive ? 'inactive' : 'active';

    if (member.isActive) {
      final confirmed = await showConfirmDialog(
        context,
        title: 'Deactivate ${member.displayName}?',
        message: 'They will be signed out and cannot sign in again until reactivated.',
        confirmLabel: 'Deactivate',
      );
      if (!confirmed) return;
    }

    try {
      await ref.read(adminControllerProvider.notifier).setStatus(member, next);
    } on AppFailure catch (f) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(f.message), backgroundColor: AppColors.rose600),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final overviewAsync = ref.watch(adminControllerProvider);
    final me = ref.watch(authControllerProvider).user;

    return Scaffold(
      appBar: AppBar(title: const Text('Admin Panel')),
      body: overviewAsync.when(
        loading: () => const AppPageLoader(),
        error: (error, _) => AppErrorState(
          title: 'Could not load the workspace',
          message: error is AppFailure ? error.message : error.toString(),
          onRetry: () => ref.read(adminControllerProvider.notifier).refresh(),
        ),
        data: (overview) => RefreshIndicator(
          onRefresh: () => ref.read(adminControllerProvider.notifier).refresh(),
          child: ListView(
            padding: const EdgeInsets.all(AppSpacing.md),
            children: [
              _SectionLabel('Team · ${overview.members.length}'),
              const SizedBox(height: AppSpacing.sm),
              AppCard(
                padding: EdgeInsets.zero,
                child: Column(
                  children: [
                    for (var i = 0; i < overview.members.length; i++) ...[
                      if (i > 0) const Divider(height: 1),
                      _MemberRow(
                        member: overview.members[i],
                        isSelf: overview.members[i].id == me?.id,
                        onToggle: () => _toggle(context, ref, overview.members[i]),
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(height: AppSpacing.xl),
              _SectionLabel('Roles · ${overview.roles.length}'),
              const SizedBox(height: AppSpacing.sm),
              if (overview.roles.isEmpty)
                const AppCard(
                  child: Padding(
                    padding: EdgeInsets.symmetric(vertical: AppSpacing.md),
                    child: Center(
                      child: Text('No custom roles defined.',
                          style: TextStyle(color: AppColors.slate400, fontSize: 13)),
                    ),
                  ),
                )
              else
                AppCard(
                  padding: EdgeInsets.zero,
                  child: Column(
                    children: [
                      for (var i = 0; i < overview.roles.length; i++) ...[
                        if (i > 0) const Divider(height: 1),
                        ListTile(
                          title: Row(
                            children: [
                              Flexible(
                                child: Text(overview.roles[i].name,
                                    style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
                              ),
                              if (overview.roles[i].isSystem) ...[
                                const SizedBox(width: AppSpacing.xs),
                                const AppBadge(label: 'System', variant: AppBadgeVariant.slate),
                              ],
                            ],
                          ),
                          subtitle: Text(
                            overview.roles[i].description.isNotEmpty
                                ? overview.roles[i].description
                                : '${overview.roles[i].permissionCount} permissions',
                            style: const TextStyle(color: AppColors.slate400, fontSize: 12),
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
              const SizedBox(height: AppSpacing.md),
              const Text(
                'Adding people and editing role permissions is done on the web app.',
                style: TextStyle(color: AppColors.slate400, fontSize: 12),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: AppSpacing.xxl),
            ],
          ),
        ),
      ),
    );
  }
}

class _SectionLabel extends StatelessWidget {
  const _SectionLabel(this.text);
  final String text;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(left: AppSpacing.xs),
        child: Text(
          text.toUpperCase(),
          style: const TextStyle(
            fontSize: 11,
            fontWeight: FontWeight.w700,
            letterSpacing: 0.6,
            color: AppColors.slate400,
          ),
        ),
      );
}

class _MemberRow extends StatelessWidget {
  const _MemberRow({required this.member, required this.isSelf, required this.onToggle});

  final TeamMember member;
  final bool isSelf;
  final VoidCallback onToggle;

  @override
  Widget build(BuildContext context) {
    // The server refuses both of these (403). Showing a live control that can
    // only fail is worse than showing why it is unavailable.
    final lockedReason = isSelf
        ? 'This is you'
        : member.isAdmin
            ? 'Admin accounts cannot be deactivated here'
            : null;

    return ListTile(
      leading: CircleAvatar(
        backgroundColor: AppColors.slate100,
        child: Text(
          _initials(member.displayName),
          style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.slate600),
        ),
      ),
      title: Row(
        children: [
          Flexible(
            child: Text(member.displayName,
                style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14),
                overflow: TextOverflow.ellipsis),
          ),
          const SizedBox(width: AppSpacing.xs),
          AppBadge(
            label: _roleLabel(member.role),
            variant: member.isAdmin ? AppBadgeVariant.brand : AppBadgeVariant.slate,
          ),
        ],
      ),
      subtitle: Text(
        lockedReason ?? member.email,
        style: const TextStyle(color: AppColors.slate400, fontSize: 12),
        overflow: TextOverflow.ellipsis,
      ),
      trailing: lockedReason != null
          ? AppBadge(
              label: member.isActive ? 'Active' : 'Inactive',
              variant: member.isActive ? AppBadgeVariant.success : AppBadgeVariant.slate,
            )
          : TextButton(
              onPressed: onToggle,
              child: Text(
                member.isActive ? 'Deactivate' : 'Activate',
                style: TextStyle(
                  color: member.isActive ? AppColors.rose600 : AppColors.emerald600,
                  fontWeight: FontWeight.w600,
                  fontSize: 13,
                ),
              ),
            ),
    );
  }

  static String _initials(String name) {
    final parts = name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
    if (parts.isEmpty) return '?';
    if (parts.length == 1) return parts.first.substring(0, 1).toUpperCase();
    return (parts.first.substring(0, 1) + parts.last.substring(0, 1)).toUpperCase();
  }

  static String _roleLabel(String role) => switch (role) {
        'admin' => 'Admin',
        'employee' => 'Agent',
        'seller' => 'Seller',
        _ => role,
      };
}
