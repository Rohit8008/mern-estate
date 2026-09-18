import 'package:flutter/material.dart';

import '../../core/theme/app_colors.dart';
import '../../core/theme/app_spacing.dart';
import '../../features/leads/presentation/lead_form_screen.dart';
import '../../features/listing_form/presentation/listing_form_screen.dart';
import '../../features/tasks/presentation/task_form_screen.dart';
import '../../shared/widgets/coming_soon_screen.dart';

class _QuickAction {
  const _QuickAction(this.label, this.icon, this.accent, this.screenBuilder);
  final String label;
  final IconData icon;
  final Color accent;
  final WidgetBuilder screenBuilder;
}

final _actions = [
  _QuickAction('Add Lead', Icons.person_add_alt_1_rounded, AppColors.indigo600, (_) => const LeadFormScreen()),
  _QuickAction('Add Property', Icons.apartment_rounded, AppColors.purple600, (_) => const ListingFormScreen()),
  _QuickAction('Add Task', Icons.playlist_add_check_rounded, AppColors.blue600, (_) => const TaskFormScreen()),
  _QuickAction('Log Follow-up', Icons.phone_in_talk_rounded, AppColors.emerald600, (_) => const ComingSoonScreen(title: 'Log Follow-up')),
  _QuickAction('Schedule Visit', Icons.location_on_outlined, AppColors.rose600, (_) => const ComingSoonScreen(title: 'Schedule Visit')),
];

/// Central FAB quick-action sheet — the actions an agent standing in front
/// of a client reaches for most. "Add Lead"/"Add Property"/"Add Task" open
/// real forms; the rest route to ComingSoonScreen until their feature phase
/// lands.
Future<void> showQuickActionSheet(BuildContext context) {
  return showModalBottomSheet<void>(
    context: context,
    backgroundColor: Colors.transparent,
    builder: (context) {
      return SafeArea(
        child: Container(
          margin: const EdgeInsets.all(AppSpacing.md),
          decoration: BoxDecoration(
            color: Theme.of(context).scaffoldBackgroundColor == AppColors.slate950 ? AppColors.slate900 : AppColors.white,
            borderRadius: BorderRadius.circular(20),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const SizedBox(height: AppSpacing.md),
              Container(width: 36, height: 4, decoration: BoxDecoration(color: AppColors.slate300, borderRadius: BorderRadius.circular(2))),
              const SizedBox(height: AppSpacing.lg),
              for (final action in _actions)
                ListTile(
                  leading: Container(
                    width: 40,
                    height: 40,
                    decoration: BoxDecoration(color: action.accent.withOpacity(0.1), borderRadius: BorderRadius.circular(12)),
                    child: Icon(action.icon, color: action.accent, size: 20),
                  ),
                  title: Text(action.label, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14.5)),
                  onTap: () {
                    Navigator.of(context).pop();
                    Navigator.of(context).push(MaterialPageRoute(builder: action.screenBuilder));
                  },
                ),
              const SizedBox(height: AppSpacing.sm),
            ],
          ),
        ),
      );
    },
  );
}
