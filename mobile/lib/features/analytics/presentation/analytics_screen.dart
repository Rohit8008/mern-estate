import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../core/utils/format.dart';

import '../../../core/errors/app_failure.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../shared/widgets/widgets.dart';
import '../analytics_providers.dart';
import '../domain/analytics_report.dart';

final _money = NumberFormat.currency(locale: 'en_IN', symbol: '₹', decimalDigits: 0);
final _count = NumberFormat.decimalPattern('en_IN');

/// Sales and lead-conversion figures.
///
/// Deliberately bars and numbers rather than a charting dependency: the web
/// app's ApexCharts do not port, and on a phone a labelled proportional bar is
/// more readable than a shrunken chart.
class AnalyticsScreen extends ConsumerWidget {
  const AnalyticsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final reportAsync = ref.watch(analyticsControllerProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Analytics')),
      body: reportAsync.when(
        loading: () => const AppPageLoader(),
        error: (error, _) => AppErrorState(
          title: 'Could not load analytics',
          message: error is AppFailure ? error.message : error.toString(),
          onRetry: () => ref.read(analyticsControllerProvider.notifier).refresh(),
        ),
        data: (report) => RefreshIndicator(
          onRefresh: () => ref.read(analyticsControllerProvider.notifier).refresh(),
          child: ListView(
            padding: const EdgeInsets.all(AppSpacing.md),
            children: [
              const _SectionLabel('Closed business'),
              const SizedBox(height: AppSpacing.sm),
              // Rows size to their content: a fixed cell height clipped cards
              // with a sub-line or under a larger system font.
              KpiGrid(
                children: [
                  KpiCard(
                    title: 'Closed value',
                    value: Fmt.moneyCompact(report.sales.closedDeals.totalValue),
                    icon: Icons.trending_up_rounded,
                    accent: AppAccent.emerald,
                  ),
                  KpiCard(
                    title: 'Deals won',
                    value: _count.format(report.sales.closedDeals.count),
                    icon: Icons.handshake_outlined,
                    accent: AppAccent.blue,
                  ),
                  KpiCard(
                    title: 'Average deal',
                    value: Fmt.moneyCompact(report.sales.closedDeals.avgValue),
                    icon: Icons.straighten_rounded,
                    accent: AppAccent.purple,
                  ),
                  KpiCard(
                    title: 'Commission',
                    value: Fmt.moneyCompact(report.sales.closedDeals.totalCommission),
                    icon: Icons.account_balance_wallet_outlined,
                    accent: AppAccent.amber,
                  ),
                ],
              ),
              const SizedBox(height: AppSpacing.xl),
              const _SectionLabel('Lead conversion'),
              const SizedBox(height: AppSpacing.sm),
              AppCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: _Stat(
                            label: 'Conversion rate',
                            value: '${report.leads.conversionRate.toStringAsFixed(1)}%',
                          ),
                        ),
                        Expanded(
                          child: _Stat(
                            label: 'Avg days to win',
                            value: report.leads.avgConversionDays == 0 ? '—' : '${report.leads.avgConversionDays}',
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: AppSpacing.md),
                    const Divider(height: 1),
                    const SizedBox(height: AppSpacing.md),
                    _Funnel(funnel: report.leads.funnel),
                  ],
                ),
              ),
              const SizedBox(height: AppSpacing.xl),
              const _SectionLabel('Pipeline by stage'),
              const SizedBox(height: AppSpacing.sm),
              _BucketList(
                buckets: report.sales.byStage,
                emptyMessage: 'No deals in the pipeline yet.',
                showValue: true,
              ),
              const SizedBox(height: AppSpacing.xl),
              const _SectionLabel('Leads by source'),
              const SizedBox(height: AppSpacing.sm),
              _BucketList(
                buckets: report.leads.bySource,
                emptyMessage: 'No leads recorded yet.',
                showValue: false,
              ),
              const SizedBox(height: AppSpacing.xxl),
            ],
          ),
        ),
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

class _Stat extends StatelessWidget {
  const _Stat({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: const TextStyle(color: AppColors.slate400, fontSize: 12)),
          const SizedBox(height: 2),
          Text(value, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700)),
        ],
      );
}

class _Funnel extends StatelessWidget {
  const _Funnel({required this.funnel});
  final LeadFunnel funnel;

  @override
  Widget build(BuildContext context) {
    final stages = funnel.stages;
    // Proportions are against the top of the funnel, so the bars read as
    // "share of all leads" rather than each one filling the row.
    final top = stages.first.$2;

    return Column(
      children: [
        for (final (label, count) in stages) ...[
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 5),
            child: Row(
              children: [
                SizedBox(
                  width: 92,
                  child: Text(label, style: const TextStyle(fontSize: 13, color: AppColors.slate600)),
                ),
                Expanded(
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(4),
                    child: LinearProgressIndicator(
                      value: top == 0 ? 0 : count / top,
                      minHeight: 8,
                      backgroundColor: Theme.of(context).brightness == Brightness.dark ? AppColors.slate800 : AppColors.slate100,
                    ),
                  ),
                ),
                SizedBox(
                  width: 44,
                  child: Text(
                    _count.format(count),
                    textAlign: TextAlign.right,
                    style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
                  ),
                ),
              ],
            ),
          ),
        ],
      ],
    );
  }
}

class _BucketList extends StatelessWidget {
  const _BucketList({required this.buckets, required this.emptyMessage, required this.showValue});

  final List<AnalyticsBucket> buckets;
  final String emptyMessage;
  final bool showValue;

  @override
  Widget build(BuildContext context) {
    if (buckets.isEmpty) {
      return AppCard(
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: AppSpacing.md),
          child: Center(
            child: Text(emptyMessage, style: const TextStyle(color: AppColors.slate400, fontSize: 13)),
          ),
        ),
      );
    }

    final max = buckets.map((b) => b.count).reduce((a, b) => a > b ? a : b);

    return AppCard(
      child: Column(
        children: [
          for (final bucket in buckets)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 6),
              child: Row(
                children: [
                  SizedBox(
                    width: 104,
                    child: Text(
                      _humanise(bucket.key),
                      style: const TextStyle(fontSize: 13, color: AppColors.slate600),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  Expanded(
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(4),
                      child: LinearProgressIndicator(
                        value: max == 0 ? 0 : bucket.count / max,
                        minHeight: 8,
                        backgroundColor: Theme.of(context).brightness == Brightness.dark ? AppColors.slate800 : AppColors.slate100,
                      ),
                    ),
                  ),
                  const SizedBox(width: AppSpacing.xs),
                  Text(
                    showValue && bucket.value != null ? _money.format(bucket.value) : _count.format(bucket.count),
                    style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }

  /// Stage and status keys are stored snake_case ('site_visit_scheduled').
  static String _humanise(String key) => key.split('_').map((w) => w.isEmpty ? w : '${w[0].toUpperCase()}${w.substring(1)}').join(' ');
}
