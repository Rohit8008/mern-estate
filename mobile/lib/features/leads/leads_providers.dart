import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/network/providers.dart';
import 'data/crm_api.dart';
import 'data/leads_api.dart';
import 'domain/lead.dart';

final leadsApiProvider = Provider<LeadsApi>((ref) => LeadsApi(ref.watch(apiClientProvider).dio));

final crmApiProvider = Provider<CrmApi>((ref) => CrmApi(ref.watch(apiClientProvider).dio));

/// Debounced from the search box (see LeadsListScreen) so every keystroke
/// doesn't fire a network request.
final leadSearchQueryProvider = StateProvider<String>((ref) => '');

/// null = "All statuses".
final leadStatusFilterProvider = StateProvider<String?>((ref) => null);

class LeadsListController extends AsyncNotifier<List<Lead>> {
  @override
  Future<List<Lead>> build() {
    final q = ref.watch(leadSearchQueryProvider);
    final status = ref.watch(leadStatusFilterProvider);
    return ref.watch(leadsApiProvider).list(q: q, status: status);
  }

  Future<void> refresh() async {
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(() => build());
  }
}

final leadsListControllerProvider = AsyncNotifierProvider<LeadsListController, List<Lead>>(LeadsListController.new);

final leadDetailProvider = FutureProvider.autoDispose.family<Lead, String>((ref, id) {
  return ref.watch(leadsApiProvider).getById(id);
});
