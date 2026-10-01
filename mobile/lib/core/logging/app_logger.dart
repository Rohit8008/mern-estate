import 'dart:async';
import 'dart:collection';
import 'dart:developer' as developer;
import 'dart:io' show Platform;
import 'dart:math';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';

import '../config/env.dart';

/// Severity, in ascending order. Names are what the backend expects.
enum LogLevel { debug, info, warn, error }

/// Ships one batch (at most [AppLogger.batchSize] entries). Must throw on
/// failure so the batch is kept for the next attempt.
typedef LogSender = Future<void> Function(List<Map<String, Object?>> batch);

/// Client-side structured logging, shipped to the backend's
/// `POST /api/observability/logs`, which forwards it to OpenObserve.
///
/// Contract, in order of importance:
///  * **Never throws** out of a logging call, and never blocks the UI — a log
///    call only formats and appends to an in-memory buffer.
///  * **Never logs itself**: the flush request is marked with
///    [skipLoggingKey] so the Dio logging interceptor ignores it, and a
///    failing flush is not reported through the logger.
///  * **Redacts locally**: keys that look like credentials are dropped, and
///    token/otp/password query values and bearer/JWT strings are masked
///    before anything leaves the device. The server strips again; this is
///    the first line, not the only one.
///
/// Nothing is sent until [start] is called (main() does that), so widget
/// tests that build the app never start a timer or touch the network.
class AppLogger with WidgetsBindingObserver {
  AppLogger({
    this.flushInterval = const Duration(seconds: 10),
    this.flushAt = 20,
    this.maxBuffer = 500,
    this.batchSize = 50,
    LogLevel? minShipLevel,
    bool? echo,
    Map<String, Object?>? baseFields,
  })  : minShipLevel = minShipLevel ?? (kDebugMode ? LogLevel.debug : LogLevel.info),
        _echo = echo ?? (kDebugMode && !_underFlutterTest),
        _baseFields = baseFields ?? defaultBaseFields();

  /// The app-wide instance. Tests construct their own.
  static final AppLogger instance = AppLogger();

  /// Put `true` under this key in a Dio request's `extra` to keep it out of
  /// the request log (the flush itself uses it).
  static const skipLoggingKey = 'skipLogging';

  /// The ingest endpoint, relative to the API base URL (paths in this app
  /// carry their own `/api` prefix — see ApiClient).
  static const endpoint = '/api/observability/logs';

  /// Random per app launch, so one run's lines can be followed in
  /// OpenObserve without identifying the person.
  static final String sessionId = _randomId();

  final Duration flushInterval;
  final int flushAt;
  final int maxBuffer;
  final int batchSize;

  /// Entries below this level are printed (in debug) but not buffered.
  /// `debug` only ever ships from debug builds.
  final LogLevel minShipLevel;

  final bool _echo;
  final Map<String, Object?> _baseFields;
  final ListQueue<Map<String, Object?>> _buffer = ListQueue();

  LogSender? _sender;
  Timer? _timer;
  bool _observingLifecycle = false;
  bool _sending = false;
  bool _inLog = false;
  bool _flushScheduled = false;
  String? _route;

  /// Entries dropped because the buffer was full, since the last report.
  int _dropped = 0;

  @visibleForTesting
  int get droppedCount => _dropped;

  @visibleForTesting
  List<Map<String, Object?>> get pending => List.unmodifiable(_buffer);

  /// The current screen, attached to every later entry as `route`.
  set route(String? value) => _route = value;

  // ── public API ────────────────────────────────────────────────────────────

  void debug(String message, {Object? error, StackTrace? stack, Map<String, Object?>? fields}) =>
      log(LogLevel.debug, message, error: error, stack: stack, fields: fields);

  void info(String message, {Object? error, StackTrace? stack, Map<String, Object?>? fields}) =>
      log(LogLevel.info, message, error: error, stack: stack, fields: fields);

  void warn(String message, {Object? error, StackTrace? stack, Map<String, Object?>? fields}) =>
      log(LogLevel.warn, message, error: error, stack: stack, fields: fields);

  void error(String message, {Object? error, StackTrace? stack, Map<String, Object?>? fields}) =>
      log(LogLevel.error, message, error: error, stack: stack, fields: fields);

