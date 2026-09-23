import 'package:flutter/material.dart';

import '../core/theme/app_colors.dart';
import '../core/theme/app_spacing.dart';
import '../shared/widgets/widgets.dart';

/// Component catalog for visually verifying the design-system port —
/// not a product screen, kept around as a living reference while building
/// later features (mirrors having Storybook alongside the web design system).
class DesignGalleryScreen extends StatelessWidget {
  const DesignGalleryScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Design System')),
      body: ListView(
        padding: const EdgeInsets.all(AppSpacing.lg),
        children: [
          const _Section('Buttons'),
          Wrap(
            spacing: AppSpacing.sm,
            runSpacing: AppSpacing.sm,
            children: [
              AppButton(label: 'Primary', onPressed: () {}, variant: AppButtonVariant.primary),
              AppButton(label: 'Secondary', onPressed: () {}, variant: AppButtonVariant.secondary),
              AppButton(label: 'Ghost', onPressed: () {}, variant: AppButtonVariant.ghost),
              AppButton(label: 'Danger', onPressed: () {}, variant: AppButtonVariant.danger),
              AppButton(label: 'Brand', onPressed: () {}, variant: AppButtonVariant.brand, icon: Icons.add_rounded),
              AppButton(label: 'Loading', onPressed: () {}, loading: true),
              const AppButton(label: 'Disabled', onPressed: null),
            ],
          ),
          const SizedBox(height: AppSpacing.md),
          Container(
            padding: const EdgeInsets.all(AppSpacing.md),
            decoration: BoxDecoration(color: AppColors.slate900, borderRadius: BorderRadius.circular(12)),
            child: Wrap(
              spacing: AppSpacing.sm,
              children: [
                AppButton(label: 'Dark', onPressed: () {}, variant: AppButtonVariant.dark),
                AppButton(label: 'Dark Brand', onPressed: () {}, variant: AppButtonVariant.darkBrand),
              ],
            ),
          ),
          const _Section('Badges'),
          const Wrap(
            spacing: AppSpacing.sm,
            runSpacing: AppSpacing.sm,
            children: [
              AppBadge(label: 'Default'),
              AppBadge(label: 'Won', variant: AppBadgeVariant.success, dot: true),
              AppBadge(label: 'Pending', variant: AppBadgeVariant.warning, dot: true),
              AppBadge(label: 'Lost', variant: AppBadgeVariant.error, dot: true),
              AppBadge(label: 'New', variant: AppBadgeVariant.info),
              AppBadge(label: 'Brand', variant: AppBadgeVariant.brand),
              AppBadge(label: 'Referral', variant: AppBadgeVariant.purple),
            ],
          ),
          const _Section('KPI cards'),
          const KpiGrid(
            children: [
              KpiCard(title: 'Active Leads', value: '48', icon: Icons.people_alt_rounded, accent: AppAccent.indigo, trendValue: 12, trendLabel: 'vs last week'),
              KpiCard(title: 'Properties', value: '312', icon: Icons.apartment_rounded, accent: AppAccent.blue),
              KpiCard(title: 'Closed Deals', value: '₹42L', icon: Icons.emoji_events_rounded, accent: AppAccent.emerald, trendValue: 8),
              KpiCard(title: 'Overdue Tasks', value: '3', icon: Icons.warning_amber_rounded, accent: AppAccent.rose, trendValue: -5),
            ],
          ),
          const _Section('Cards'),
          const AppCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Rohan Mehta', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
                SizedBox(height: 4),
                Text('Looking for 3BHK in Baner, budget ₹80L–1.1Cr', style: TextStyle(color: AppColors.slate500, fontSize: 13)),
              ],
            ),
          ),
          const _Section('Text field'),
          const AppTextField(label: 'Email address', hint: 'you@company.com'),
          const SizedBox(height: AppSpacing.md),
          const AppTextField(label: 'Password', obscureText: true, errorText: 'Password must be at least 8 characters'),
          const _Section('Empty & error states'),
          SizedBox(
            height: 220,
            child: AppCard(
              child: AppEmptyState(
                icon: Icons.inbox_rounded,
                title: 'No leads yet',
                message: 'New leads assigned to you will show up here.',
                actionLabel: 'Add lead',
                onAction: () {},
              ),
            ),
          ),
          const SizedBox(height: AppSpacing.md),
          SizedBox(
            height: 220,
            child: AppCard(
              child: AppErrorState(
                title: 'Unable to load your leads',
                message: 'Check your internet connection and try again.',
                onRetry: () {},
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Section extends StatelessWidget {
  const _Section(this.title);
  final String title;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: AppSpacing.xxl, bottom: AppSpacing.md),
      child: Text(title, style: Theme.of(context).textTheme.titleLarge),
    );
  }
}
