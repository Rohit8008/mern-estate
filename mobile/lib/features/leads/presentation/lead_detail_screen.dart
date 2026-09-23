import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../core/errors/app_failure.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/utils/contact_launcher.dart';
import '../../../shared/widgets/widgets.dart';
import '../../documents/presentation/documents_panel.dart';
import '../domain/lead.dart';
import '../leads_providers.dart';
import 'lead_form_screen.dart';
import 'tabs/communications_tab.dart';
import 'tabs/deals_tab.dart';
import 'tabs/follow_ups_tab.dart';
import 'tabs/lead_tasks_tab.dart';

/// Every tab is real — Overview, Deals/Follow-ups/Communications (wired to
/// /api/crm/*), Tasks (/api/tasks), Documents (/api/documents, kind='client').
class LeadDetailScreen extends ConsumerWidget {
  const LeadDetailScreen({super.key, required this.leadId});

  final String leadId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final leadAsync = ref.watch(leadDetailProvider(leadId));

    return DefaultTabController(
      length: 6,
      child: Scaffold(
        appBar: AppBar(
          title: leadAsync.valueOrNull != null ? Text(leadAsync.value!.name) : const Text('Lead'),
          actions: leadAsync.valueOrNull != null
              ? [
                  IconButton(
                    icon: const Icon(Icons.edit_outlined),
                    onPressed: () => _edit(context, ref, leadAsync.value!),
                  ),
                  IconButton(
                    icon: const Icon(Icons.delete_outline_rounded),
                    onPressed: () => _delete(context, ref, leadAsync.value!),
                  ),
                ]
              : null,
          bottom: const TabBar(
            isScrollable: true,
            tabs: [
              Tab(text: 'Overview'),
              Tab(text: 'Deals'),
              Tab(text: 'Follow-ups'),
              Tab(text: 'Communications'),
              Tab(text: 'Tasks'),
              Tab(text: 'Documents'),
            ],
          ),
        ),
        body: leadAsync.when(
          loading: () => const AppPageLoader(),
          error: (error, _) => AppErrorState(
            title: 'Unable to load this lead',
            message: 'Check your internet connection and try again.',
            onRetry: () => ref.invalidate(leadDetailProvider(leadId)),
          ),
          data: (lead) => TabBarView(
            children: [
              _OverviewTab(lead: lead),
              DealsTab(lead: lead),
              FollowUpsTab(lead: lead),
              CommunicationsTab(lead: lead),
              LeadTasksTab(leadId: lead.id),
              SingleChildScrollView(
                padding: const EdgeInsets.all(AppSpacing.lg),
                child: DocumentsPanel(kind: 'client', refId: lead.id),
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _edit(BuildContext context, WidgetRef ref, Lead lead) {
    Navigator.of(context).push(MaterialPageRoute(builder: (_) => LeadFormScreen(existing: lead)));
  }

  Future<void> _delete(BuildContext context, WidgetRef ref, Lead lead) async {
    final confirmed = await showConfirmDialog(context, title: 'Delete this lead?', message: 'This action cannot be undone.');
    if (!confirmed) return;
    try {
      await ref.read(leadsApiProvider).delete(lead.id);
      ref.invalidate(leadsListControllerProvider);
      if (context.mounted) Navigator.of(context).pop();
    } on AppFailure catch (f) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(f.message)));
      }
    }
  }
}

class _OverviewTab extends StatelessWidget {
  const _OverviewTab({required this.lead});
  final Lead lead;

  @override
  Widget build(BuildContext context) {
    final style = leadStatusStyle(lead.status);
    final dateFmt = DateFormat('d MMM yyyy');

    return ListView(
      padding: const EdgeInsets.all(AppSpacing.lg),
      children: [
        Row(
          children: [
            CircleAvatar(radius: 28, backgroundColor: style.color, child: Text(lead.name.isNotEmpty ? lead.name[0].toUpperCase() : '?', style: const TextStyle(color: AppColors.white, fontWeight: FontWeight.w700, fontSize: 20))),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(lead.name, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
                  if (lead.organization != null && lead.organization!.isNotEmpty) Text(lead.organization!, style: const TextStyle(color: AppColors.slate500, fontSize: 13)),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: AppSpacing.md),
        Row(
          children: [
            AppBadge(label: style.label, dot: true, variant: AppBadgeVariant.slate),
            const SizedBox(width: AppSpacing.sm),
            AppBadge(label: leadContactTypeLabel(lead.contactType), variant: AppBadgeVariant.purple),
          ],
        ),
        const SizedBox(height: AppSpacing.lg),
        if (lead.phone != null || lead.email != null)
          Row(
            children: [
              if (lead.phone != null) ...[
                Expanded(child: AppButton(label: 'Call', icon: Icons.call_outlined, variant: AppButtonVariant.secondary, onPressed: () => ContactLauncher.call(lead.phone!))),
                const SizedBox(width: AppSpacing.sm),
                Expanded(child: AppButton(label: 'WhatsApp', icon: Icons.chat_outlined, variant: AppButtonVariant.secondary, onPressed: () => ContactLauncher.whatsapp(lead.phone!))),
                const SizedBox(width: AppSpacing.sm),
              ],
              if (lead.email != null) Expanded(child: AppButton(label: 'Email', icon: Icons.mail_outline_rounded, variant: AppButtonVariant.secondary, onPressed: () => ContactLauncher.email(lead.email!))),
            ],
          ),
        const SizedBox(height: AppSpacing.xl),
        AppCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('Contact details', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
              const SizedBox(height: AppSpacing.md),
              _DetailRow(label: 'Email', value: lead.email),
              _DetailRow(label: 'Phone', value: lead.phone),
              _DetailRow(label: 'Alternate phone', value: lead.alternatePhone),
              _DetailRow(label: 'Source', value: lead.source),
            ],
          ),
        ),
        const SizedBox(height: AppSpacing.lg),
        AppCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('Notes', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
              const SizedBox(height: AppSpacing.sm),
              Text(
                (lead.notes?.isNotEmpty ?? false) ? lead.notes! : 'No notes added yet.',
                style: TextStyle(color: (lead.notes?.isNotEmpty ?? false) ? AppColors.slate700 : AppColors.slate400, fontSize: 13.5),
              ),
            ],
          ),
        ),
        const SizedBox(height: AppSpacing.lg),
        AppCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('Timeline', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
              const SizedBox(height: AppSpacing.md),
              _DetailRow(label: 'Created', value: lead.createdAt != null ? dateFmt.format(lead.createdAt!) : null),
              _DetailRow(label: 'Last updated', value: lead.updatedAt != null ? dateFmt.format(lead.updatedAt!) : null),
              _DetailRow(label: 'Last contact', value: lead.lastContactAt != null ? dateFmt.format(lead.lastContactAt!) : null),
            ],
          ),
        ),
      ],
    );
  }
}

class _DetailRow extends StatelessWidget {
  const _DetailRow({required this.label, required this.value});
  final String label;
  final String? value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(width: 120, child: Text(label, style: const TextStyle(color: AppColors.slate500, fontSize: 12.5))),
          Expanded(child: Text(value?.isNotEmpty == true ? value! : '—', style: const TextStyle(fontSize: 13.5))),
        ],
      ),
    );
  }
}
