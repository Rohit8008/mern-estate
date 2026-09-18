import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/network/providers.dart';
import 'data/buyers_api.dart';
import 'domain/buyer_requirement.dart';

final buyersApiProvider = Provider<BuyersApi>((ref) => BuyersApi(ref.watch(apiClientProvider).dio));

final buyersSearchProvider = StateProvider<String>((ref) => '');
final buyersStatusFilterProvider = StateProvider<String?>((ref) => null);

class BuyersController extends AsyncNotifier<List<BuyerRequirement>> {
  @override
  Future<List<BuyerRequirement>> build() {
    final search = ref.watch(buyersSearchProvider);
    final status = ref.watch(buyersStatusFilterProvider);
    return ref.watch(buyersApiProvider).list(search: search, status: status);
  }

  Future<void> refresh() async {
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(build);
  }
}

final buyersControllerProvider = AsyncNotifierProvider<BuyersController, List<BuyerRequirement>>(BuyersController.new);
