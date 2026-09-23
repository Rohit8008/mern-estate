import 'dart:async';
import 'dart:io';

import 'package:cookie_jar/cookie_jar.dart';
import 'package:dio/dio.dart';
import 'package:dio_cookie_manager/dio_cookie_manager.dart';
import 'package:flutter/foundation.dart';
import 'package:path_provider/path_provider.dart';

import 'workspace_store.dart';

/// Wraps Dio with a disk-persisted cookie jar (the backend is 100%
/// httpOnly-cookie JWT auth — access_token/refresh_token — with no
/// bearer-token mode, so this is what lets the session survive app
/// restarts) and a refresh-on-401 interceptor mirroring the web app's
/// fetchWithRefresh() in utils/http.js.
class ApiClient {
  ApiClient._(this.dio, this._cookieJar, this.workspace) {
    dio.interceptors.insert(0, _WorkspaceInterceptor(workspace));
  }

  final Dio dio;
  final CookieJar _cookieJar;

  /// Which agency to sign in to; sent as `x-tenant`.
  final WorkspaceStore workspace;

  static Future<ApiClient> create({required String baseUrl}) async {
    final dio = Dio(BaseOptions(
      baseUrl: baseUrl,
      connectTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 20),
      headers: const {'Content-Type': 'application/json'},
    ));

    if (kIsWeb) {
      // On web there is no dart:io / path_provider (getApplicationSupportDirectory
      // throws MissingPluginException) — and none of this is needed anyway:
      // the browser already stores/sends httpOnly Set-Cookie cookies itself.
      // We only need to opt the XHR/fetch adapter into sending credentials.
      (dio.httpClientAdapter as dynamic).withCredentials = true;
      dio.interceptors.add(_CsrfInterceptor(dio));
      dio.interceptors.add(_RefreshOn401Interceptor(dio));
      return ApiClient._(dio, CookieJar(), WorkspaceStore.memory());
    }

    final supportDir = await getApplicationSupportDirectory();
    final cookieDir = Directory('${supportDir.path}/.cookies');
    if (!cookieDir.existsSync()) cookieDir.createSync(recursive: true);
    final cookieJar = PersistCookieJar(storage: FileStorage(cookieDir.path));
    dio.interceptors.add(CookieManager(cookieJar));
    dio.interceptors.add(_CsrfInterceptor(dio));
    dio.interceptors.add(_RefreshOn401Interceptor(dio));

    return ApiClient._(dio, cookieJar, await WorkspaceStore.open(supportDir));
  }

  /// Test-only entry point — skips the disk-backed cookie jar (which needs
  /// a platform channel path_provider can't provide inside a plain widget
  /// test) in favor of an in-memory one, and takes a pre-built Dio so the
  /// transport can be swapped for a fake adapter.
  @visibleForTesting
  factory ApiClient.forTesting({required Dio dio, CookieJar? cookieJar, WorkspaceStore? workspace}) =>
      ApiClient._(dio, cookieJar ?? CookieJar(), workspace ?? WorkspaceStore.memory());

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

class _RefreshOn401Interceptor extends Interceptor {
  _RefreshOn401Interceptor(this._dio);

  final Dio _dio;
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
      completer.complete(true);
    }).catchError((_) {
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

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) async {
    final code = err.response?.data is Map ? err.response?.data['code'] : null;
    final alreadyRetried = err.requestOptions.extra['retriedAfterCsrf'] == true;

    // A rotated token (the session refreshed, or act-as switched workspace)
    // invalidates the cached one. Refetch once and replay.
    if (err.response?.statusCode != 403 || code != 'CSRF_TOKEN_INVALID' || alreadyRetried) {
      return handler.next(err);
    }

    _token = null;
    final token = await _fetchToken();
    if (token == null) return handler.next(err);

    try {
      final retryOptions = err.requestOptions
        ..extra['retriedAfterCsrf'] = true
        ..headers['X-CSRF-Token'] = token;
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
