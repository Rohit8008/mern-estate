import 'package:dio/dio.dart';

import 'app_logger.dart';

/// Logs requests that went wrong — never bodies, never headers except the
/// server's `x-request-id`, never the query string.
///
///  * status >= 500              → error
///  * no response (network/timeout) → warn
///  * 4xx other than 401          → info (401 is the normal refresh path)
///  * success slower than [slowThreshold] → warn
///
/// Add it LAST, so it sees the outcome after refresh/CSRF retries.
class LoggingInterceptor extends Interceptor {
  LoggingInterceptor({AppLogger? logger, this.slowThreshold = const Duration(seconds: 3)})
      : _logger = logger ?? AppLogger.instance;

  final AppLogger _logger;
  final Duration slowThreshold;

  static const _startKey = '_logStartedUs';

  static bool _skip(RequestOptions o) =>
      o.extra[AppLogger.skipLoggingKey] == true || o.path.contains(AppLogger.endpoint);

  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    try {
      if (!_skip(options)) options.extra[_startKey] = DateTime.now().microsecondsSinceEpoch;
    } catch (_) {}
    handler.next(options);
  }

  @override
  void onResponse(Response<dynamic> response, ResponseInterceptorHandler handler) {
    try {
      final o = response.requestOptions;
      if (!_skip(o)) {
        final ms = _durationMs(o);
        if (ms != null && ms > slowThreshold.inMilliseconds) {
          _logger.warn('slow request', fields: _fields(o, response.statusCode, ms, response.headers));
        }
      }
    } catch (_) {}
    handler.next(response);
  }

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) {
    try {
      final o = err.requestOptions;
      if (!_skip(o) && err.type != DioExceptionType.cancel) {
        final status = err.response?.statusCode;
        final fields = _fields(o, status, _durationMs(o), err.response?.headers)..['error_type'] = err.type.name;
        if (status == null) {
          _logger.warn('request failed: ${err.type.name}', fields: fields);
        } else if (status >= 500) {
          _logger.error('request failed: $status', fields: fields);
        } else if (status >= 400 && status != 401) {
          _logger.info('request rejected: $status', fields: fields);
        }
      }
    } catch (_) {}
    handler.next(err);
  }

  static int? _durationMs(RequestOptions o) {
    final started = o.extra[_startKey];
    if (started is! int) return null;
    return ((DateTime.now().microsecondsSinceEpoch - started) / 1000).round();
  }

  static Map<String, Object?> _fields(RequestOptions o, int? status, int? ms, Headers? headers) => {
        'method': o.method.toUpperCase(),
        'path': pathOnly(o.path),
        'status': status,
        'duration_ms': ms,
        'request_id': headers?.value('x-request-id'),
      };

  /// The path without query string or fragment (and without a host, if the
  /// call used an absolute URL).
  static String pathOnly(String path) {
    final uri = Uri.tryParse(path);
    if (uri != null) return uri.path;
    final cut = path.indexOf(RegExp(r'[?#]'));
    return cut < 0 ? path : path.substring(0, cut);
  }
}
