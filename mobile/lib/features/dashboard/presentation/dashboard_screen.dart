import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/utils/format.dart';
import '../../../shared/widgets/widgets.dart';
import '../../auth/auth_providers.dart';
import '../../buyers/presentation/buyers_list_screen.dart';
import '../../tasks/presentation/tasks_list_screen.dart';
import '../../transactions/presentation/transactions_list_screen.dart';
import '../dashboard_providers.dart';
import '../domain/dashboard_analytics.dart';

/// Purpose-built mobile dashboard — deliberately not the desktop's
/// customizable widget grid + charts (AgencyDashboard.jsx). Read-first:
/// KPI strip, then recent activity. See the architecture writeup for why
/// the drag-drop widget builder and ApexCharts don't get ported to v1.
class DashboardScreen extends ConsumerWidget {
  const DashboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final analyticsAsync = ref.watch(dashboardControllerProvider);
    final user = ref.watch(authControllerProvider).user;

    return RefreshIndicator(
      onRefresh: () => ref.read(dashboardControllerProvider.notifier).refresh(),
      child: analyticsAsync.when(
        loading: () => const AppPageLoader(),
        error: (error, _) => ListView(
          children: [
            SizedBox(
              height: 420,
              child: AppErrorState(
                title: 'Unable to load your dashboard',
                message: 'Check your internet connection and try again.',
                onRetry: () => ref.read(dashboardControllerProvider.notifier).refresh(),
              ),
            ),
          ],
        ),
        data: (analytics) => _DashboardContent(analytics: analytics, firstName: user?.fullName.split(' ').first, isAdmin: user?.isAdmin ?? false),
      ),
    );
  }
}

class _DashboardContent extends StatelessWidget {
  const _DashboardContent({required this.analytics, required this.firstName, required this.isAdmin});

  final DashboardAnalytics analytics;
  final String? firstName;
  final bool isAdmin;

  String get _greeting {
    final hour = DateTime.now().hour;
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  }

  @override
  Widget build(BuildContext context) {
    final today = Fmt.longDay(DateTime.now());
    final p = analytics.properties;
    final b = analytics.buyers;
    void push(Widget screen) => Navigator.of(context).push(MaterialPageRoute(builder: (_) => screen));
    String parts(List<(int, String)> items) =>
        items.where((e) => e.$1 > 0).map((e) => '${Fmt.count(e.$1)} ${e.$2}').join(' · ');

    return ListView(
      padding: const EdgeInsets.fromLTRB(AppSpacing.lg, AppSpacing.lg, AppSpacing.lg, AppSpacing.xxxl),
      children: [
        _GreetingBanner(greeting: _greeting, name: firstName ?? 'there', dateLabel: today),
        const SizedBox(height: AppSpacing.xl),
        GridView(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: 2,
            mainAxisSpacing: AppSpacing.md,
            crossAxisSpacing: AppSpacing.md,
            mainAxisExtent: 152,
          ),
          children: [
            KpiCard(
              title: 'Total Properties',
              value: Fmt.count(p.total),
              subtitle: parts([(p.available, 'available'), (p.sold, 'sold'), (p.rented, 'rented')]),
              icon: Icons.apartment_rounded,
              accent: AppAccent.blue,
              onTap: () => context.go('/properties'),
            ),
            KpiCard(
              title: 'Under Negotiation',
              value: Fmt.count(p.underNegotiation),
              subtitle: p.underNegotiation == 0 ? 'None right now' : 'Properties in talks',
              icon: Icons.hourglass_bottom_rounded,
              accent: AppAccent.amber,
              onTap: () => context.go('/properties'),
            ),
            KpiCard(
              title: 'Buyer Requirements',
              value: Fmt.count(b.total),
              subtitle: parts([(b.active, 'active'), (b.matched, 'matched')]),
              icon: Icons.fact_check_outlined,
              accent: AppAccent.purple,
              onTap: () => push(const BuyersListScreen()),
            ),
            if (isAdmin)
              KpiCard(
                title: 'Team Members',
                value: Fmt.count(analytics.employees.total),
                subtitle: '${Fmt.count(analytics.employees.active)} active',
                icon: Icons.groups_2_outlined,
                accent: AppAccent.emerald,
              )
            else
              KpiCard(
                title: 'Closed Buyers',
                value: Fmt.count(b.closed),
                icon: Icons.check_circle_outline_rounded,
                accent: AppAccent.emerald,
                onTap: () => push(const BuyersListScreen()),
              ),
          ],
        ),
        if (analytics.sales != null) ...[
          const SizedBox(height: AppSpacing.xxl),
          _SectionHeader(title: 'Sales overview', actionLabel: 'Deals', onViewAll: () => push(const TransactionsListScreen())),
          const SizedBox(height: AppSpacing.sm),
          _SalesOverview(sales: analytics.sales!, onFollowUps: () => push(const TasksListScreen()), onLeads: () => context.go('/leads')),
        ],
        const SizedBox(height: AppSpacing.xxl),
        _SectionHeader(title: 'Recent Listings', onViewAll: () => context.go('/properties')),
        const SizedBox(height: AppSpacing.sm),
        AppCard(
          padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
          child: analytics.recentListings.isEmpty
              ? const Padding(
                  padding: EdgeInsets.symmetric(vertical: AppSpacing.lg),
                  child: Center(child: Text('No recent listings', style: TextStyle(color: AppColors.slate400, fontSize: 13))),
                )
              : Column(
                  children: [
                    for (final listing in analytics.recentListings.take(5)) _RecentListingRow(listing: listing),
                  ],
                ),
        ),
        const SizedBox(height: AppSpacing.xl),
        _SectionHeader(title: 'Recent Buyer Requirements', onViewAll: () => push(const BuyersListScreen())),
        const SizedBox(height: AppSpacing.sm),
        AppCard(
          padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
          child: analytics.recentBuyers.isEmpty
              ? const Padding(
                  padding: EdgeInsets.symmetric(vertical: AppSpacing.lg),
                  child: Center(child: Text('No recent buyers', style: TextStyle(color: AppColors.slate400, fontSize: 13))),
                )
              : Column(
                  children: [
                    for (final buyer in analytics.recentBuyers.take(5)) _RecentBuyerRow(buyer: buyer),
                  ],
                ),
        ),
      ],
    );
  }
}

