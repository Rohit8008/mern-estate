import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../shared/widgets/widgets.dart';
import '../domain/lead.dart';
import '../leads_providers.dart';
import 'lead_card.dart';
import 'lead_detail_screen.dart';
import 'lead_form_screen.dart';

class LeadsListScreen extends ConsumerStatefulWidget {
  const LeadsListScreen({super.key});

  @override
  ConsumerState<LeadsListScreen> createState() => _LeadsListScreenState();
}

class _LeadsListScreenState extends ConsumerState<LeadsListScreen> {
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
      ref.read(leadSearchQueryProvider.notifier).state = value.trim();
    });
  }

  /// Resets both the box and the providers it feeds — clearing only the
  /// text would leave the debounced query (and the status chip) applied.
  void _clearFilters() {
    _debounce?.cancel();
    _searchController.clear();
    ref.read(leadSearchQueryProvider.notifier).state = '';
    ref.read(leadStatusFilterProvider.notifier).state = null;
  }

  Future<void> _refresh() => ref.read(leadsListControllerProvider.notifier).refresh();

  @override
  Widget build(BuildContext context) {
    final leadsAsync = ref.watch(leadsListControllerProvider);
    final statusFilter = ref.watch(leadStatusFilterProvider);
    final filtering = statusFilter != null || ref.watch(leadSearchQueryProvider).isNotEmpty;

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(AppSpacing.lg, AppSpacing.md, AppSpacing.lg, 0),
          child: AppTextField(
            hint: 'Search leads by name, email, phone…',
            prefixIcon: Icons.search_rounded,
            controller: _searchController,
            textInputAction: TextInputAction.search,
            onChanged: _onSearchChanged,
          ),
        ),
        const SizedBox(height: AppSpacing.sm),
        SizedBox(
          height: filterChipRowHeight(context),
          child: ListView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
            children: [
              _FilterChip(label: 'All', selected: statusFilter == null, onTap: () => ref.read(leadStatusFilterProvider.notifier).state = null),
              for (final status in leadStatusOrder) ...[
                const SizedBox(width: AppSpacing.sm),
                _FilterChip(
                  label: leadStatusStyle(status).label,
                  selected: statusFilter == status,
                  color: leadStatusStyle(status).color,
                  onTap: () => ref.read(leadStatusFilterProvider.notifier).state = status,
                ),
              ],
            ],
          ),
        ),
        const SizedBox(height: AppSpacing.sm),
        Expanded(
          child: leadsAsync.when(
            loading: () => const AppPageLoader(),
            error: (error, _) => AppErrorState(
              title: 'Unable to load your leads',
              message: 'Check your internet connection and try again.',
              onRetry: _refresh,
              onRefresh: _refresh,
            ),
            data: (leads) => leads.isEmpty
                ? (filtering
                    ? AppEmptyState(
                        icon: Icons.search_off_rounded,
                        title: 'No matching leads',
                        message: 'Nothing matches your search or status filter.',
                        actionLabel: 'Clear filters',
                        onAction: _clearFilters,
                        onRefresh: _refresh,
                      )
                    : AppEmptyState(
                        icon: Icons.person_search_rounded,
                        title: 'No leads yet',
                        message: 'New leads assigned to you will show up here.',
                        actionLabel: 'Add lead',
                        onAction: () => _openCreate(context),
                        onRefresh: _refresh,
                      ))
                : RefreshIndicator(
                    onRefresh: _refresh,
                    child: ListView.separated(
                      padding: const EdgeInsets.fromLTRB(AppSpacing.lg, 0, AppSpacing.lg, AppSpacing.xxxl),
                      itemCount: leads.length,
                      separatorBuilder: (_, __) => const SizedBox(height: AppSpacing.sm),
                      itemBuilder: (context, index) {
                        final lead = leads[index];
                        return LeadCard(lead: lead, onTap: () => _openDetail(context, lead));
                      },
                    ),
                  ),
          ),
        ),
      ],
    );
  }

  void _openCreate(BuildContext context) {
    Navigator.of(context).push(MaterialPageRoute(builder: (_) => const LeadFormScreen()));
  }

  void _openDetail(BuildContext context, Lead lead) {
    Navigator.of(context).push(MaterialPageRoute(builder: (_) => LeadDetailScreen(leadId: lead.id)));
  }
}

class _FilterChip extends StatelessWidget {
  const _FilterChip({required this.label, required this.selected, required this.onTap, this.color});

  final String label;
  final bool selected;
  final VoidCallback onTap;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final chipColor = color ?? (dark ? AppColors.indigo600 : AppColors.slate900);
    return Material(
      color: selected ? chipColor : (dark ? AppColors.slate900 : AppColors.white),
      borderRadius: BorderRadius.circular(999),
      child: InkWell(
        borderRadius: BorderRadius.circular(999),
        onTap: onTap,
        child: Container(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(999),
            border: Border.all(color: selected ? chipColor : (dark ? AppColors.slate700 : AppColors.slate200)),
          ),
          alignment: Alignment.center,
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          child: Text(label, style: TextStyle(color: selected ? AppColors.white : (dark ? AppColors.slate300 : AppColors.slate600), fontSize: 12.5, fontWeight: FontWeight.w600)),
        ),
      ),
    );
  }
}
