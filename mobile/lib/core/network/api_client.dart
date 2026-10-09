import 'dart:async';
import 'dart:io';

import 'package:cookie_jar/cookie_jar.dart';
import 'package:dio/dio.dart';
import 'package:dio_cookie_manager/dio_cookie_manager.dart';
import 'package:flutter/foundation.dart';
import 'package:path_provider/path_provider.dart';

import '../logging/app_logger.dart';
import '../logging/logging_interceptor.dart';
import 'workspace_store.dart';

/// Wraps Dio with a disk-persisted cookie jar (the backend is 100%
/// httpOnly-cookie JWT auth — access_token/refresh_token — with no
/// bearer-token mode, so this is what lets the session survive app
/// restarts) and a refresh-on-401 interceptor mirroring the web app's
/// fetchWithRefresh() in utils/http.js.
class ApiClient {
  ApiClient._(this.dio, this._cookieJar, this.workspace, this._guard) {
    dio.interceptors.insert(0, _WorkspaceInterceptor(workspace));
  }

  final Dio dio;
  final CookieJar _cookieJar;
  final _SessionGuard _guard;

  /// Which agency to sign in to; sent as `x-tenant`.
  final WorkspaceStore workspace;

  /// Called ONCE when the session is definitively dead — a `/api/auth/refresh`
  /// that the server rejects with 401/403 (not a transient network error). The
  /// app wires this to AuthController so a dead session flips straight to the
  /// login screen instead of leaving every provider stuck retrying 401s (and
  /// instead of the biometric lock unlocking into a session that no longer
  /// exists). Fires again only after a fresh sign-in resets the guard.
  set onSessionExpired(void Function() cb) => _guard.onExpired = cb;

  /// Re-arm the guard after a successful sign-in, so a later expiry fires.
  void armSessionGuard() => _guard.reset();

  static Future<ApiClient> create({required String baseUrl}) async {
    final dio = Dio(BaseOptions(
      baseUrl: baseUrl,
      connectTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 20),
      headers: {
        'Content-Type': 'application/json',
        // Tells the server this client cannot decode `_enc` (encrypted) API
        // responses, so it sends plaintext even when ENCRYPT_API_RESPONSES is
        // on. Skipped on web: a custom header there triggers a CORS preflight
        // the API does not allow, and the web build is a browser that can decode.
        if (!kIsWeb) 'X-Client': 'mobile',
      },
    ));

    final guard = _SessionGuard();

    if (kIsWeb) {
      // On web there is no dart:io / path_provider (getApplicationSupportDirectory
      // throws MissingPluginException) — and none of this is needed anyway:
      // the browser already stores/sends httpOnly Set-Cookie cookies itself.
      // We only need to opt the XHR/fetch adapter into sending credentials.
      (dio.httpClientAdapter as dynamic).withCredentials = true;
      dio.interceptors.add(_CsrfInterceptor(dio));
      dio.interceptors.add(_RefreshOn401Interceptor(dio, guard));
      dio.interceptors.add(LoggingInterceptor());
      return ApiClient._(dio, CookieJar(), WorkspaceStore.memory(), guard);
    }

    final supportDir = await getApplicationSupportDirectory();
    final cookieDir = Directory('${supportDir.path}/.cookies');
    if (!cookieDir.existsSync()) cookieDir.createSync(recursive: true);
    final cookieJar = PersistCookieJar(storage: FileStorage(cookieDir.path));
    dio.interceptors.add(CookieManager(cookieJar));
    dio.interceptors.add(_CsrfInterceptor(dio));
    dio.interceptors.add(_RefreshOn401Interceptor(dio, guard));
    // Last, so it records the outcome after refresh/CSRF retries.
    dio.interceptors.add(LoggingInterceptor());

