import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../core/errors/app_failure.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../shared/widgets/widgets.dart';
import '../../activities/activities_providers.dart';
import '../domain/follow_up.dart';
import '../leads_providers.dart';

/// Scheduling a follow-up against a lead.
///
/// Public and parameterised because two entry points need it: the lead's own
/// Follow-ups tab, and the quick-action sheet (which picks a lead first).
/// `initialType` lets "Schedule Visit" land on `site_visit` without being a
/// second, near-identical form that could drift from this one.
class AddFollowUpScreen extends ConsumerStatefulWidget {
  const AddFollowUpScreen({
    super.key,
    required this.leadId,
    this.initialType = 'call',
    this.title = 'Add Follow-up',
    this.leadName,
  });

  final String leadId;
  final String initialType;
  final String title;
  final String? leadName;

  @override
  ConsumerState<AddFollowUpScreen> createState() => _AddFollowUpScreenState();
}

class _AddFollowUpScreenState extends ConsumerState<AddFollowUpScreen> {
  final _notesController = TextEditingController();
  late String _type = widget.initialType;
  DateTime _dueAt = DateTime.now().add(const Duration(hours: 1));
  bool _submitting = false;
  String? _error;

  @override
  void dispose() {
    _notesController.dispose();
    super.dispose();
  }

  Future<void> _pickDueAt() async {
    final date = await showDatePicker(
      context: context,
      initialDate: _dueAt,
      firstDate: DateTime.now().subtract(const Duration(days: 1)),
      lastDate: DateTime.now().add(const Duration(days: 365)),
    );
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
      // The Activities agenda is the other place this follow-up has to appear,
      // and it is the place the quick-action sheet returns you to. Its provider
      // is not autoDispose, so once built it caches for the rest of the session:
      // without this the follow-up is saved but simply never shows up, which
      // reads as "it wasn't saved at all".
      ref.invalidate(upcomingFollowUpsProvider);
      if (mounted) Navigator.of(context).pop(true);
    } on AppFailure catch (f) {
      if (mounted) setState(() => _error = f.message);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(widget.title)),
      body: ListView(
        padding: const EdgeInsets.all(AppSpacing.lg),
        children: [
          if (widget.leadName != null) ...[
            AppCard(
              child: Row(
                children: [
                  const Icon(Icons.person_outline_rounded, size: 18, color: AppColors.slate400),
                  const SizedBox(width: AppSpacing.sm),
                  Expanded(
                    child: Text(widget.leadName!,
                        style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
                  ),
                ],
              ),
            ),
            const SizedBox(height: AppSpacing.lg),
          ],
          AppDropdownField(
            label: 'Type',
            value: _type,
            items: {for (final t in followUpTypes) t: followUpTypeLabel(t)},
            onChanged: (v) => setState(() => _type = v),
          ),
          const SizedBox(height: AppSpacing.lg),
          const Text('Due', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
          const SizedBox(height: 6),
          AppButton(
            label: DateFormat('d MMM yyyy • h:mm a').format(_dueAt),
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
          AppButton(
            label: 'Schedule follow-up',
            onPressed: _submitting ? null : _submit,
            loading: _submitting,
            variant: AppButtonVariant.brand,
            expand: true,
          ),
        ],
      ),
    );
  }
}
