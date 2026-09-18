import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/network/providers.dart';
import 'data/owners_api.dart';
import 'domain/owner.dart';

final ownersApiProvider = Provider<OwnersApi>((ref) => OwnersApi(ref.watch(apiClientProvider).dio));

final ownersSearchProvider = StateProvider<String>((ref) => '');

class OwnersController extends AsyncNotifier<List<PropertyOwner>> {
  @override
  Future<List<PropertyOwner>> build() {
    final q = ref.watch(ownersSearchProvider);
    return ref.watch(ownersApiProvider).list(q: q);
  }

  Future<void> refresh() async {
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(build);
  }
}

final ownersControllerProvider = AsyncNotifierProvider<OwnersController, List<PropertyOwner>>(OwnersController.new);