    return ApiClient._(dio, cookieJar, await WorkspaceStore.open(supportDir), guard);
  }

  /// Test-only entry point — skips the disk-backed cookie jar (which needs
  /// a platform channel path_provider can't provide inside a plain widget
  /// test) in favor of an in-memory one, and takes a pre-built Dio so the
  /// transport can be swapped for a fake adapter.
  @visibleForTesting
  factory ApiClient.forTesting({required Dio dio, CookieJar? cookieJar, WorkspaceStore? workspace}) =>
      ApiClient._(dio, cookieJar ?? CookieJar(), workspace ?? WorkspaceStore.memory(), _SessionGuard());

  /// Wipes the local cookie store — used on sign-out so a stale
  /// refresh_token never lingers on the device after the server revokes it.
  /// On web this is a no-op: httpOnly cookies aren't readable/clearable
  /// from JS anyway, and the server's Set-Cookie on /auth/signout already
  /// expires them in the browser.
  Future<void> clearSession() => kIsWeb ? Future.value() : _cookieJar.deleteAll();

  /// Socket.IO's handshake is a raw HTTP request that backend/socket.js
  /// authenticates by reading `access_token` straight off the Cookie header
  /// (see socket.js's parseCookies) — socket_io_client doesn't share Dio's
  /// cookie jar, so this hands it an explicit header on native platforms.
  /// On web, browsers forbid scripts from setting a Cookie header at all;
  /// the browser attaches it to the WS handshake itself (SameSite ignores
  /// port, so this works fine across the dev ports too), so return none.
  Future<Map<String, String>> socketCookieHeaders(String baseUrl) async {
    if (kIsWeb) return const {};
    final cookies = await _cookieJar.loadForRequest(Uri.parse(baseUrl));
    if (cookies.isEmpty) return const {};
    return {'Cookie': cookies.map((c) => '${c.name}=${c.value}').join('; ')};
  }
}

/// Adds the chosen workspace to every request, unless the call names one
/// itself (the login screen checking a name before keeping it).
class _WorkspaceInterceptor extends Interceptor {
  _WorkspaceInterceptor(this._store);
  final WorkspaceStore _store;

  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    if (_store.slug.isNotEmpty && !options.headers.containsKey('x-tenant')) {
      options.headers['x-tenant'] = _store.slug;
    }
    handler.next(options);
  }
}

/// Makes a request's body safe to send again on a retry. A [FormData] (every
/// file upload) finalizes its multipart stream when first sent, so replaying the
/// same instance throws "already finalized" with no HTTP response — which is why
/// a voice-note upload that hit a CSRF/refresh retry surfaced as an opaque
/// "request failed: unknown" instead of succeeding. Cloning rebuilds the stream.
void _replayBody(RequestOptions options) {
  final data = options.data;
  if (data is FormData) options.data = data.clone();
}

/// Fires `onExpired` exactly once when the session is confirmed dead, until a
/// new sign-in calls `reset()`. Without the one-shot guard a dead session's
/// burst of parallel 401s would each try to log the user out.
class _SessionGuard {
  void Function()? onExpired;
  bool _fired = false;

  void markExpired() {
    if (_fired) return;
    _fired = true;
    onExpired?.call();
  }

  void reset() => _fired = false;
}

class _RefreshOn401Interceptor extends Interceptor {
  _RefreshOn401Interceptor(this._dio, this._guard);

  final Dio _dio;
  final _SessionGuard _guard;
  Completer<bool>? _refreshInFlight;

  static const _authEndpoints = ['/api/auth/signin', '/api/auth/refresh', '/api/auth/signup'];

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) async {
    final path = err.requestOptions.path;
    final isAuthEndpoint = _authEndpoints.any(path.contains);
    final alreadyRetried = err.requestOptions.extra['retriedAfterRefresh'] == true;

    if (err.response?.statusCode != 401 || isAuthEndpoint || alreadyRetried) {
      return handler.next(err);
    }

    final refreshed = await _refresh();
    if (!refreshed) return handler.next(err);

    try {
      final retryOptions = err.requestOptions..extra['retriedAfterRefresh'] = true;
      _replayBody(retryOptions); // a FormData body can't be sent twice
      final response = await _dio.fetch(retryOptions);
      return handler.resolve(response);
    } on DioException catch (retryError) {
      return handler.next(retryError);
    }
  }

  /// Dedupes concurrent 401s onto a single refresh call — mirrors the
  /// backend's refresh-token rotation, which invalidates the whole session
  /// if a token is presented twice.
  Future<bool> _refresh() {
    final inFlight = _refreshInFlight;
    if (inFlight != null) return inFlight.future;

    final completer = Completer<bool>();
    _refreshInFlight = completer;
    _dio.post<void>('/api/auth/refresh').then((_) {
      _guard.reset(); // a working session re-arms expiry detection
      completer.complete(true);
    }).catchError((Object e) {
      // Only a server REJECTION (401/403) means the session is truly dead and
      // the user must sign in again. A timeout / connection drop / 5xx is
      // transient — fail the request but keep the session so we don't sign the
      // user out every time the network hiccups.
      final rejected = e is DioException &&
          (e.response?.statusCode == 401 || e.response?.statusCode == 403);
      if (rejected) _guard.markExpired();
      completer.complete(false);
    }).whenComplete(() {
      _refreshInFlight = null;
    });
    return completer.future;
  }
}


