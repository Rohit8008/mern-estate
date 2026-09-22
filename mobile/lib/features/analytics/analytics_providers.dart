import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/network/providers.dart';
import 'data/analytics_api.dart';
import 'domain/analytics_report.dart';

final analyticsApiProvider = Provider<AnalyticsApi>((ref) => AnalyticsApi(ref.watch(apiClientProvider).dio));

class AnalyticsController extends AsyncNotifier<AnalyticsReport> {
  @override
  Future<AnalyticsReport> build() => ref.watch(analyticsApiProvider).report();

  Future<void> refresh() async {
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(build);
  }
}

final analyticsControllerProvider =
    AsyncNotifierProvider<AnalyticsController, AnalyticsReport>(AnalyticsController.new);
