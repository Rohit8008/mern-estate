import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/network/providers.dart';
import '../legal/data/legal_api.dart';
import 'application/auth_controller.dart';
import 'application/auth_state.dart';
import 'data/auth_api.dart';

final authApiProvider = Provider<AuthApi>((ref) => AuthApi(ref.watch(apiClientProvider).dio));

final legalApiProvider = Provider<LegalApi>((ref) => LegalApi(ref.watch(apiClientProvider).dio));

final authControllerProvider = StateNotifierProvider<AuthController, AuthState>((ref) {
  final controller = AuthController(
    ref.watch(authApiProvider),
    ref.watch(apiClientProvider),
    ref.watch(legalApiProvider),
  );
  controller.bootstrap();
  return controller;
});
