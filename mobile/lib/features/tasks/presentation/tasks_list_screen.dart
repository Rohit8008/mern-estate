import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../shared/widgets/widgets.dart';
import '../domain/crm_task.dart';
import '../tasks_providers.dart';
import 'task_form_screen.dart';

AppBadgeVariant _taskStatusVariant(String status) => switch (status) {
      'done' => AppBadgeVariant.success,
      'blocked' => AppBadgeVariant.error,
      'in_progress' => AppBadgeVariant.info,
      'review' => AppBadgeVariant.warning,
      _ => AppBadgeVariant.slate,
    };

/// Standalone Tasks screen (reached from More for now — folds into the
/// Activities tab alongside Calendar/Visits in a later phase).
class TasksListScreen extends ConsumerWidget {
  const TasksListScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tasksAsync = ref.watch(tasksListControllerProvider);
    final statusFilter = ref.watch(tasksStatusFilterProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Tasks'),
        actions: [IconButton(icon: const Icon(Icons.add_rounded), onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const TaskFormScreen())))],
      ),
      body: Column(
        children: [
          const SizedBox(height: AppSpacing.sm),
          SizedBox(
            height: 40,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
              children: [
                _FilterChip(label: 'All', selected: statusFilter == null, onTap: () => ref.read(tasksStatusFilterProvider.notifier).state = null),
                for (final status in taskStatuses) ...[
                  const SizedBox(width: AppSpacing.sm),
                  _FilterChip(label: taskStatusLabel(status), selected: statusFilter == status, onTap: () => ref.read(tasksStatusFilterProvider.notifier).state = status),
                ],
              ],
            ),
          ),
          const SizedBox(height: AppSpacing.sm),
          Expanded(
            child: tasksAsync.when(
              loading: () => const AppPageLoader(),
              error: (error, _) => AppErrorState(title: 'Unable to load tasks', onRetry: () => ref.read(tasksListControllerProvider.notifier).refresh()),
              data: (tasks) => tasks.isEmpty
                  ? AppEmptyState(
                      icon: Icons.checklist_rounded,
                      title: 'No tasks yet',
                      actionLabel: 'Add task',
                      onAction: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const TaskFormScreen())),
                    )
                  : RefreshIndicator(
                      onRefresh: () => ref.read(tasksListControllerProvider.notifier).refresh(),
                      child: ListView.separated(
                        padding: const EdgeInsets.fromLTRB(AppSpacing.lg, 0, AppSpacing.lg, AppSpacing.xxxl),
                        itemCount: tasks.length,
                        separatorBuilder: (_, __) => const SizedBox(height: AppSpacing.sm),
                        itemBuilder: (context, index) => _TaskRow(task: tasks[index]),
                      ),
                    ),
            ),
          ),
        ],
      ),
    );
  }
}

class _TaskRow extends StatelessWidget {
  const _TaskRow({required this.task});
  final CrmTask task;

  @override
  Widget build(BuildContext context) {
    final overdue = task.status != 'done' && task.dueAt != null && task.dueAt!.isBefore(DateTime.now());

    return AppCard(
      onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => TaskFormScreen(existing: task))),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(task.title, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5)),
                if (task.dueAt != null) ...[
                  const SizedBox(height: 2),
                  Text(DateFormat('d MMM yyyy').format(task.dueAt!), style: TextStyle(color: overdue ? AppColors.rose600 : AppColors.slate500, fontSize: 12)),
                ],
              ],
            ),
          ),
          AppBadge(label: taskStatusLabel(task.status), variant: _taskStatusVariant(task.status)),
        ],
      ),
    );
  }
}

class _FilterChip extends StatelessWidget {
  const _FilterChip({required this.label, required this.selected, required this.onTap});
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final on = dark ? AppColors.indigo600 : AppColors.slate900;
    return Material(
      color: selected ? on : (dark ? AppColors.slate900 : AppColors.white),
      borderRadius: BorderRadius.circular(999),
      child: InkWell(
        borderRadius: BorderRadius.circular(999),
        onTap: onTap,
        child: Container(
          decoration: BoxDecoration(borderRadius: BorderRadius.circular(999), border: Border.all(color: selected ? on : (dark ? AppColors.slate700 : AppColors.slate200))),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          child: Text(label, style: TextStyle(color: selected ? AppColors.white : (dark ? AppColors.slate300 : AppColors.slate600), fontSize: 12.5, fontWeight: FontWeight.w600)),
        ),
      ),
    );
  }
}
