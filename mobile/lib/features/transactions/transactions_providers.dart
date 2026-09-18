import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/network/providers.dart';
import 'data/transactions_api.dart';
import 'domain/transaction.dart';

final transactionsApiProvider = Provider<TransactionsApi>((ref) => TransactionsApi(ref.watch(apiClientProvider).dio));

final transactionsSearchProvider = StateProvider<String>((ref) => '');
final transactionsStatusFilterProvider = StateProvider<String?>((ref) => null);

class TransactionsController extends AsyncNotifier<List<CrmTransaction>> {
  @override
  Future<List<CrmTransaction>> build() {
    final q = ref.watch(transactionsSearchProvider);
    final status = ref.watch(transactionsStatusFilterProvider);
    return ref.watch(transactionsApiProvider).list(q: q, status: status);
  }

  Future<void> refresh() async {
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(build);
  }
}

final transactionsControllerProvider =
    AsyncNotifierProvider<TransactionsController, List<CrmTransaction>>(TransactionsController.new);

final transactionStatsProvider = FutureProvider<TransactionStats>((ref) => ref.watch(transactionsApiProvider).stats());
