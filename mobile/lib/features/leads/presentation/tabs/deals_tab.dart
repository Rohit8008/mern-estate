import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../../core/errors/app_failure.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../shared/widgets/widgets.dart';
import '../../domain/deal.dart';
import '../../domain/lead.dart';
import '../../leads_providers.dart';

/// Deals live embedded on the already-fetched Lead (Client.deals[]) — no
/// separate GET needed. Mutations invalidate leadDetailProvider so the next
/// build sees the server's authoritative state instead of guessing it
/// locally.
class DealsTab extends ConsumerWidget {
  const DealsTab({super.key, required this.lead});

  final Lead lead;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final fmt = NumberFormat.decimalPattern('en_IN');

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.all(AppSpacing.lg),
          child: AppButton(
            label: 'Add deal',
            icon: Icons.add_rounded,
            variant: AppButtonVariant.brand,
            expand: true,
            onPressed: () => _openAddDeal(context, ref),
          ),
        ),
        Expanded(
          child: lead.deals.isEmpty
              ? const AppEmptyState(icon: Icons.view_kanban_outlined, title: 'No deals yet', message: 'Add a deal to start tracking this lead through the pipeline.')
              : ListView.separated(
                  padding: const EdgeInsets.fromLTRB(AppSpacing.lg, 0, AppSpacing.lg, AppSpacing.xxxl),
                  itemCount: lead.deals.length,
                  separatorBuilder: (_, __) => const SizedBox(height: AppSpacing.sm),
                  itemBuilder: (context, index) {
                    final deal = lead.deals[index];
                    return AppCard(
                      onTap: () => _openStagePicker(context, ref, deal),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Text('₹${fmt.format(deal.value)}', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                              AppBadge(label: dealStageLabel(deal.stage), variant: _stageBadgeVariant(deal.stage)),
                            ],
                          ),
                          const SizedBox(height: 4),
                          Text('${deal.type[0].toUpperCase()}${deal.type.substring(1)}', style: const TextStyle(color: AppColors.slate500, fontSize: 12.5)),
                          if (deal.expectedCloseDate != null) ...[
                            const SizedBox(height: 4),
                            Text('Expected close: ${DateFormat('MMM d, yyyy').format(deal.expectedCloseDate!)}', style: const TextStyle(color: AppColors.slate500, fontSize: 12)),
                          ],
                          if (deal.notes != null && deal.notes!.isNotEmpty) ...[
                            const SizedBox(height: 6),
                            Text(deal.notes!, style: const TextStyle(fontSize: 12.5)),
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

  AppBadgeVariant _stageBadgeVariant(String stage) {
    if (stage == 'closed_won') return AppBadgeVariant.success;
    if (stage == 'closed_lost') return AppBadgeVariant.error;
    if (stage == 'negotiation' || stage == 'booking_token') return AppBadgeVariant.warning;
    return AppBadgeVariant.brand;
  }

  Future<void> _openStagePicker(BuildContext context, WidgetRef ref, Deal deal) async {
    final selected = await showModalBottomSheet<String>(
      context: context,
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Padding(padding: EdgeInsets.all(AppSpacing.lg), child: Text('Move to stage', style: TextStyle(fontWeight: FontWeight.w700))),
            for (final stage in dealStageOrder)
              ListTile(
                title: Text(dealStageLabel(stage)),
                trailing: stage == deal.stage ? const Icon(Icons.check_rounded, color: AppColors.indigo600) : null,
                onTap: () => Navigator.of(context).pop(stage),
              ),
          ],
        ),
      ),
    );
    if (selected == null || selected == deal.stage || !context.mounted) return;

    try {
      await ref.read(crmApiProvider).updateDealStage(lead.id, deal.id, stage: selected);
      ref.invalidate(leadDetailProvider(lead.id));
    } on AppFailure catch (f) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(f.message)));
    }
  }

  void _openAddDeal(BuildContext context, WidgetRef ref) {
    Navigator.of(context).push(MaterialPageRoute(builder: (_) => _AddDealScreen(leadId: lead.id)));
  }
}

class _AddDealScreen extends ConsumerStatefulWidget {
  const _AddDealScreen({required this.leadId});
  final String leadId;

  @override
  ConsumerState<_AddDealScreen> createState() => _AddDealScreenState();
}

class _AddDealScreenState extends ConsumerState<_AddDealScreen> {
  final _valueController = TextEditingController();
  final _notesController = TextEditingController();
  String _stage = 'new_lead';
  String _type = 'sale';
  bool _submitting = false;
  String? _error;

  @override
  void dispose() {
    _valueController.dispose();
    _notesController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      await ref.read(crmApiProvider).addDeal(widget.leadId, {
        'stage': _stage,
        'type': _type,
        'value': num.tryParse(_valueController.text.trim()) ?? 0,
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
      appBar: AppBar(title: const Text('Add Deal')),
      body: ListView(
        padding: const EdgeInsets.all(AppSpacing.lg),
        children: [
          AppTextField(label: 'Deal value (₹)', controller: _valueController, keyboardType: TextInputType.number),
          const SizedBox(height: AppSpacing.lg),
          AppDropdownField(label: 'Stage', value: _stage, items: {for (final s in dealStageOrder) s: dealStageLabel(s)}, onChanged: (v) => setState(() => _stage = v)),
          const SizedBox(height: AppSpacing.lg),
          AppDropdownField(label: 'Type', value: _type, items: {for (final t in dealTypes) t: '${t[0].toUpperCase()}${t.substring(1)}'}, onChanged: (v) => setState(() => _type = v)),
          const SizedBox(height: AppSpacing.lg),
          AppTextField(label: 'Notes', controller: _notesController),
          if (_error != null) ...[
            const SizedBox(height: AppSpacing.md),
            Text(_error!, style: const TextStyle(color: AppColors.rose600, fontSize: 13)),
          ],
          const SizedBox(height: AppSpacing.xl),
          AppButton(label: 'Add deal', onPressed: _submitting ? null : _submit, loading: _submitting, variant: AppButtonVariant.brand, expand: true),
        ],
      ),
    );
  }
}
