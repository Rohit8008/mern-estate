import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/network/providers.dart';
import 'data/dashboard_api.dart';
import 'domain/dashboard_analytics.dart';

final dashboardApiProvider = Provider<DashboardApi>((ref) => DashboardApi(ref.watch(apiClientProvider).dio));

class DashboardController extends AsyncNotifier<DashboardAnalytics> {
  @override
  Future<DashboardAnalytics> build() => ref.watch(dashboardApiProvider).fetchAnalytics();

  Future<void> refresh() async {
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(() => ref.read(dashboardApiProvider).fetchAnalytics());
  }
}

final dashboardControllerProvider = AsyncNotifierProvider<DashboardController, DashboardAnalytics>(DashboardController.new);
