import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../../core/errors/app_failure.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../shared/widgets/widgets.dart';
import '../../domain/communication.dart';
import '../../domain/lead.dart';
import '../../leads_providers.dart';

class CommunicationsTab extends ConsumerWidget {
  const CommunicationsTab({super.key, required this.lead});

  final Lead lead;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final sorted = [...lead.communications]..sort((a, b) => (b.createdAt ?? DateTime(0)).compareTo(a.createdAt ?? DateTime(0)));

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.all(AppSpacing.lg),
          child: AppButton(
            label: 'Log communication',
            icon: Icons.add_rounded,
            variant: AppButtonVariant.brand,
            expand: true,
            onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => _AddCommunicationScreen(leadId: lead.id))),
          ),
        ),
        Expanded(
          child: sorted.isEmpty
              ? const AppEmptyState(icon: Icons.forum_outlined, title: 'No communications logged', message: 'Log calls, emails, and meetings to build this lead\'s history.')
              : ListView.separated(
                  padding: const EdgeInsets.fromLTRB(AppSpacing.lg, 0, AppSpacing.lg, AppSpacing.xxxl),
                  itemCount: sorted.length,
                  separatorBuilder: (_, __) => const SizedBox(height: AppSpacing.sm),
                  itemBuilder: (context, index) {
                    final comm = sorted[index];
                    return AppCard(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Icon(comm.direction == 'inbound' ? Icons.call_received_rounded : Icons.call_made_rounded, size: 14, color: AppColors.slate400),
                              const SizedBox(width: 6),
                              Text(communicationTypeLabel(comm.type), style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5)),
                              const Spacer(),
                              if (comm.createdAt != null) Text(DateFormat('MMM d, h:mm a').format(comm.createdAt!), style: const TextStyle(color: AppColors.slate400, fontSize: 11.5)),
                            ],
                          ),
                          const SizedBox(height: 6),
                          Text(comm.summary, style: const TextStyle(fontSize: 13.5)),
                          if (comm.outcome != null && comm.outcome!.isNotEmpty) ...[
                            const SizedBox(height: 4),
                            Text('Outcome: ${comm.outcome}', style: const TextStyle(color: AppColors.slate500, fontSize: 12)),
                          ],
                        ],
                      ),
                    );
                  },
                ),
        ),
      ],
    );
  }
}

class _AddCommunicationScreen extends ConsumerStatefulWidget {
  const _AddCommunicationScreen({required this.leadId});
  final String leadId;

  @override
  ConsumerState<_AddCommunicationScreen> createState() => _AddCommunicationScreenState();
}

class _AddCommunicationScreenState extends ConsumerState<_AddCommunicationScreen> {
  final _summaryController = TextEditingController();
  final _outcomeController = TextEditingController();
  String _type = 'call';
  String _direction = 'outbound';
  bool _submitting = false;
  String? _error;

  @override
  void dispose() {
    _summaryController.dispose();
    _outcomeController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final summary = _summaryController.text.trim();
    if (summary.isEmpty) {
      setState(() => _error = 'Summary is required.');
      return;
    }
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      await ref.read(crmApiProvider).addCommunication(widget.leadId, {
        'type': _type,
        'direction': _direction,
        'summary': summary,
        'outcome': _outcomeController.text.trim(),
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
      appBar: AppBar(title: const Text('Log Communication')),
      body: ListView(
        padding: const EdgeInsets.all(AppSpacing.lg),
        children: [
          Row(
            children: [
              Expanded(child: AppDropdownField(label: 'Type', value: _type, items: {for (final t in communicationTypes) t: communicationTypeLabel(t)}, onChanged: (v) => setState(() => _type = v))),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: AppDropdownField(
                  label: 'Direction',
                  value: _direction,
                  items: {for (final d in communicationDirections) d: d[0].toUpperCase() + d.substring(1)},
                  onChanged: (v) => setState(() => _direction = v),
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.lg),
          AppTextField(label: 'Summary *', hint: 'What happened?', controller: _summaryController),
          const SizedBox(height: AppSpacing.lg),
          AppTextField(label: 'Outcome', hint: 'Optional', controller: _outcomeController),
          if (_error != null) ...[
            const SizedBox(height: AppSpacing.md),
            Text(_error!, style: const TextStyle(color: AppColors.rose600, fontSize: 13)),
          ],
          const SizedBox(height: AppSpacing.xl),
          AppButton(label: 'Log communication', onPressed: _submitting ? null : _submit, loading: _submitting, variant: AppButtonVariant.brand, expand: true),
        ],
      ),
    );
  }
}
