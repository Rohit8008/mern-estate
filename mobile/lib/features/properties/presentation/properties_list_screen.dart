import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../shared/widgets/widgets.dart';
import '../domain/listing.dart';
import '../properties_providers.dart';
import 'properties_filter_sheet.dart';
import 'properties_map_view.dart';
import 'property_card.dart';
import 'property_detail_screen.dart';

class PropertiesListScreen extends ConsumerStatefulWidget {
  const PropertiesListScreen({super.key});

  @override
  ConsumerState<PropertiesListScreen> createState() => _PropertiesListScreenState();
}

enum _ViewMode { list, map }

class _PropertiesListScreenState extends ConsumerState<PropertiesListScreen> {
  final _searchController = TextEditingController();
  final _scrollController = ScrollController();
  Timer? _debounce;
  _ViewMode _mode = _ViewMode.list;

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScroll);
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _searchController.dispose();
    _scrollController.removeListener(_onScroll);
    _scrollController.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (_scrollController.position.pixels >= _scrollController.position.maxScrollExtent - 400) {
      ref.read(listingsControllerProvider.notifier).loadMore();
    }
  }

  void _onSearchChanged(String value) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 350), () {
      final current = ref.read(listingFiltersProvider);
      ref.read(listingFiltersProvider.notifier).state = current.copyWith(searchTerm: value.trim());
    });
  }

  Future<void> _openFilters() async {
    final current = ref.read(listingFiltersProvider);
    final result = await showPropertiesFilterSheet(context, current);
    if (result != null) ref.read(listingFiltersProvider.notifier).state = result;
  }

  @override
  Widget build(BuildContext context) {
    final listingsAsync = ref.watch(listingsControllerProvider);
    final filters = ref.watch(listingFiltersProvider);

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(AppSpacing.lg, AppSpacing.md, AppSpacing.lg, 0),
          child: Row(
            children: [
              Expanded(
                child: AppTextField(
                  hint: 'Search properties…',
                  prefixIcon: Icons.search_rounded,
                  controller: _searchController,
                  onChanged: _onSearchChanged,
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              _IconToggleButton(
                icon: Icons.tune_rounded,
                active: !filters.isEmpty,
                onTap: _openFilters,
              ),
              const SizedBox(width: AppSpacing.sm),
              _IconToggleButton(
                icon: _mode == _ViewMode.list ? Icons.map_outlined : Icons.view_list_rounded,
                active: false,
                onTap: () => setState(() => _mode = _mode == _ViewMode.list ? _ViewMode.map : _ViewMode.list),
              ),
            ],
          ),
        ),
        const SizedBox(height: AppSpacing.sm),
        Expanded(
          child: listingsAsync.when(
            loading: () => const AppPageLoader(),
            error: (error, _) => AppErrorState(
              title: 'Unable to load properties',
              message: 'Check your internet connection and try again.',
              onRetry: () => ref.read(listingsControllerProvider.notifier).refresh(),
            ),
            data: (state) {
              if (state.listings.isEmpty) {
                return const AppEmptyState(icon: Icons.apartment_outlined, title: 'No properties found', message: 'Try adjusting your search or filters.');
              }
              if (_mode == _ViewMode.map) {
                return PropertiesMapView(listings: state.listings, onOpenListing: _openDetail);
              }
              return RefreshIndicator(
                onRefresh: () => ref.read(listingsControllerProvider.notifier).refresh(),
                child: GridView.builder(
                  controller: _scrollController,
                  padding: const EdgeInsets.fromLTRB(AppSpacing.lg, 0, AppSpacing.lg, AppSpacing.xxxl),
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 2,
                    mainAxisSpacing: AppSpacing.md,
                    crossAxisSpacing: AppSpacing.md,
                    childAspectRatio: 0.72,
                  ),
                  itemCount: state.listings.length + (state.hasMore ? 2 : 0),
                  itemBuilder: (context, index) {
                    if (index >= state.listings.length) {
                      return const Center(child: Padding(padding: EdgeInsets.all(AppSpacing.lg), child: CircularProgressIndicator(strokeWidth: 2)));
                    }
                    final listing = state.listings[index];
                    return PropertyCard(listing: listing, onTap: () => _openDetail(listing));
                  },
                ),
              );
            },
          ),
        ),
      ],
    );
  }

  void _openDetail(Listing listing) {
    Navigator.of(context).push(MaterialPageRoute(builder: (_) => PropertyDetailScreen(listingId: listing.id)));
  }
}

class _IconToggleButton extends StatelessWidget {
  const _IconToggleButton({required this.icon, required this.active, required this.onTap});
  final IconData icon;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    return Material(
      color: active ? AppColors.indigo600 : (dark ? AppColors.slate900 : AppColors.white),
      borderRadius: BorderRadius.circular(10),
      child: InkWell(
        borderRadius: BorderRadius.circular(10),
        onTap: onTap,
        child: Container(
          width: 44,
          height: 44,
          decoration: BoxDecoration(borderRadius: BorderRadius.circular(10), border: Border.all(color: active ? AppColors.indigo600 : (dark ? AppColors.slate700 : AppColors.slate200))),
          child: Icon(icon, size: 20, color: active ? AppColors.white : (dark ? AppColors.slate300 : AppColors.slate600)),
        ),
      ),
    );
  }
}
