import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../core/errors/app_failure.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../shared/widgets/widgets.dart';
import '../../leads/domain/follow_up.dart';
import '../../leads/leads_providers.dart';
import '../../leads/presentation/lead_detail_screen.dart';
import '../../tasks/domain/crm_task.dart';
import '../../tasks/presentation/task_form_screen.dart';
import '../../tasks/tasks_providers.dart';
import '../activities_providers.dart';
import '../domain/upcoming_follow_up.dart';

enum _ActivityFilter { all, tasks, followUps, siteVisits }

/// Tasks + Follow-ups merged into one agenda — "Visits" aren't a separate
/// backend concept, they're follow-ups with type='site_visit', so the
/// Site Visits filter just narrows to that type rather than hitting a
/// different endpoint. No month-grid calendar: the desktop's is mostly a
/// container for this same data plus purely-local (no backend, no sync)
/// custom events, which isn't worth porting — an agenda list surfaces
/// "what do I do next" faster on a small screen anyway.
class ActivitiesTab extends ConsumerStatefulWidget {
  const ActivitiesTab({super.key});

  @override
  ConsumerState<ActivitiesTab> createState() => _ActivitiesTabState();
}

class _ActivitiesTabState extends ConsumerState<ActivitiesTab> {
  _ActivityFilter _filter = _ActivityFilter.all;

  @override
  Widget build(BuildContext context) {
    final tasksAsync = ref.watch(tasksListControllerProvider);
    final followUpsAsync = ref.watch(upcomingFollowUpsProvider);

    return Column(
      children: [
        const SizedBox(height: AppSpacing.sm),
        SizedBox(
          height: 40,
          child: ListView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
            children: [
              _chip('All', _ActivityFilter.all),
              const SizedBox(width: AppSpacing.sm),
              _chip('Tasks', _ActivityFilter.tasks),
              const SizedBox(width: AppSpacing.sm),
              _chip('Follow-ups', _ActivityFilter.followUps),
              const SizedBox(width: AppSpacing.sm),
              _chip('Site Visits', _ActivityFilter.siteVisits),
            ],
          ),
        ),
        const SizedBox(height: AppSpacing.sm),
        Expanded(
          child: tasksAsync.when(
            loading: () => const AppPageLoader(),
            error: (error, _) => AppErrorState(
              title: 'Unable to load activities',
              onRetry: () {
                ref.read(tasksListControllerProvider.notifier).refresh();
                ref.read(upcomingFollowUpsProvider.notifier).refresh();
              },
            ),
            data: (tasks) => followUpsAsync.when(
              loading: () => const AppPageLoader(),
              error: (error, _) => AppErrorState(
                title: 'Unable to load activities',
                onRetry: () => ref.read(upcomingFollowUpsProvider.notifier).refresh(),
              ),
              data: (followUps) => _AgendaList(
                tasks: tasks,
                followUps: followUps,
                filter: _filter,
                onRefresh: () async {
                  await ref.read(tasksListControllerProvider.notifier).refresh();
                  await ref.read(upcomingFollowUpsProvider.notifier).refresh();
                },
              ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _chip(String label, _ActivityFilter value) {
    final selected = _filter == value;
    final dark = Theme.of(context).brightness == Brightness.dark;
    final on = dark ? AppColors.indigo600 : AppColors.slate900;
    return Material(
      color: selected ? on : (dark ? AppColors.slate900 : AppColors.white),
      borderRadius: BorderRadius.circular(999),
      child: InkWell(
        borderRadius: BorderRadius.circular(999),
        onTap: () => setState(() => _filter = value),
        child: Container(
          decoration: BoxDecoration(borderRadius: BorderRadius.circular(999), border: Border.all(color: selected ? on : (dark ? AppColors.slate700 : AppColors.slate200))),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          child: Text(label, style: TextStyle(color: selected ? AppColors.white : (dark ? AppColors.slate300 : AppColors.slate600), fontSize: 12.5, fontWeight: FontWeight.w600)),
        ),
      ),
    );
  }
}

sealed class _Entry {
  DateTime get dueAt;
  bool get isOverdue;
}

class _TaskEntry extends _Entry {
  _TaskEntry(this.task);
  final CrmTask task;
  @override
  DateTime get dueAt => task.dueAt ?? DateTime(2100);
  @override
  bool get isOverdue => task.status != 'done' && task.dueAt != null && task.dueAt!.isBefore(DateTime.now());
}

class _FollowUpEntry extends _Entry {
  _FollowUpEntry(this.followUp);
  final UpcomingFollowUp followUp;
  @override
  DateTime get dueAt => followUp.dueAt;
  @override
  bool get isOverdue => followUp.isOverdue;
}

class _AgendaList extends ConsumerWidget {
  const _AgendaList({required this.tasks, required this.followUps, required this.filter, required this.onRefresh});

  final List<CrmTask> tasks;
  final List<UpcomingFollowUp> followUps;
  final _ActivityFilter filter;
  final Future<void> Function() onRefresh;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final entries = <_Entry>[
      if (filter == _ActivityFilter.all || filter == _ActivityFilter.tasks) ...tasks.map(_TaskEntry.new),
      if (filter == _ActivityFilter.all || filter == _ActivityFilter.followUps) ...followUps.map(_FollowUpEntry.new),
      if (filter == _ActivityFilter.siteVisits) ...followUps.where((f) => f.type == 'site_visit').map(_FollowUpEntry.new),
    ]..sort((a, b) => a.dueAt.compareTo(b.dueAt));

    if (entries.isEmpty) {
      return const AppEmptyState(icon: Icons.event_available_outlined, title: 'Nothing on your plate', message: 'Tasks and follow-ups will show up here.');
    }

    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final overdue = entries.where((e) => e.isOverdue).toList();
    final todayItems = entries.where((e) => !e.isOverdue && e.dueAt.year == today.year && e.dueAt.month == today.month && e.dueAt.day == today.day).toList();
    final upcoming = entries.where((e) => !overdue.contains(e) && !todayItems.contains(e)).toList();

    return RefreshIndicator(
      onRefresh: onRefresh,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(AppSpacing.lg, 0, AppSpacing.lg, AppSpacing.xxxl),
        children: [
          if (overdue.isNotEmpty) ...[const _SectionLabel('Overdue', AppColors.rose600), for (final e in overdue) _EntryTile(entry: e)],
          if (todayItems.isNotEmpty) ...[const _SectionLabel('Today', AppColors.indigo600), for (final e in todayItems) _EntryTile(entry: e)],
          if (upcoming.isNotEmpty) ...[const _SectionLabel('Upcoming', AppColors.slate500), for (final e in upcoming) _EntryTile(entry: e)],
        ],
      ),
    );
  }
}

class _SectionLabel extends StatelessWidget {
  const _SectionLabel(this.text, this.color);
  final String text;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: AppSpacing.lg, bottom: AppSpacing.sm),
      child: Text(text.toUpperCase(), style: TextStyle(color: color, fontSize: 11.5, fontWeight: FontWeight.w700, letterSpacing: 0.5)),
    );
  }
}

class _EntryTile extends ConsumerWidget {
  const _EntryTile({required this.entry});
  final _Entry entry;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (entry is _TaskEntry) return _taskTile(context, (entry as _TaskEntry).task);
    return _followUpTile(context, ref, (entry as _FollowUpEntry).followUp);
  }

