import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/errors/app_failure.dart';
import '../../../core/network/api_client.dart';
import '../../legal/data/legal_api.dart';
import '../data/auth_api.dart';
import '../domain/app_user.dart';
import 'auth_state.dart';

class AuthController extends StateNotifier<AuthState> {
  AuthController(this._api, this._apiClient, this._legalApi) : super(const AuthState.bootstrapping());

  final AuthApi _api;
  final ApiClient _apiClient;
  final LegalApi _legalApi;

  /// How long the legal check may hold up sign-in before we let the user in
  /// anyway and ask again next launch.
  static const _legalCheckTimeout = Duration(seconds: 8);

  Future<void> bootstrap() async {
    state = const AuthState.bootstrapping();
    try {
      final user = await _api.me();
      state = AuthState.authenticated(user, pendingLegalVersion: await _pendingLegalVersion());
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
    state = AuthState.authenticated(user, pendingLegalVersion: await _pendingLegalVersion());
  }

  /// The Terms version this user still has to accept, or null.
  ///
  /// Fails OPEN: if the check itself cannot complete (offline, 5xx, an
  /// older backend without the endpoint) the user is let in and asked again
  /// on the next launch. Locking someone out of their own CRM because a
  /// status call failed would be worse than a delayed prompt.
  Future<String?> _pendingLegalVersion() async {
    try {
      final status = await _legalApi.status().timeout(_legalCheckTimeout);
      return status.required && status.version.isNotEmpty ? status.version : null;
    } catch (_) {
      return null;
    }
  }

  /// Records acceptance of the version the acceptance step is showing.
  ///
  /// Throws [LegalVersionChanged] when the server moved on to a newer
  /// version meanwhile — by then the state already carries that version, so
  /// the screen only has to clear its checkbox and show it again.
  Future<void> acceptLegal() async {
    final current = state;
    final version = current.pendingLegalVersion;
    final user = current.user;
    if (current.status != AuthStatus.authenticated || version == null || user == null) return;

    try {
      await _legalApi.accept(version);
      if (state.status == AuthStatus.authenticated) state = AuthState.authenticated(state.user ?? user);
    } on LegalVersionChanged catch (changed) {
      String? next;
      try {
        final status = await _legalApi.status().timeout(_legalCheckTimeout);
        next = status.required ? status.version : null;
      } catch (_) {
        next = changed.version;
      }
      if (state.status == AuthStatus.authenticated) {
        state = AuthState.authenticated(state.user ?? user, pendingLegalVersion: next ?? changed.version ?? version);
      }
      rethrow;
    }
  }

  /// Replace the signed-in user without touching the auth state machine.
  ///
  /// Deliberately not `bootstrap()`: that transitions through
  /// `bootstrapping`, which the router treats as "redirect to /splash" — so
  /// saving your profile would throw you out of the screen you were editing.
  void applyUser(AppUser user) {
    if (state.status == AuthStatus.authenticated) {
      state = AuthState.authenticated(user, pendingLegalVersion: state.pendingLegalVersion);
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
