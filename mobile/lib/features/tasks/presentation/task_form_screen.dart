import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../core/errors/app_failure.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../shared/widgets/widgets.dart';
import '../domain/crm_task.dart';
import '../tasks_providers.dart';

/// Standalone create/edit — not scoped to a lead (see leads/.../lead_tasks_tab.dart
/// for the lead-scoped variant, which sets related.kind='client' on create).
class TaskFormScreen extends ConsumerStatefulWidget {
  const TaskFormScreen({super.key, this.existing});
  final CrmTask? existing;

  @override
  ConsumerState<TaskFormScreen> createState() => _TaskFormScreenState();
}

class _TaskFormScreenState extends ConsumerState<TaskFormScreen> {
  late final _titleController = TextEditingController(text: widget.existing?.title);
  late String _status = widget.existing?.status ?? 'todo';
  late String _priority = widget.existing?.priority ?? 'medium';
  DateTime? _dueAt;
  bool _submitting = false;
  String? _error;

  bool get _isEditing => widget.existing != null;

  @override
  void initState() {
    super.initState();
    _dueAt = widget.existing?.dueAt;
  }

  @override
  void dispose() {
    _titleController.dispose();
    super.dispose();
  }

  Future<void> _pickDueDate() async {
    final date = await showDatePicker(context: context, initialDate: _dueAt ?? DateTime.now(), firstDate: DateTime.now().subtract(const Duration(days: 1)), lastDate: DateTime.now().add(const Duration(days: 365)));
    if (date != null) setState(() => _dueAt = date);
  }

  Future<void> _submit() async {
    final title = _titleController.text.trim();
    if (title.isEmpty) {
      setState(() => _error = 'Title is required.');
      return;
    }
    setState(() {
      _submitting = true;
      _error = null;
    });
    final payload = {
      'title': title,
      'status': _status,
      'priority': _priority,
      if (_dueAt != null) 'dueAt': _dueAt!.toIso8601String(),
    };
    try {
      final api = ref.read(tasksApiProvider);
      if (_isEditing) {
        await api.update(widget.existing!.id, payload);
      } else {
        await api.create(payload);
      }
      ref.invalidate(tasksListControllerProvider);
      if (mounted) Navigator.of(context).pop();
    } on AppFailure catch (f) {
      if (mounted) setState(() => _error = f.message);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Future<void> _delete() async {
    final confirmed = await showConfirmDialog(context, title: 'Delete this task?', message: 'This action cannot be undone.');
    if (!confirmed) return;
    try {
      await ref.read(tasksApiProvider).delete(widget.existing!.id);
      ref.invalidate(tasksListControllerProvider);
      if (mounted) Navigator.of(context).pop();
    } on AppFailure catch (f) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(f.message)));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(_isEditing ? 'Edit Task' : 'New Task'),
        actions: _isEditing ? [IconButton(icon: const Icon(Icons.delete_outline_rounded), onPressed: _delete)] : null,
      ),
      body: ListView(
        padding: const EdgeInsets.all(AppSpacing.lg),
        children: [
          AppTextField(label: 'Title *', controller: _titleController),
          const SizedBox(height: AppSpacing.lg),
          Row(
            children: [
              Expanded(child: AppDropdownField(label: 'Status', value: _status, items: {for (final s in taskStatuses) s: taskStatusLabel(s)}, onChanged: (v) => setState(() => _status = v))),
              const SizedBox(width: AppSpacing.md),
              Expanded(child: AppDropdownField(label: 'Priority', value: _priority, items: {for (final p in taskPriorities) p: p[0].toUpperCase() + p.substring(1)}, onChanged: (v) => setState(() => _priority = v))),
            ],
          ),
          const SizedBox(height: AppSpacing.lg),
          const Text('Due date', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.slate700)),
          const SizedBox(height: 6),
          AppButton(label: _dueAt != null ? DateFormat('MMM d, yyyy').format(_dueAt!) : 'No due date', icon: Icons.calendar_today_outlined, variant: AppButtonVariant.secondary, expand: true, onPressed: _pickDueDate),
          if (_error != null) ...[
            const SizedBox(height: AppSpacing.md),
            Text(_error!, style: const TextStyle(color: AppColors.rose600, fontSize: 13)),
          ],
          const SizedBox(height: AppSpacing.xl),
          AppButton(label: _isEditing ? 'Save changes' : 'Create task', onPressed: _submitting ? null : _submit, loading: _submitting, variant: AppButtonVariant.brand, expand: true),
        ],
      ),
    );
  }
}
