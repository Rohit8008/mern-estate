import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/network/providers.dart';
import 'data/reports_api.dart';
import 'domain/report.dart';

final reportsApiProvider = Provider<ReportsApi>((ref) => ReportsApi(ref.watch(apiClientProvider).dio));

class ReportsController extends AsyncNotifier<ReportsOverview> {
  @override
  Future<ReportsOverview> build() => ref.watch(reportsApiProvider).overview();

  Future<void> refresh() async {
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(build);
  }
}

final reportsControllerProvider = AsyncNotifierProvider<ReportsController, ReportsOverview>(ReportsController.new);
