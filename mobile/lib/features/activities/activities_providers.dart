import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/network/providers.dart';
import 'data/activities_api.dart';
import 'domain/upcoming_follow_up.dart';

final activitiesApiProvider = Provider<ActivitiesApi>((ref) => ActivitiesApi(ref.watch(apiClientProvider).dio));

class UpcomingFollowUpsController extends AsyncNotifier<List<UpcomingFollowUp>> {
  @override
  Future<List<UpcomingFollowUp>> build() => ref.watch(activitiesApiProvider).upcomingFollowUps();

  Future<void> refresh() async {
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(build);
  }
}

final upcomingFollowUpsProvider =
    AsyncNotifierProvider<UpcomingFollowUpsController, List<UpcomingFollowUp>>(UpcomingFollowUpsController.new);
