import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../shared/widgets/widgets.dart';
import '../domain/listing.dart';
import '../domain/listing_filters.dart';
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

  /// Resets the search box and every sheet filter in one go.
  void _clearFilters() {
    _debounce?.cancel();
    _searchController.clear();
    ref.read(listingFiltersProvider.notifier).state = const ListingFilters();
  }

  Future<void> _refresh() => ref.read(listingsControllerProvider.notifier).refresh();

  @override
  Widget build(BuildContext context) {
    final listingsAsync = ref.watch(listingsControllerProvider);
    final filters = ref.watch(listingFiltersProvider);
    // Not `filters.isEmpty`: clearing the search box leaves searchTerm as ''
    // rather than null, which is no filter at all.
    final filtering = filters.toQueryParams().isNotEmpty;

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
                  textInputAction: TextInputAction.search,
                  onChanged: _onSearchChanged,
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              _IconToggleButton(
                icon: Icons.tune_rounded,
                tooltip: 'Filters',
                active: filtering,
                onTap: _openFilters,
              ),
              const SizedBox(width: AppSpacing.sm),
              _IconToggleButton(
                icon: _mode == _ViewMode.list ? Icons.map_outlined : Icons.view_list_rounded,
                tooltip: _mode == _ViewMode.list ? 'Show map' : 'Show list',
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
              onRetry: _refresh,
              onRefresh: _refresh,
            ),
            data: (state) {
              if (state.listings.isEmpty) {
                return filtering
                    ? AppEmptyState(
                        icon: Icons.search_off_rounded,
                        title: 'No matching properties',
                        message: 'Nothing matches your search or filters.',
                        actionLabel: 'Clear filters',
                        onAction: _clearFilters,
                        onRefresh: _refresh,
                      )
                    : AppEmptyState(
                        icon: Icons.apartment_outlined,
                        title: 'No properties yet',
                        message: 'Properties you add or are assigned will show up here.',
                        onRefresh: _refresh,
                      );
              }
              if (_mode == _ViewMode.map) {
                return PropertiesMapView(listings: state.listings, onOpenListing: _openDetail);
              }
              // Cell height = photo (16:10 of the cell width) + the text block
              // at the phone's font size. A fixed aspect ratio clipped the
              // card's last line under a larger system font.
              final width = MediaQuery.sizeOf(context).width;
              final cellWidth = (width - AppSpacing.lg * 2 - AppSpacing.md) / 2;
              final textBlock = MediaQuery.textScalerOf(context).scale(100);
              final cellHeight = cellWidth * 10 / 16 + AppSpacing.md * 2 + textBlock + 4;
              return RefreshIndicator(
                onRefresh: _refresh,
                child: GridView.builder(
                  controller: _scrollController,
                  padding: const EdgeInsets.fromLTRB(AppSpacing.lg, 0, AppSpacing.lg, AppSpacing.xxxl),
                  gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 2,
                    mainAxisSpacing: AppSpacing.md,
                    crossAxisSpacing: AppSpacing.md,
                    mainAxisExtent: cellHeight,
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
  const _IconToggleButton({required this.icon, required this.tooltip, required this.active, required this.onTap});
  final IconData icon;
  final String tooltip;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    return Tooltip(
      message: tooltip,
      child: Material(
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
      ),
    );
  }
}
