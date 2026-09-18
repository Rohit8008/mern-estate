import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/network/providers.dart';
import '../auth/auth_providers.dart';
import 'data/properties_api.dart';
import 'data/taxonomy_api.dart';
import 'domain/field_definition.dart';
import 'domain/listing.dart';
import 'domain/listing_filters.dart';

final propertiesApiProvider = Provider<PropertiesApi>((ref) => PropertiesApi(ref.watch(apiClientProvider).dio));
final taxonomyApiProvider = Provider<TaxonomyApi>((ref) => TaxonomyApi(ref.watch(apiClientProvider).dio));

/// Fetched once and kept for the session — not per listing.
final categoriesProvider = FutureProvider<List<PropertyCategory>>((ref) => ref.watch(taxonomyApiProvider).listCategories());
final propertyTypesProvider =
    FutureProvider<List<PropertyTypeDef>>((ref) => ref.watch(taxonomyApiProvider).listPropertyTypes());

final listingFiltersProvider = StateProvider<ListingFilters>((ref) => const ListingFilters());

class ListingsState {
  const ListingsState({required this.listings, required this.hasMore, required this.startIndex, this.loadingMore = false});

  final List<Listing> listings;
  final bool hasMore;
  final int startIndex;
  final bool loadingMore;

  ListingsState copyWith({List<Listing>? listings, bool? hasMore, int? startIndex, bool? loadingMore}) => ListingsState(
        listings: listings ?? this.listings,
        hasMore: hasMore ?? this.hasMore,
        startIndex: startIndex ?? this.startIndex,
        loadingMore: loadingMore ?? false,
      );
}

const _pageSize = 20;

class ListingsController extends AsyncNotifier<ListingsState> {
  @override
  Future<ListingsState> build() async {
    final filters = ref.watch(listingFiltersProvider);
    final isEmployee = ref.watch(authControllerProvider).user?.isEmployee ?? false;
    final page = await ref
        .watch(propertiesApiProvider)
        .list(isEmployee: isEmployee, filters: filters, startIndex: 0, limit: _pageSize);
    return ListingsState(listings: page.listings, hasMore: page.hasMore, startIndex: page.listings.length);
  }

  Future<void> loadMore() async {
    final current = state.valueOrNull;
    if (current == null || !current.hasMore || current.loadingMore) return;

    state = AsyncValue.data(current.copyWith(loadingMore: true));
    try {
      final filters = ref.read(listingFiltersProvider);
      final isEmployee = ref.read(authControllerProvider).user?.isEmployee ?? false;
      final page = await ref
          .read(propertiesApiProvider)
          .list(isEmployee: isEmployee, filters: filters, startIndex: current.startIndex, limit: _pageSize);
      state = AsyncValue.data(ListingsState(
        listings: [...current.listings, ...page.listings],
        hasMore: page.hasMore,
        startIndex: current.startIndex + page.listings.length,
      ));
    } catch (_) {
      // Keep what's already loaded; scrolling again will just retry.
      state = AsyncValue.data(current.copyWith(loadingMore: false));
    }
  }

  Future<void> refresh() async {
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(build);
  }
}

final listingsControllerProvider = AsyncNotifierProvider<ListingsController, ListingsState>(ListingsController.new);

final listingDetailProvider = FutureProvider.autoDispose.family<Listing, String>((ref, id) {
  return ref.watch(propertiesApiProvider).getById(id);
});
