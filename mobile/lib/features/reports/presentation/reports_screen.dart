import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../core/errors/app_failure.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../shared/widgets/widgets.dart';
import '../domain/report.dart';
import '../reports_providers.dart';

final _date = DateFormat('d MMM yyyy');

/// Client reports: the templates a workspace has defined, and the reports
/// already produced from them.
///
/// Read-only on mobile. Composing a report means picking a client, a listing
/// and filling template variables — a desktop job, and a half-built composer
/// on a phone would be worse than an honest link to where it is done.
class ReportsScreen extends ConsumerWidget {
  const ReportsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final reportsAsync = ref.watch(reportsControllerProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Client Reports')),
      body: reportsAsync.when(
        loading: () => const AppPageLoader(),
        error: (error, _) => AppErrorState(
          title: 'Could not load reports',
          message: error is AppFailure ? error.message : error.toString(),
          onRetry: () => ref.read(reportsControllerProvider.notifier).refresh(),
        ),
        data: (overview) {
          if (overview.templates.isEmpty && overview.generated.isEmpty) {
            return const AppEmptyState(
              icon: Icons.description_outlined,
              title: 'No reports yet',
              message: 'Report templates are created on the web app. Once a template exists, '
                  'reports generated from it appear here.',
            );
          }

          return RefreshIndicator(
            onRefresh: () => ref.read(reportsControllerProvider.notifier).refresh(),
            child: ListView(
              padding: const EdgeInsets.all(AppSpacing.md),
              children: [
                if (overview.generated.isNotEmpty) ...[
                  const _SectionLabel('Recent reports'),
                  const SizedBox(height: AppSpacing.sm),
                  AppCard(
                    padding: EdgeInsets.zero,
                    child: Column(
                      children: [
                        for (var i = 0; i < overview.generated.length; i++) ...[
                          if (i > 0) const Divider(height: 1),
                          _GeneratedRow(report: overview.generated[i]),
                        ],
                      ],
                    ),
                  ),
                  const SizedBox(height: AppSpacing.xl),
                ],
                if (overview.templates.isNotEmpty) ...[
                  const _SectionLabel('Templates'),
                  const SizedBox(height: AppSpacing.sm),
                  AppCard(
                    padding: EdgeInsets.zero,
                    child: Column(
                      children: [
                        for (var i = 0; i < overview.templates.length; i++) ...[
                          if (i > 0) const Divider(height: 1),
                          _TemplateRow(template: overview.templates[i]),
                        ],
                      ],
                    ),
                  ),
                ],
                const SizedBox(height: AppSpacing.xxl),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _SectionLabel extends StatelessWidget {
  const _SectionLabel(this.text);
  final String text;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(left: AppSpacing.xs),
        child: Text(
          text.toUpperCase(),
          style: const TextStyle(
            fontSize: 11,
            fontWeight: FontWeight.w700,
            letterSpacing: 0.6,
            color: AppColors.slate400,
          ),
        ),
      );
}

class _GeneratedRow extends StatelessWidget {
  const _GeneratedRow({required this.report});
  final GeneratedReport report;

  @override
  Widget build(BuildContext context) {
    final subtitleParts = [
      if (report.propertyName.isNotEmpty) report.propertyName,
      if (report.reportDate != null) _date.format(report.reportDate!),
    ];

    return ListTile(
      title: Text(
        report.clientName.isEmpty ? report.templateName : report.clientName,
        style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14),
      ),
      subtitle: subtitleParts.isEmpty
          ? null
          : Text(subtitleParts.join(' · '),
              style: const TextStyle(color: AppColors.slate400, fontSize: 12)),
      trailing: AppBadge(
        label: report.isSent ? 'Sent' : 'Draft',
        variant: report.isSent ? AppBadgeVariant.success : AppBadgeVariant.defaultVariant,
      ),
    );
  }
}

class _TemplateRow extends StatelessWidget {
  const _TemplateRow({required this.template});
  final ReportTemplate template;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      title: Text(template.name, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
      subtitle: Text(
        template.description.isNotEmpty
            ? template.description
            : 'Used ${template.usageCount} ${template.usageCount == 1 ? 'time' : 'times'}',
        style: const TextStyle(color: AppColors.slate400, fontSize: 12),
        maxLines: 2,
        overflow: TextOverflow.ellipsis,
      ),
    );
  }
}
