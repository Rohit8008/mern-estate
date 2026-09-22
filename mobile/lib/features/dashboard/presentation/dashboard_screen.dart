import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../shared/widgets/widgets.dart';
import '../../auth/auth_providers.dart';
import '../../buyers/presentation/buyers_list_screen.dart';
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
    final fmt = NumberFormat.decimalPattern('en_IN');
    final today = DateFormat('EEEE, MMMM d').format(DateTime.now());

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
            mainAxisExtent: 140,
          ),
          children: [
            KpiCard(
              title: 'Total Properties',
              value: fmt.format(analytics.properties.total),
              icon: Icons.apartment_rounded,
              accent: AppAccent.blue,
            ),
            KpiCard(
              title: 'Under Negotiation',
              value: fmt.format(analytics.properties.underNegotiation),
              icon: Icons.hourglass_bottom_rounded,
              accent: AppAccent.amber,
            ),
            KpiCard(
              title: 'Buyer Requirements',
              value: fmt.format(analytics.buyers.total),
              icon: Icons.fact_check_outlined,
              accent: AppAccent.purple,
            ),
            if (isAdmin)
              KpiCard(
                title: 'Team Members',
                value: fmt.format(analytics.employees.total),
                icon: Icons.groups_2_outlined,
                accent: AppAccent.emerald,
              )
            else
              KpiCard(
                title: 'Closed Buyers',
                value: fmt.format(analytics.buyers.closed),
                icon: Icons.check_circle_outline_rounded,
                accent: AppAccent.emerald,
              ),
          ],
        ),
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
        _SectionHeader(
          title: 'Recent Buyer Requirements',
          onViewAll: () => Navigator.of(context).push(
            MaterialPageRoute(builder: (_) => const BuyersListScreen()),
          ),
        ),
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
  const _SectionHeader({required this.title, required this.onViewAll});

  final String title;
  final VoidCallback onViewAll;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Expanded(
          child: Text(title, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: AppColors.slate900)),
        ),
        TextButton(onPressed: onViewAll, child: const Text('View all', style: TextStyle(fontSize: 12.5))),
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
