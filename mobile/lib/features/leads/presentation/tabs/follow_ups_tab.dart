import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../../core/errors/app_failure.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../shared/widgets/widgets.dart';
import '../../domain/follow_up.dart';
import '../../domain/lead.dart';
import '../../leads_providers.dart';

class FollowUpsTab extends ConsumerWidget {
  const FollowUpsTab({super.key, required this.lead});

  final Lead lead;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final sorted = [...lead.followUps]..sort((a, b) => a.dueAt.compareTo(b.dueAt));
    final dateFmt = DateFormat('MMM d, yyyy • h:mm a');

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.all(AppSpacing.lg),
          child: AppButton(
            label: 'Add follow-up',
            icon: Icons.add_rounded,
            variant: AppButtonVariant.brand,
            expand: true,
            onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => _AddFollowUpScreen(leadId: lead.id))),
          ),
        ),
        Expanded(
          child: sorted.isEmpty
              ? const AppEmptyState(icon: Icons.event_available_outlined, title: 'No follow-ups scheduled', message: 'Schedule a call, email, or visit to stay on top of this lead.')
              : ListView.separated(
                  padding: const EdgeInsets.fromLTRB(AppSpacing.lg, 0, AppSpacing.lg, AppSpacing.xxxl),
                  itemCount: sorted.length,
                  separatorBuilder: (_, __) => const SizedBox(height: AppSpacing.sm),
                  itemBuilder: (context, index) {
                    final followUp = sorted[index];
                    final overdue = !followUp.completed && followUp.dueAt.isBefore(DateTime.now());
                    return AppCard(
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Icon(_iconFor(followUp.type), size: 20, color: followUp.completed ? AppColors.emerald600 : (overdue ? AppColors.rose600 : AppColors.indigo600)),
                          const SizedBox(width: AppSpacing.md),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(followUpTypeLabel(followUp.type), style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5)),
                                const SizedBox(height: 2),
                                Text(dateFmt.format(followUp.dueAt), style: TextStyle(color: overdue ? AppColors.rose600 : AppColors.slate500, fontSize: 12.5)),
                                if (followUp.notes != null && followUp.notes!.isNotEmpty) ...[
                                  const SizedBox(height: 4),
                                  Text(followUp.notes!, style: const TextStyle(fontSize: 12.5)),
                                ],
                              ],
                            ),
                          ),
                          if (followUp.completed)
                            const AppBadge(label: 'Done', variant: AppBadgeVariant.success)
                          else
                            TextButton(onPressed: () => _complete(context, ref, followUp), child: const Text('Mark done')),
                        ],
                      ),
                    );
                  },
                ),
        ),
      ],
    );
  }

  IconData _iconFor(String type) => switch (type) {
        'call' => Icons.call_outlined,
        'email' => Icons.mail_outline_rounded,
        'meeting' => Icons.groups_outlined,
        'site_visit' => Icons.location_on_outlined,
        'whatsapp' => Icons.chat_outlined,
        _ => Icons.event_note_outlined,
      };

  Future<void> _complete(BuildContext context, WidgetRef ref, FollowUp followUp) async {
    try {
      await ref.read(crmApiProvider).completeFollowUp(lead.id, followUp.id);
      ref.invalidate(leadDetailProvider(lead.id));
    } on AppFailure catch (f) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(f.message)));
    }
  }
}

class _AddFollowUpScreen extends ConsumerStatefulWidget {
  const _AddFollowUpScreen({required this.leadId});
  final String leadId;

  @override
  ConsumerState<_AddFollowUpScreen> createState() => _AddFollowUpScreenState();
}

class _AddFollowUpScreenState extends ConsumerState<_AddFollowUpScreen> {
  final _notesController = TextEditingController();
  String _type = 'call';
  DateTime _dueAt = DateTime.now().add(const Duration(hours: 1));
  bool _submitting = false;
  String? _error;

  @override
  void dispose() {
    _notesController.dispose();
    super.dispose();
  }

  Future<void> _pickDueAt() async {
    final date = await showDatePicker(context: context, initialDate: _dueAt, firstDate: DateTime.now().subtract(const Duration(days: 1)), lastDate: DateTime.now().add(const Duration(days: 365)));
    if (date == null || !mounted) return;
    final time = await showTimePicker(context: context, initialTime: TimeOfDay.fromDateTime(_dueAt));
    if (time == null) return;
    setState(() => _dueAt = DateTime(date.year, date.month, date.day, time.hour, time.minute));
  }

  Future<void> _submit() async {
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      await ref.read(crmApiProvider).addFollowUp(widget.leadId, {
        'dueAt': _dueAt.toIso8601String(),
        'type': _type,
        'notes': _notesController.text.trim(),
      });
      ref.invalidate(leadDetailProvider(widget.leadId));
      if (mounted) Navigator.of(context).pop();
    } on AppFailure catch (f) {
      if (mounted) setState(() => _error = f.message);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Add Follow-up')),
      body: ListView(
        padding: const EdgeInsets.all(AppSpacing.lg),
        children: [
          AppDropdownField(label: 'Type', value: _type, items: {for (final t in followUpTypes) t: followUpTypeLabel(t)}, onChanged: (v) => setState(() => _type = v)),
          const SizedBox(height: AppSpacing.lg),
          const Text('Due', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.slate700)),
          const SizedBox(height: 6),
          AppButton(
            label: DateFormat('MMM d, yyyy • h:mm a').format(_dueAt),
            icon: Icons.calendar_today_outlined,
            variant: AppButtonVariant.secondary,
            expand: true,
            onPressed: _pickDueAt,
          ),
          const SizedBox(height: AppSpacing.lg),
          AppTextField(label: 'Notes', controller: _notesController),
          if (_error != null) ...[
            const SizedBox(height: AppSpacing.md),
            Text(_error!, style: const TextStyle(color: AppColors.rose600, fontSize: 13)),
          ],
          const SizedBox(height: AppSpacing.xl),
          AppButton(label: 'Schedule follow-up', onPressed: _submitting ? null : _submit, loading: _submitting, variant: AppButtonVariant.brand, expand: true),
        ],
      ),
    );
  }
}
