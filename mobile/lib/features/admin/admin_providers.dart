import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/network/providers.dart';
import 'data/admin_api.dart';
import 'domain/team_member.dart';

final adminApiProvider = Provider<AdminApi>((ref) => AdminApi(ref.watch(apiClientProvider).dio));

class AdminController extends AsyncNotifier<AdminOverview> {
  @override
  Future<AdminOverview> build() => ref.watch(adminApiProvider).overview();

  /// Optimistic, with a rollback: the server refuses some transitions
  /// (your own account, another admin) and the row must go back rather than
  /// sit there claiming a change that did not happen.
  Future<void> setStatus(TeamMember member, String status) async {
    final current = state.valueOrNull;
    if (current == null) return;

    state = AsyncValue.data(current.copyWith(
      members: [
        for (final m in current.members) m.id == member.id ? m.copyWith(status: status) : m,
      ],
    ));

    try {
      await ref.read(adminApiProvider).setStatus(member.id, status);
    } catch (_) {
      state = AsyncValue.data(current);
      rethrow;
    }
  }

  Future<void> refresh() async {
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(build);
  }
}

final adminControllerProvider = AsyncNotifierProvider<AdminController, AdminOverview>(AdminController.new);