  void log(LogLevel level, String message, {Object? error, StackTrace? stack, Map<String, Object?>? fields}) {
    // Re-entrancy guard: anything the logger does that reports back into it
    // (a zone print hook, a failing toString()) is dropped, not recursed.
    if (_inLog) return;
    _inLog = true;
    try {
      if (_echo) _print(level, message, error, stack);
      if (level.index < minShipLevel.index) return;
      _enqueue(buildEntry(level, message, error: error, stack: stack, fields: fields));
      if (_sender != null && _buffer.length >= flushAt) _scheduleFlush();
    } catch (_) {
      // A logger that can crash the app is worse than a missing line.
    } finally {
      _inLog = false;
    }
  }

  /// Begin shipping: periodic flush, threshold flush, and a flush whenever
  /// the app is backgrounded or torn down. Safe to call more than once.
  void start({required LogSender sender, bool observeLifecycle = true}) {
    _sender = sender;
    _timer?.cancel();
    _timer = Timer.periodic(flushInterval, (_) => flush());
    if (observeLifecycle && !_observingLifecycle) {
      try {
        WidgetsBinding.instance.addObserver(this);
        _observingLifecycle = true;
      } catch (_) {
        // No binding (pure Dart test) — periodic flush still works.
      }
    }
    if (_buffer.isNotEmpty) _scheduleFlush();
  }

  /// Stop shipping (tests). Buffered entries are kept.
  void stop() {
    _timer?.cancel();
    _timer = null;
    _sender = null;
    if (_observingLifecycle) {
      try {
        WidgetsBinding.instance.removeObserver(this);
      } catch (_) {}
      _observingLifecycle = false;
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.paused ||
        state == AppLifecycleState.hidden ||
        state == AppLifecycleState.detached) {
      flush();
    }
  }

  /// Send what is buffered. Never throws. A failed batch goes back to the
  /// front of the buffer (still subject to the cap) for the next attempt.
  Future<void> flush() async {
    final sender = _sender;
    if (sender == null || _sending) return;
    _sending = true;
    try {
      // Bounded per flush: the endpoint is rate-limited per IP.
      for (var round = 0; round < 5 && (_buffer.isNotEmpty || _dropped > 0); round++) {
        // The overflow report rides at the head of the batch rather than in
        // the (full) buffer, where it would only evict another line.
        final dropped = _dropped;
        _dropped = 0;
        final batch = <Map<String, Object?>>[
          if (dropped > 0) buildEntry(LogLevel.warn, 'log buffer overflow', fields: {'dropped': dropped}),
        ];
        final taken = <Map<String, Object?>>[];
        while (batch.length < batchSize && _buffer.isNotEmpty) {
          final entry = _buffer.removeFirst();
          taken.add(entry);
          batch.add(entry);
        }
        try {
          await sender(batch);
        } catch (_) {
          // Deliberately not logged (that would feed the failure back in).
          for (final entry in taken.reversed) {
            _buffer.addFirst(entry);
          }
          _dropped += dropped;
          _trim();
          return;
        }
      }
    } catch (_) {
      // Never surface.
    } finally {
      _sending = false;
    }
  }

  // ── entry building & redaction ───────────────────────────────────────────

  /// Builds the flat JSON entry the backend expects. Exposed for tests.
  @visibleForTesting
  Map<String, Object?> buildEntry(
    LogLevel level,
    String message, {
    Object? error,
    StackTrace? stack,
    Map<String, Object?>? fields,
  }) {
    final entry = <String, Object?>{};
    void put(String key, Object? value) {
      if (isSensitiveKey(key)) return;
      final clean = _flatValue(value);
      if (clean != null) entry[key] = clean;
    }

    _baseFields.forEach(put);
    if (_route != null) put('route', _route);
    fields?.forEach(put);
    if (error != null) {
      entry['error_type'] = error.runtimeType.toString();
      entry['error'] = _truncate(scrub(_safeToString(error)), 1000);
    }
    if (stack != null) entry['stack'] = _truncate(scrub(stack.toString()), 4000);

    // Core keys last, so no field can overwrite them.
    entry['service'] = 'mobile';
    entry['level'] = level.name;
    entry['message'] = _truncate(scrub(message), 2000);
    entry['_timestamp'] = DateTime.now().microsecondsSinceEpoch;
    return entry;
  }

  static final _sensitiveKey = RegExp(r'pass(word|wd)?|token|secret|cookie|authori[sz]ation|otp|api[_-]?key|body', caseSensitive: false);