/// Echoes the session's CSRF token back on every state-changing request.
///
/// The backend refuses non-GET `/api` calls whose `X-CSRF-Token` header does not
/// match the `csrf_token` cookie. The cookie is deliberately readable, but a
/// Flutter WEB build cannot read `document.cookie` without `dart:html` (which
/// will not compile for native), so instead of reading the cookie we ask the
/// server for the value: `GET /api/auth/csrf` echoes back whatever cookie the
/// browser or the jar just sent. One code path, both platforms.
class _CsrfInterceptor extends Interceptor {
  _CsrfInterceptor(this._dio);

  final Dio _dio;
  String? _token;
  Completer<String?>? _fetchInFlight;

  static const _safeMethods = {'GET', 'HEAD', 'OPTIONS'};

  /// Writes the server lets through unauthenticated. Asking for a token before
  /// signing in would be a wasted round trip on the app's very first request.
  static const _exemptPaths = [
    '/api/auth/signin',
    '/api/auth/signup',
    '/api/auth/refresh',
    '/api/auth/csrf',
    '/api/user/password/request-otp',
    '/api/user/password/reset',
    // Public, rate-limited ingest (backend security/publicRoutes.js). Asking
    // for a token first would add a request to every log flush.
    AppLogger.endpoint,
  ];

  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) async {
    final method = options.method.toUpperCase();
    if (_safeMethods.contains(method) || _exemptPaths.any(options.path.contains)) {
      return handler.next(options);
    }

    final token = _token ?? await _fetchToken();
    if (token != null) options.headers['X-CSRF-Token'] = token;
    return handler.next(options);
  }

  // Both are self-healing by fetching /api/auth/csrf, which re-mints the cookie
  // AND returns the matching token:
  //   CSRF_TOKEN_INVALID  — cached token went stale (session refreshed / act-as).
  //   CSRF_COOKIE_MISSING — the csrf_token cookie is absent (a session predating
  //                         the CSRF check, or a cookie that didn't persist).
  // Without handling the second, such a session can't do ANY write — every
  // upload/create 403s with no way back. One re-mint + retry fixes it; if the
  // session itself is dead the retry 401s and the session guard takes over.
  static const _recoverableCsrf = {'CSRF_TOKEN_INVALID', 'CSRF_COOKIE_MISSING'};

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) async {
    final code = err.response?.data is Map ? err.response?.data['code'] : null;
    final alreadyRetried = err.requestOptions.extra['retriedAfterCsrf'] == true;

    if (err.response?.statusCode != 403 || !_recoverableCsrf.contains(code) || alreadyRetried) {
      return handler.next(err);
    }

    _token = null;
    final token = await _fetchToken();
    if (token == null) return handler.next(err);

    try {
      final retryOptions = err.requestOptions
        ..extra['retriedAfterCsrf'] = true
        ..headers['X-CSRF-Token'] = token;
      _replayBody(retryOptions); // a FormData body can't be sent twice
      return handler.resolve(await _dio.fetch(retryOptions));
    } on DioException catch (retryError) {
      return handler.next(retryError);
    }
  }

  /// Deduped, so a burst of concurrent writes triggers one fetch, not N.
  Future<String?> _fetchToken() {
    final inFlight = _fetchInFlight;
    if (inFlight != null) return inFlight.future;

    final completer = Completer<String?>();
    _fetchInFlight = completer;
    _dio.get<Map<String, dynamic>>('/api/auth/csrf').then((res) {
      _token = res.data?['csrfToken'] as String?;
      completer.complete(_token);
    }).catchError((_) {
      completer.complete(null);
    }).whenComplete(() {
      _fetchInFlight = null;
    });
    return completer.future;
  }
}
