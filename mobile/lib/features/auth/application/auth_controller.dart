import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/errors/app_failure.dart';
import '../../../core/logging/app_logger.dart';
import '../../../core/network/api_client.dart';
import '../../legal/data/legal_api.dart';
import '../data/auth_api.dart';
import '../domain/app_user.dart';
import 'auth_state.dart';

class AuthController extends StateNotifier<AuthState> {
  AuthController(this._api, this._apiClient, this._legalApi, {Future<void> Function()? beforeSignOut})
      : _beforeSignOut = beforeSignOut,
        super(const AuthState.bootstrapping());

  final AuthApi _api;
  final ApiClient _apiClient;
  final LegalApi _legalApi;
  final Future<void> Function()? _beforeSignOut;

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
    final AppUser user;
    try {
      user = await _api.signIn(email: email, password: password);
    } on AppFailure catch (f) {
      // Never the email: the type and status say enough.
      appLog.info('login failed', fields: {'failure_type': f.type.name, 'status': f.statusCode});
      rethrow;
    }
    appLog.info('login success', fields: {'role': user.role});
    _apiClient.armSessionGuard(); // a fresh session can expire again later
    state = AuthState.authenticated(user, pendingLegalVersion: await _pendingLegalVersion());
  }

  /// The session is confirmed dead (the refresh token was rejected). Clear the
  /// local cookies and drop to unauthenticated so the router shows /login — the
  /// one place a dead session should ever land. Wired to
  /// [ApiClient.onSessionExpired]; idempotent, so the burst of 401s a dead
  /// session produces only logs the user out once.
  void handleSessionExpired() {
    if (state.status == AuthStatus.unauthenticated) return;
    _apiClient.clearSession();
    appLog.info('session expired — signed out');
    state = const AuthState.unauthenticated();
  }

  /// Confirm the session is still alive against the server. Used right after a
  /// biometric unlock, so fingerprint can never reveal a session that has since
  /// expired — if `me()` comes back as an auth failure the user is sent to
  /// login instead of into a dead app. Any other error (offline) is ignored.
  Future<void> revalidate() async {
    if (state.status != AuthStatus.authenticated) return;
    try {
      final user = await _api.me();
      applyUser(user);
    } on AppFailure catch (f) {
      if (f.type == AppFailureType.authentication) handleSessionExpired();
    }
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
    // While the session still exists: the server only accepts a device
    // removal from the person it belongs to.
    try {
      await _beforeSignOut?.call();
    } catch (_) {}
    try {
      await _api.signOut();
    } catch (_) {
      // Sign-out must never strand the user in a logged-in UI over a
      // network blip — clear local state regardless of server outcome.
    }
    await _apiClient.clearSession();
    appLog.info('logout');
    state = const AuthState.unauthenticated();
  }
}
