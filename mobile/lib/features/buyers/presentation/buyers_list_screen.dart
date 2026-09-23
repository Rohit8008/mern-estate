import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/utils/format.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/utils/contact_launcher.dart';
import '../../../shared/widgets/widgets.dart';
import '../buyers_providers.dart';
import '../domain/buyer_requirement.dart';
import 'buyer_form_screen.dart';


AppBadgeVariant _buyerStatusVariant(String status) => switch (status) {
      'active' => AppBadgeVariant.success,
      'matched' => AppBadgeVariant.info,
      'closed' => AppBadgeVariant.slate,
      _ => AppBadgeVariant.defaultVariant,
    };

class BuyersListScreen extends ConsumerStatefulWidget {
  const BuyersListScreen({super.key});

  @override
  ConsumerState<BuyersListScreen> createState() => _BuyersListScreenState();
}

class _BuyersListScreenState extends ConsumerState<BuyersListScreen> {
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
      ref.read(buyersSearchProvider.notifier).state = value.trim();
    });
  }

  @override
  Widget build(BuildContext context) {
    final buyersAsync = ref.watch(buyersControllerProvider);
    final statusFilter = ref.watch(buyersStatusFilterProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Buyer Requirements'),
        actions: [
          IconButton(icon: const Icon(Icons.add_rounded), onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const BuyerFormScreen()))),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(AppSpacing.lg, AppSpacing.md, AppSpacing.lg, 0),
            child: AppTextField(hint: 'Search buyers…', prefixIcon: Icons.search_rounded, controller: _searchController, onChanged: _onSearchChanged),
          ),
          const SizedBox(height: AppSpacing.sm),
          SizedBox(
            height: 40,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
              children: [
                _FilterChip(label: 'All', selected: statusFilter == null, onTap: () => ref.read(buyersStatusFilterProvider.notifier).state = null),
                for (final status in buyerRequirementStatuses) ...[
                  const SizedBox(width: AppSpacing.sm),
                  _FilterChip(label: buyerStatusLabel(status), selected: statusFilter == status, onTap: () => ref.read(buyersStatusFilterProvider.notifier).state = status),
                ],
              ],
            ),
          ),
          const SizedBox(height: AppSpacing.sm),
          Expanded(
            child: buyersAsync.when(
              loading: () => const AppPageLoader(),
              error: (error, _) => AppErrorState(title: 'Unable to load buyer requirements', onRetry: () => ref.read(buyersControllerProvider.notifier).refresh()),
              data: (buyers) => buyers.isEmpty
                  ? AppEmptyState(
                      icon: Icons.fact_check_outlined,
                      title: 'No buyer requirements yet',
                      actionLabel: 'Add requirement',
                      onAction: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const BuyerFormScreen())),
                    )
                  : RefreshIndicator(
                      onRefresh: () => ref.read(buyersControllerProvider.notifier).refresh(),
                      child: ListView.separated(
                        padding: const EdgeInsets.fromLTRB(AppSpacing.lg, 0, AppSpacing.lg, AppSpacing.xxxl),
                        itemCount: buyers.length,
                        separatorBuilder: (_, __) => const SizedBox(height: AppSpacing.sm),
                        itemBuilder: (context, index) => _BuyerCard(buyer: buyers[index]),
                      ),
                    ),
            ),
          ),
        ],
      ),
    );
  }
}

class _BuyerCard extends ConsumerWidget {
  const _BuyerCard({required this.buyer});
  final BuyerRequirement buyer;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final budget = (buyer.minPrice != null || buyer.maxPrice != null)
        ? '${buyer.minPrice != null ? Fmt.moneyCompact(buyer.minPrice) : 'Any'} – ${buyer.maxPrice != null && buyer.maxPrice! > 0 ? Fmt.moneyCompact(buyer.maxPrice) : 'Any'}'
        : null;

    return AppCard(
      onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => BuyerFormScreen(existing: buyer))),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Expanded(child: Text(buyer.buyerName, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14))),
              AppBadge(label: buyerStatusLabel(buyer.status), variant: _buyerStatusVariant(buyer.status)),
            ],
          ),
          if (buyer.preferredLocation != null && buyer.preferredLocation!.isNotEmpty) ...[
            const SizedBox(height: 2),
            Text(buyer.preferredLocation!, style: const TextStyle(color: AppColors.slate500, fontSize: 12.5)),
          ],
          if (budget != null) ...[
            const SizedBox(height: 6),
            Text(budget, style: TextStyle(fontWeight: FontWeight.w600, fontSize: 12.5, color: AppColors.moneyInk(context))),
          ],
          if (buyer.buyerPhone != null && buyer.buyerPhone!.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.sm),
            Row(
              children: [
                _quickAction(Icons.call_outlined, AppColors.emerald600, () => ContactLauncher.call(buyer.buyerPhone!)),
                const SizedBox(width: AppSpacing.sm),
                _quickAction(Icons.chat_outlined, const Color(0xFF25D366), () => ContactLauncher.whatsapp(buyer.buyerPhone!)),
              ],
            ),
          ],
        ],
      ),
    );
  }

  Widget _quickAction(IconData icon, Color color, VoidCallback onTap) {
    return Material(
      color: color.withOpacity(0.1),
      shape: const CircleBorder(),
      child: InkWell(customBorder: const CircleBorder(), onTap: onTap, child: Padding(padding: const EdgeInsets.all(7), child: Icon(icon, size: 15, color: color))),
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
    final dark = Theme.of(context).brightness == Brightness.dark;
    final on = dark ? AppColors.indigo600 : AppColors.slate900;
    return Material(
      color: selected ? on : (dark ? AppColors.slate900 : AppColors.white),
      borderRadius: BorderRadius.circular(999),
      child: InkWell(
        borderRadius: BorderRadius.circular(999),
        onTap: onTap,
        child: Container(
          decoration: BoxDecoration(borderRadius: BorderRadius.circular(999), border: Border.all(color: selected ? on : (dark ? AppColors.slate700 : AppColors.slate200))),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          child: Text(label, style: TextStyle(color: selected ? AppColors.white : (dark ? AppColors.slate300 : AppColors.slate600), fontSize: 12.5, fontWeight: FontWeight.w600)),
        ),
      ),
    );
  }
}
