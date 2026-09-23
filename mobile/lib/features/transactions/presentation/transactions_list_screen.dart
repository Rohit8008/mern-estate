import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../core/utils/format.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../shared/widgets/widgets.dart';
import '../domain/transaction.dart';
import '../transactions_providers.dart';
import 'transaction_form_screen.dart';

final _priceFmt = NumberFormat.currency(locale: 'en_IN', symbol: '₹', decimalDigits: 0);

AppBadgeVariant _transactionStatusVariant(String status) => switch (status) {
      'completed' => AppBadgeVariant.success,
      'cancelled' => AppBadgeVariant.error,
      'in_progress' => AppBadgeVariant.info,
      _ => AppBadgeVariant.warning,
    };

class TransactionsListScreen extends ConsumerStatefulWidget {
  const TransactionsListScreen({super.key});

  @override
  ConsumerState<TransactionsListScreen> createState() => _TransactionsListScreenState();
}

class _TransactionsListScreenState extends ConsumerState<TransactionsListScreen> {
  final _searchController = TextEditingController();
  Timer? _debounce;

  @override
  void dispose() {
    _debounce?.cancel();
    _searchController.dispose();
    super.dispose();
  }

  void _onSearchChanged(String value) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 350), () {
      ref.read(transactionsSearchProvider.notifier).state = value.trim();
    });
  }

  @override
  Widget build(BuildContext context) {
    final transactionsAsync = ref.watch(transactionsControllerProvider);
    final statsAsync = ref.watch(transactionStatsProvider);
    final statusFilter = ref.watch(transactionsStatusFilterProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Transactions'),
        actions: [IconButton(icon: const Icon(Icons.add_rounded), onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const TransactionFormScreen())))],
      ),
      body: Column(
        children: [
          statsAsync.when(
            loading: () => const SizedBox.shrink(),
            error: (_, __) => const SizedBox.shrink(),
            data: (stats) => Padding(
              padding: const EdgeInsets.fromLTRB(AppSpacing.lg, AppSpacing.md, AppSpacing.lg, 0),
              child: GridView(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: 2,
                  mainAxisSpacing: AppSpacing.md,
                  crossAxisSpacing: AppSpacing.md,
                  mainAxisExtent: 140,
                ),
                children: [
                  KpiCard(title: 'Pipeline', value: Fmt.moneyCompact(stats.totalPipeline), subtitle: 'Pending and in progress', icon: Icons.trending_up_rounded, accent: AppAccent.indigo),
                  KpiCard(title: 'Commission', value: Fmt.moneyCompact(stats.totalCommission), subtitle: 'Earned on completed deals', icon: Icons.payments_outlined, accent: AppAccent.emerald),
                  KpiCard(title: 'Completed', value: '${stats.completed}', icon: Icons.check_circle_outline_rounded, accent: AppAccent.blue),
                  KpiCard(title: 'Pending', value: '${stats.pending}', icon: Icons.hourglass_bottom_rounded, accent: AppAccent.amber),
                ],
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(AppSpacing.lg, AppSpacing.md, AppSpacing.lg, 0),
            child: AppTextField(hint: 'Search by property or client…', prefixIcon: Icons.search_rounded, controller: _searchController, onChanged: _onSearchChanged),
          ),
          const SizedBox(height: AppSpacing.sm),
          SizedBox(
            height: 40,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
              children: [
                _FilterChip(label: 'All', selected: statusFilter == null, onTap: () => ref.read(transactionsStatusFilterProvider.notifier).state = null),
                for (final status in transactionStatuses) ...[
                  const SizedBox(width: AppSpacing.sm),
                  _FilterChip(label: transactionStatusLabel(status), selected: statusFilter == status, onTap: () => ref.read(transactionsStatusFilterProvider.notifier).state = status),
                ],
              ],
            ),
          ),
          const SizedBox(height: AppSpacing.sm),
          Expanded(
            child: transactionsAsync.when(
              loading: () => const AppPageLoader(),
              error: (error, _) => AppErrorState(title: 'Unable to load transactions', onRetry: () => ref.read(transactionsControllerProvider.notifier).refresh()),
              data: (transactions) => transactions.isEmpty
                  ? AppEmptyState(
                      icon: Icons.payments_outlined,
                      title: 'No transactions yet',
                      actionLabel: 'Add transaction',
                      onAction: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const TransactionFormScreen())),
                    )
                  : RefreshIndicator(
                      onRefresh: () => ref.read(transactionsControllerProvider.notifier).refresh(),
                      child: ListView.separated(
                        padding: const EdgeInsets.fromLTRB(AppSpacing.lg, 0, AppSpacing.lg, AppSpacing.xxxl),
                        itemCount: transactions.length,
                        separatorBuilder: (_, __) => const SizedBox(height: AppSpacing.sm),
                        itemBuilder: (context, index) => _TransactionRow(transaction: transactions[index]),
                      ),
                    ),
            ),
          ),
        ],
      ),
    );
  }
}

class _TransactionRow extends ConsumerWidget {
  const _TransactionRow({required this.transaction});
  final CrmTransaction transaction;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return AppCard(
      onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => TransactionFormScreen(existing: transaction))),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Expanded(child: Text(transaction.propertyName, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14))),
              AppBadge(label: transactionStatusLabel(transaction.status), variant: _transactionStatusVariant(transaction.status)),
            ],
          ),
          const SizedBox(height: 2),
          Text(transaction.clientName, style: const TextStyle(color: AppColors.slate500, fontSize: 12.5)),
          const SizedBox(height: 6),
          Row(
            children: [
              Text(_priceFmt.format(transaction.amount), style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15, color: AppColors.moneyInk(context))),
              const SizedBox(width: AppSpacing.sm),
              if (transaction.commission > 0)
                Text('· ${_priceFmt.format(transaction.commission)} comm.', style: const TextStyle(color: AppColors.slate400, fontSize: 11.5)),
            ],
          ),
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
    // Theme-aware: in dark mode the selected chip was the page colour (so
    // "All" vanished) and the rest were bright white pills.
    final dark = Theme.of(context).brightness == Brightness.dark;
    final bg = selected ? (dark ? AppColors.indigo600 : AppColors.slate900) : (dark ? AppColors.slate900 : AppColors.white);
    final border = selected ? bg : (dark ? AppColors.slate700 : AppColors.slate200);
    final fg = selected ? AppColors.white : (dark ? AppColors.slate300 : AppColors.slate600);
    return Material(
      color: bg,
      borderRadius: BorderRadius.circular(999),
      child: InkWell(
        borderRadius: BorderRadius.circular(999),
        onTap: onTap,
        child: Container(
          decoration: BoxDecoration(borderRadius: BorderRadius.circular(999), border: Border.all(color: border)),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          child: Text(label, style: TextStyle(color: fg, fontSize: 12.5, fontWeight: FontWeight.w600)),
        ),
      ),
    );
  }
}
