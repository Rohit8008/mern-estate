import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/network/providers.dart';
import 'data/settings_api.dart';
import 'domain/notification_preferences.dart';

final settingsApiProvider = Provider<SettingsApi>((ref) => SettingsApi(ref.watch(apiClientProvider).dio));

class SettingsController extends AsyncNotifier<NotificationPreferences> {
  @override
  Future<NotificationPreferences> build() => ref.watch(settingsApiProvider).preferences();

  /// Optimistic: the switch moves immediately and is put back if the save
  /// fails. A toggle that waits on a round trip before moving reads as broken.
  /// Named `applyPreferences`, not `update` — AsyncNotifier already defines
  /// an `update` with a different signature, and overriding it silently
  /// breaks the base class contract.
  Future<void> applyPreferences(NotificationPreferences next) async {
    final previous = state.valueOrNull;
    state = AsyncValue.data(next);
    try {
      await ref.read(settingsApiProvider).save(next);
    } catch (e) {
      if (previous != null) state = AsyncValue.data(previous);
      rethrow;
    }
  }

  Future<void> refresh() async {
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(build);
  }
}

final settingsControllerProvider =
    AsyncNotifierProvider<SettingsController, NotificationPreferences>(SettingsController.new);