class _GreetingBanner extends StatelessWidget {
  const _GreetingBanner({required this.greeting, required this.name, required this.dateLabel});

  final String greeting;
  final String name;
  final String dateLabel;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(AppSpacing.xl),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [AppColors.slate900, AppColors.slate800, AppColors.slate900],
        ),
        borderRadius: BorderRadius.circular(AppRadius.xl),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('$greeting, $name!',
              style: const TextStyle(color: AppColors.white, fontSize: 20, fontWeight: FontWeight.w800)),
          const SizedBox(height: 4),
          Text('$dateLabel · Agency performance overview',
              style: TextStyle(color: AppColors.white.withOpacity(0.7), fontSize: 13)),
        ],
      ),
    );
  }
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader({required this.title, required this.onViewAll, this.actionLabel = 'View all'});

  final String title;
  final String actionLabel;
  final VoidCallback onViewAll;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Expanded(
          child: Text(title, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
        ),
        TextButton(onPressed: onViewAll, child: Text(actionLabel, style: const TextStyle(fontSize: 12.5))),
      ],
    );
  }
}

/// Deals and follow-ups at a glance — the same four figures as the website's
/// Sales overview, so the phone and the desk tell the same story.
class _SalesOverview extends StatelessWidget {
  const _SalesOverview({required this.sales, required this.onFollowUps, required this.onLeads});

  final SalesOverview sales;
  final VoidCallback onFollowUps;
  final VoidCallback onLeads;

  @override
  Widget build(BuildContext context) {
    final overdue = sales.followUpsOverdue;
    return GridView(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 2,
        mainAxisSpacing: AppSpacing.md,
        crossAxisSpacing: AppSpacing.md,
        mainAxisExtent: 152,
      ),
      children: [
        KpiCard(
          title: 'Open deals',
          value: Fmt.count(sales.openDeals),
          subtitle: sales.pipelineValue > 0 ? '${Fmt.moneyCompact(sales.pipelineValue)} in the pipeline' : 'Nothing in the pipeline',
          icon: Icons.trending_up_rounded,
          accent: AppAccent.blue,
        ),
        KpiCard(
          title: 'Follow-ups',
          value: Fmt.count(overdue + sales.followUpsUpcoming),
          subtitle: overdue > 0 ? '$overdue overdue · ${sales.followUpsUpcoming} this week' : '${sales.followUpsUpcoming} due this week',
          icon: overdue > 0 ? Icons.warning_amber_rounded : Icons.event_note_outlined,
          accent: overdue > 0 ? AppAccent.rose : AppAccent.amber,
          onTap: onFollowUps,
        ),
        KpiCard(
          title: 'Won (30 days)',
          value: Fmt.count(sales.wonDeals),
          subtitle: sales.wonCommission > 0 ? '${Fmt.moneyCompact(sales.wonCommission)} commission' : null,
          icon: Icons.emoji_events_outlined,
          accent: AppAccent.emerald,
        ),
        KpiCard(
          title: 'New leads (30 days)',
          value: Fmt.count(sales.newClients),
          subtitle: '${Fmt.count(sales.totalClients)} leads in total',
          icon: Icons.person_add_alt_1_outlined,
          accent: AppAccent.purple,
          onTap: onLeads,
        ),
      ],
    );
  }
}

AppBadgeVariant _listingStatusVariant(String status) {
  switch (status) {
    case 'available':
      return AppBadgeVariant.success;
    case 'sold':
      return AppBadgeVariant.info;
    case 'rented':
      return AppBadgeVariant.purple;
    default:
      return AppBadgeVariant.warning;
  }
}

AppBadgeVariant _buyerStatusVariant(String status) {
  switch (status) {
    case 'active':
      return AppBadgeVariant.success;
    case 'matched':
      return AppBadgeVariant.info;
    default:
      return AppBadgeVariant.defaultVariant;
  }
}

class _RecentListingRow extends StatelessWidget {
  const _RecentListingRow({required this.listing});
  final RecentListing listing;

  @override
  Widget build(BuildContext context) {
    final location = [listing.city, listing.locality].where((s) => s != null && s.isNotEmpty).join(', ');
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.sm, vertical: AppSpacing.sm),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(listing.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13.5)),
                if (location.isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Text(location, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: AppColors.slate500, fontSize: 12)),
                ],
              ],
            ),
          ),
          const SizedBox(width: AppSpacing.sm),
          AppBadge(label: listing.status.replaceAll('_', ' '), variant: _listingStatusVariant(listing.status)),
        ],
      ),
    );
  }
}

class _RecentBuyerRow extends StatelessWidget {
  const _RecentBuyerRow({required this.buyer});
  final RecentBuyer buyer;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.sm, vertical: AppSpacing.sm),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(buyer.buyerName, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13.5)),
                const SizedBox(height: 2),
                Text(buyer.buyerPhone ?? 'No phone', style: const TextStyle(color: AppColors.slate500, fontSize: 12)),
              ],
            ),
          ),
          const SizedBox(width: AppSpacing.sm),
          AppBadge(label: buyer.status, variant: _buyerStatusVariant(buyer.status)),
        ],
      ),
    );
  }
}
