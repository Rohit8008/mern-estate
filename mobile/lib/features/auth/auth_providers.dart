import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/network/providers.dart';
import '../../core/push/push_providers.dart';
import '../legal/data/legal_api.dart';
import 'application/auth_controller.dart';
import 'application/auth_state.dart';
import 'data/auth_api.dart';

final authApiProvider = Provider<AuthApi>((ref) => AuthApi(ref.watch(apiClientProvider).dio));

final legalApiProvider = Provider<LegalApi>((ref) => LegalApi(ref.watch(apiClientProvider).dio));

final authControllerProvider = StateNotifierProvider<AuthController, AuthState>((ref) {
  final apiClient = ref.watch(apiClientProvider);
  final controller = AuthController(
    ref.watch(authApiProvider),
    apiClient,
    ref.watch(legalApiProvider),
    beforeSignOut: () => ref.read(pushServiceProvider).unregister(),
  );
  // A dead refresh token (session expired/revoked) flips the app straight to
  // the login screen instead of leaving providers stuck looping on 401s.
  apiClient.onSessionExpired = controller.handleSessionExpired;
  controller.bootstrap();
  return controller;
});
