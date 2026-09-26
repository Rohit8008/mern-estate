import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/errors/app_failure.dart';
import '../../../core/legal/legal_links.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../shared/widgets/widgets.dart';
import '../domain/notification_preferences.dart';
import '../settings_providers.dart';

/// Notification and privacy preferences, plus links to the published policies.
///
/// Every row is generated from the server's catalogue, so a notification type
/// added on the backend appears here with no change in this file.
class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  Future<void> _apply(BuildContext context, WidgetRef ref, NotificationPreferences next) async {
    try {
      await ref.read(settingsControllerProvider.notifier).applyPreferences(next);
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
    final prefsAsync = ref.watch(settingsControllerProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Settings')),
      body: prefsAsync.when(
        loading: () => const AppPageLoader(),
        error: (error, _) => AppErrorState(
          title: 'Could not load settings',
          message: error is AppFailure ? error.message : error.toString(),
          onRetry: () => ref.read(settingsControllerProvider.notifier).refresh(),
        ),
        data: (prefs) => ListView(
          padding: const EdgeInsets.all(AppSpacing.md),
          children: [
            const _SectionLabel('Notifications'),
            const SizedBox(height: AppSpacing.xs),
            AppCard(
              padding: EdgeInsets.zero,
              child: Column(
                children: [
                  for (var i = 0; i < prefs.types.length; i++) ...[
                    if (i > 0) const Divider(height: 1),
                    _NotificationRow(
                      type: prefs.types[i],
                      onChanged: (updated) {
                        final types = [...prefs.types];
                        types[i] = updated;
                        _apply(context, ref, prefs.copyWith(types: types));
                      },
                    ),
                  ],
                ],
              ),
            ),
            const SizedBox(height: AppSpacing.xl),
            const _SectionLabel('Privacy'),
            const SizedBox(height: AppSpacing.xs),
            AppCard(
              padding: EdgeInsets.zero,
              child: Column(
                children: [
                  _PrivacyRow(
                    title: 'Show my email',
                    subtitle: 'Visible to colleagues in your workspace',
                    value: prefs.privacy.showEmail,
                    onChanged: (v) => _apply(context, ref,
                        prefs.copyWith(privacy: prefs.privacy.copyWith(showEmail: v))),
                  ),
                  const Divider(height: 1),
                  _PrivacyRow(
                    title: 'Show my phone',
                    subtitle: 'Visible to colleagues in your workspace',
                    value: prefs.privacy.showPhone,
                    onChanged: (v) => _apply(context, ref,
                        prefs.copyWith(privacy: prefs.privacy.copyWith(showPhone: v))),
                  ),
                  const Divider(height: 1),
                  _PrivacyRow(
                    title: 'Show when I am online',
                    value: prefs.privacy.showOnlineStatus,
                    onChanged: (v) => _apply(context, ref,
                        prefs.copyWith(privacy: prefs.privacy.copyWith(showOnlineStatus: v))),
                  ),
                  const Divider(height: 1),
                  _PrivacyRow(
                    title: 'Allow direct messages',
                    value: prefs.privacy.allowMessages,
                    onChanged: (v) => _apply(context, ref,
                        prefs.copyWith(privacy: prefs.privacy.copyWith(allowMessages: v))),
                  ),
                ],
              ),
            ),
            const SizedBox(height: AppSpacing.md),
            const Text(
              'Changes save as you make them.',
              style: TextStyle(color: AppColors.slate400, fontSize: 12),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: AppSpacing.xl),
            const _SectionLabel('Legal'),
            const SizedBox(height: AppSpacing.xs),
            AppCard(
              padding: EdgeInsets.zero,
              child: Column(
                children: [
                  for (var i = 0; i < LegalDocument.values.length; i++) ...[
                    if (i > 0) const Divider(height: 1),
                    ListTile(
                      title: Text(LegalDocument.values[i].title,
                          style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500)),
                      trailing: const Icon(Icons.open_in_new_rounded, size: 18, color: AppColors.slate400),
                      contentPadding: const EdgeInsets.symmetric(horizontal: AppSpacing.md),
                      onTap: () => openLegalDocument(context, ref, LegalDocument.values[i]),
                    ),
                  ],
                ],
              ),
            ),
            const SizedBox(height: AppSpacing.xxl),
          ],
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

class _NotificationRow extends StatelessWidget {
  const _NotificationRow({required this.type, required this.onChanged});

  final NotificationType type;
  final ValueChanged<NotificationType> onChanged;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(AppSpacing.md, AppSpacing.sm, AppSpacing.sm, AppSpacing.sm),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(type.label, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
          if (type.description.isNotEmpty) ...[
            const SizedBox(height: 2),
            Text(type.description, style: const TextStyle(color: AppColors.slate400, fontSize: 12)),
          ],
          const SizedBox(height: AppSpacing.xs),
          Row(
            children: [
              _Toggle(
                label: 'In app',
                value: type.inApp,
                onChanged: (v) => onChanged(type.copyWith(inApp: v)),
              ),
              const SizedBox(width: AppSpacing.md),
              _Toggle(
                label: 'Email',
                value: type.email,
                onChanged: (v) => onChanged(type.copyWith(email: v)),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _Toggle extends StatelessWidget {
  const _Toggle({required this.label, required this.value, required this.onChanged});

  final String label;
  final bool value;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) => Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(label, style: const TextStyle(fontSize: 13, color: AppColors.slate600)),
          Switch(value: value, onChanged: onChanged),
        ],
      );
}

class _PrivacyRow extends StatelessWidget {
  const _PrivacyRow({required this.title, this.subtitle, required this.value, required this.onChanged});

  final String title;
  final String? subtitle;
  final bool value;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) => SwitchListTile(
        title: Text(title, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500)),
        subtitle: subtitle == null
            ? null
            : Text(subtitle!, style: const TextStyle(color: AppColors.slate400, fontSize: 12)),
        value: value,
        onChanged: onChanged,
        contentPadding: const EdgeInsets.symmetric(horizontal: AppSpacing.md),
      );
}
