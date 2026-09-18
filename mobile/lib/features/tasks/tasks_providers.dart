import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/network/providers.dart';
import 'data/tasks_api.dart';
import 'domain/crm_task.dart';

final tasksApiProvider = Provider<TasksApi>((ref) => TasksApi(ref.watch(apiClientProvider).dio));

final clientTasksProvider = FutureProvider.autoDispose.family<List<CrmTask>, String>((ref, clientId) {
  return ref.watch(tasksApiProvider).listForClient(clientId);
});

final tasksStatusFilterProvider = StateProvider<String?>((ref) => null);

class TasksListController extends AsyncNotifier<List<CrmTask>> {
  @override
  Future<List<CrmTask>> build() {
    final status = ref.watch(tasksStatusFilterProvider);
    return ref.watch(tasksApiProvider).list(status: status);
  }

  Future<void> refresh() async {
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(build);
  }
}

final tasksListControllerProvider = AsyncNotifierProvider<TasksListController, List<CrmTask>>(TasksListController.new);