  Widget _taskTile(BuildContext context, CrmTask task) {
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.sm),
      child: AppCard(
        onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => TaskFormScreen(existing: task))),
        child: Row(
          children: [
            const Icon(Icons.checklist_rounded, size: 18, color: AppColors.blue600),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(task.title, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5)),
                  if (task.dueAt != null) Text(DateFormat('d MMM, h:mm a').format(task.dueAt!), style: const TextStyle(color: AppColors.slate500, fontSize: 12)),
                ],
              ),
            ),
            AppBadge(label: taskStatusLabel(task.status), variant: task.status == 'done' ? AppBadgeVariant.success : AppBadgeVariant.slate),
          ],
        ),
      ),
    );
  }

  Widget _followUpTile(BuildContext context, WidgetRef ref, UpcomingFollowUp followUp) {
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.sm),
      child: AppCard(
        onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => LeadDetailScreen(leadId: followUp.clientId))),
        child: Row(
          children: [
            Icon(followUp.type == 'site_visit' ? Icons.location_on_outlined : Icons.event_note_outlined, size: 18, color: AppColors.emerald600),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('${followUpTypeLabel(followUp.type)} · ${followUp.clientName}', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5)),
                  Text(DateFormat('d MMM, h:mm a').format(followUp.dueAt), style: const TextStyle(color: AppColors.slate500, fontSize: 12)),
                ],
              ),
            ),
            TextButton(onPressed: () => _complete(context, ref, followUp), child: const Text('Done')),
          ],
        ),
      ),
    );
  }

  Future<void> _complete(BuildContext context, WidgetRef ref, UpcomingFollowUp followUp) async {
    try {
      await ref.read(crmApiProvider).completeFollowUp(followUp.clientId, followUp.followUpId);
      ref.invalidate(upcomingFollowUpsProvider);
    } on AppFailure catch (f) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(f.message)));
    }
  }
}