  /// Keys never sent at all, whatever their value.
  static bool isSensitiveKey(String key) => _sensitiveKey.hasMatch(key);

  static final _sensitiveQuery = RegExp(
    r'([?&;][^=&#\s]*(?:token|otp|pass|secret|code|key|auth)[^=&#\s]*=)[^&#\s]*',
    caseSensitive: false,
  );
  static final _bearer = RegExp(r'(bearer|basic)\s+[A-Za-z0-9\-._~+/]+=*', caseSensitive: false);
  static final _jwt = RegExp(r'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+');
  static final _cookieHeader = RegExp(r'((?:set-)?cookie\s*[:=]\s*)[^\n]*', caseSensitive: false);

  /// Masks credentials that can hide inside free text: sensitive query
  /// values, Authorization values, JWTs and Cookie header lines.
  static String scrub(String input) => input
      .replaceAllMapped(_sensitiveQuery, (m) => '${m[1]}[redacted]')
      .replaceAllMapped(_bearer, (m) => '${m[1]} [redacted]')
      .replaceAll(_jwt, '[redacted-jwt]')
      .replaceAllMapped(_cookieHeader, (m) => '${m[1]}[redacted]');

  Object? _flatValue(Object? value) {
    if (value == null) return null;
    if (value is bool || value is int) return value;
    if (value is double) return value.isFinite ? value : value.toString();
    if (value is String) return _truncate(scrub(value), 1000);
    if (value is Enum) return value.name;
    return _truncate(scrub(_safeToString(value)), 1000);
  }

  // ── internals ────────────────────────────────────────────────────────────

  void _enqueue(Map<String, Object?> entry) {
    _buffer.addLast(entry);
    _trim();
  }

  void _trim() {
    while (_buffer.length > maxBuffer) {
      _buffer.removeFirst();
      _dropped++;
    }
  }

  void _scheduleFlush() {
    if (_flushScheduled) return;
    _flushScheduled = true;
    scheduleMicrotask(() {
      _flushScheduled = false;
      flush();
    });
  }

  void _print(LogLevel level, String message, Object? error, StackTrace? stack) {
    try {
      developer.log(
        message,
        name: 'app.${level.name}',
        level: const [500, 800, 900, 1000][level.index],
        error: error,
        stackTrace: stack,
      );
    } catch (_) {}
  }

  static String _safeToString(Object value) {
    try {
      return value.toString();
    } catch (_) {
      return value.runtimeType.toString();
    }
  }

  static String _truncate(String s, int max) => s.length <= max ? s : '${s.substring(0, max)}…';

  static String _randomId() {
    Random rng;
    try {
      rng = Random.secure();
    } catch (_) {
      rng = Random();
    }
    return List.generate(16, (_) => rng.nextInt(16).toRadixString(16)).join();
  }

  static bool get _underFlutterTest {
    if (kIsWeb) return false;
    try {
      return Platform.environment.containsKey('FLUTTER_TEST');
    } catch (_) {
      return false;
    }
  }

  /// Fields stamped on every entry: build, platform, launch session.
  static Map<String, Object?> defaultBaseFields() {
    final fields = <String, Object?>{
      'app_version': Env.appVersion,
      'build_number': Env.buildNumber,
      'session_id': sessionId,
      'build_mode': kReleaseMode ? 'release' : (kProfileMode ? 'profile' : 'debug'),
    };
    if (kIsWeb) {
      fields['platform'] = 'web';
    } else {
      try {
        fields['platform'] = Platform.operatingSystem;
        fields['os_version'] = Platform.operatingSystemVersion;
      } catch (_) {
        fields['platform'] = defaultTargetPlatform.name;
      }
    }
    return fields;
  }
}

/// The app-wide logger.
AppLogger get appLog => AppLogger.instance;

/// Posts batches through the app's own Dio, so the session cookie goes with
/// them and the server can attribute the user and workspace. Marked so the
/// logging interceptor ignores it.
LogSender dioLogSender(Dio dio) => (batch) async {
      await dio.post<void>(
        AppLogger.endpoint,
        data: batch,
        options: Options(
          extra: const {AppLogger.skipLoggingKey: true},
          sendTimeout: const Duration(seconds: 10),
          receiveTimeout: const Duration(seconds: 10),
        ),
      );
    };
