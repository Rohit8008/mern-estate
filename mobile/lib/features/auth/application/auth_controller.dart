import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/errors/app_failure.dart';
import '../../../core/network/api_client.dart';
import '../data/auth_api.dart';
import '../domain/app_user.dart';
import 'auth_state.dart';

class AuthController extends StateNotifier<AuthState> {
  AuthController(this._api, this._apiClient) : super(const AuthState.bootstrapping());

  final AuthApi _api;
  final ApiClient _apiClient;

  Future<void> bootstrap() async {
    state = const AuthState.bootstrapping();
    try {
      final user = await _api.me();
      state = AuthState.authenticated(user);
    } on AppFailure catch (f) {
      state = f.type == AppFailureType.authentication
          ? const AuthState.unauthenticated()
          : AuthState.bootstrapError(f.message);
    }
  }

  /// Throws AppFailure on failure — the login screen owns its own
  /// submitting/error UI rather than this controller tracking it globally.
  Future<void> signIn({required String email, required String password}) async {
    final user = await _api.signIn(email: email, password: password);
    state = AuthState.authenticated(user);
  }

  /// Replace the signed-in user without touching the auth state machine.
  ///
  /// Deliberately not `bootstrap()`: that transitions through
  /// `bootstrapping`, which the router treats as "redirect to /splash" — so
  /// saving your profile would throw you out of the screen you were editing.
  void applyUser(AppUser user) {
    if (state.status == AuthStatus.authenticated) {
      state = AuthState.authenticated(user);
    }
  }

  Future<void> signOut() async {
    try {
      await _api.signOut();
    } catch (_) {
      // Sign-out must never strand the user in a logged-in UI over a
      // network blip — clear local state regardless of server outcome.
    }
    await _apiClient.clearSession();
    state = const AuthState.unauthenticated();
  }
}
