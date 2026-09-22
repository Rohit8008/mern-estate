import 'package:flutter/material.dart';

import '../../core/theme/app_colors.dart';
import '../../core/theme/app_spacing.dart';
import '../../features/leads/domain/lead.dart';
import '../../features/leads/presentation/add_follow_up_screen.dart';
import '../../features/leads/presentation/lead_form_screen.dart';
import '../../features/leads/presentation/lead_picker_screen.dart';
import '../../features/listing_form/presentation/listing_form_screen.dart';
import '../../features/tasks/presentation/task_form_screen.dart';

class _QuickAction {
  const _QuickAction(this.label, this.icon, this.accent, this.open);
  final String label;
  final IconData icon;
  final Color accent;

  /// Takes the navigator's context rather than a builder, because the
  /// follow-up actions need two pushes and a result in between.
  final Future<void> Function(BuildContext context) open;
}

Future<void> _push(BuildContext context, WidgetBuilder builder) =>
    Navigator.of(context).push(MaterialPageRoute(builder: builder));

/// Pick a lead, then schedule against it. Cancelling the picker cancels the
/// whole action — no half-finished form against nobody.
Future<void> _followUpFlow(
  BuildContext context, {
  required String type,
  required String title,
}) async {
  final lead = await Navigator.of(context).push<Lead>(
    MaterialPageRoute(builder: (_) => LeadPickerScreen(title: title)),
  );
  if (lead == null || !context.mounted) return;
  await _push(
    context,
    (_) => AddFollowUpScreen(
      leadId: lead.id,
      leadName: lead.name,
      initialType: type,
      title: title,
    ),
  );
}

final _actions = [
  _QuickAction('Add Lead', Icons.person_add_alt_1_rounded, AppColors.indigo600,
      (c) => _push(c, (_) => const LeadFormScreen())),
  _QuickAction('Add Property', Icons.apartment_rounded, AppColors.purple600,
      (c) => _push(c, (_) => const ListingFormScreen())),
  _QuickAction('Add Task', Icons.playlist_add_check_rounded, AppColors.blue600,
      (c) => _push(c, (_) => const TaskFormScreen())),
  _QuickAction('Log Follow-up', Icons.phone_in_talk_rounded, AppColors.emerald600,
      (c) => _followUpFlow(c, type: 'call', title: 'Log Follow-up')),
  _QuickAction('Schedule Visit', Icons.location_on_outlined, AppColors.rose600,
      (c) => _followUpFlow(c, type: 'site_visit', title: 'Schedule Visit')),
];

/// Central FAB quick-action sheet — the actions an agent standing in front of
/// a client reaches for most. The three "Add" actions open a form directly;
/// the two follow-up actions pick a lead first, since the sheet can be opened
/// from anywhere and has no lead in hand.
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
                    // Close the sheet first, then run the action against the
                    // navigator that outlives it.
                    final navigatorContext = Navigator.of(context).context;
                    Navigator.of(context).pop();
                    action.open(navigatorContext);
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
