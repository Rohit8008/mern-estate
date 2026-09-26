import '../domain/app_user.dart';

enum AuthStatus {
  /// Initial /api/user/me call hasn't resolved yet.
  bootstrapping,

  /// Session confirmed valid.
  authenticated,

  /// No session, or the session was explicitly rejected (401) — show login.
  unauthenticated,

  /// Bootstrap failed for a reason that ISN'T "you're logged out" (offline,
  /// 5xx) — show a retry state instead of bouncing to login, mirroring
  /// AuthBootstrap.jsx not clearing the session on network/5xx/429.
  bootstrapError,
}

class AuthState {
  const AuthState._({required this.status, this.user, this.errorMessage, this.pendingLegalVersion});

  const AuthState.bootstrapping() : this._(status: AuthStatus.bootstrapping);

  /// [pendingLegalVersion] is set when the server says this user has not yet
  /// accepted the Terms version in force; the router holds them on the
  /// acceptance step until it clears.
  const AuthState.authenticated(AppUser user, {String? pendingLegalVersion})
      : this._(status: AuthStatus.authenticated, user: user, pendingLegalVersion: pendingLegalVersion);
  const AuthState.unauthenticated() : this._(status: AuthStatus.unauthenticated);
  const AuthState.bootstrapError(String message) : this._(status: AuthStatus.bootstrapError, errorMessage: message);

  final AuthStatus status;
  final AppUser? user;
  final String? errorMessage;
  final String? pendingLegalVersion;

  bool get needsLegalAcceptance => status == AuthStatus.authenticated && pendingLegalVersion != null;
}
