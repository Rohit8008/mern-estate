// Client logging: what leaves the device must be redacted, the buffer must be
// bounded, and nothing about logging may ever throw into the app. No network:
// every test injects a fake sender or a fake Dio adapter.

import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:realvista_crm/core/config/env.dart';
import 'package:realvista_crm/core/logging/app_logger.dart';
import 'package:realvista_crm/core/logging/logging_interceptor.dart';

class _Explodes {
  @override
  String toString() => throw StateError('toString blew up');
}

class _FakeSender {
  final List<List<Map<String, Object?>>> batches = [];
  bool fail = false;

  Future<void> call(List<Map<String, Object?>> batch) async {
    if (fail) throw Exception('offline');
    batches.add(List.of(batch));
  }
}

AppLogger _logger({int maxBuffer = 500, int flushAt = 20, LogLevel minShipLevel = LogLevel.debug}) => AppLogger(
      maxBuffer: maxBuffer,
      flushAt: flushAt,
      minShipLevel: minShipLevel,
      echo: false,
      baseFields: const {'session_id': 'test'},
    );

class _StatusAdapter implements HttpClientAdapter {
  _StatusAdapter(this.status, {this.headers = const {}});
  final int status;
  final Map<String, List<String>> headers;
  final List<String> paths = [];

  @override
  Future<ResponseBody> fetch(RequestOptions options, Stream<Uint8List>? requestStream, Future<void>? cancelFuture) async {
    paths.add(options.path);
    return ResponseBody.fromString(jsonEncode({'ok': status < 400}), status, headers: {
      Headers.contentTypeHeader: [Headers.jsonContentType],
      ...headers,
    });
  }

  @override
  void close({bool force = false}) {}
}

void main() {
  group('redaction', () {
    test('credential-looking keys never make it into an entry', () {
      final entry = _logger().buildEntry(LogLevel.info, 'hello', fields: {
        'password': 'hunter2',
        'accessToken': 'abc',
        'Authorization': 'Bearer abc',
        'cookie': 'access_token=abc',
        'client_secret': 'x',
        'otp': '123456',
        'request_body': '{"email":"a@b.c"}',
        'path': '/api/leads',
        'status': 500,
        'slow': true,
      });
      expect(entry.keys, isNot(contains('password')));
      expect(entry.keys, isNot(contains('accessToken')));
      expect(entry.keys, isNot(contains('Authorization')));
      expect(entry.keys, isNot(contains('cookie')));
      expect(entry.keys, isNot(contains('client_secret')));
      expect(entry.keys, isNot(contains('otp')));
      expect(entry.keys, isNot(contains('request_body')));
      expect(entry['path'], '/api/leads');
      expect(entry['status'], 500);
      expect(entry['slow'], true);
    });

    test('secrets hidden in free text are masked', () {
      final scrubbed = AppLogger.scrub(
        'GET /api/user/password/reset?email=x&otp=123456&resetToken=abc&page=2 '
        'Authorization: Bearer abc.def-ghi '
        'jwt eyJhbGciOiJIUzI1NiJ9.eyJpZCI6IjEifQ.sig_nature-1',
      );
      expect(scrubbed, isNot(contains('123456')));
      expect(scrubbed, isNot(contains('resetToken=abc')));
      expect(scrubbed, isNot(contains('abc.def-ghi')));
      expect(scrubbed, isNot(contains('eyJhbGciOiJIUzI1NiJ9')));
      expect(scrubbed, contains('page=2'));
    });

    test('messages and errors are scrubbed and core keys cannot be overridden', () {
      final entry = _logger().buildEntry(
        LogLevel.error,
        'failed /x?token=abc',
        error: Exception('at /y?password=p'),
        fields: {'service': 'spoofed', 'level': 'debug', '_timestamp': 1},
      );
      expect(entry['service'], 'mobile');
      expect(entry['level'], 'error');
      expect(entry['_timestamp'], isA<int>());
      expect(entry['_timestamp'] as int, greaterThan(1000000000000000)); // microseconds
      expect(entry['message'], isNot(contains('abc')));
      expect(entry['error'], isNot(contains('password=p')));
      expect(entry['session_id'], 'test');
    });

    test('metadata stays flat', () {
      final entry = _logger().buildEntry(LogLevel.info, 'm', fields: {'list': [1, 2], 'nothing': null});
      expect(entry['list'], '[1, 2]');
      expect(entry.containsKey('nothing'), isFalse);
    });
  });

  group('buffer', () {
    test('is capped, drops the oldest and counts the drops', () async {
      final log = _logger(maxBuffer: 5);
      for (var i = 0; i < 8; i++) {
        log.info('line $i');
      }
      expect(log.pending, hasLength(5));
      expect(log.pending.first['message'], 'line 3');
      expect(log.droppedCount, 3);

      final sender = _FakeSender();
      log.start(sender: sender.call, observeLifecycle: false);
      await log.flush();
      log.stop();

      final sent = sender.batches.expand((b) => b).toList();
      expect(sent.first['message'], 'log buffer overflow');
      expect(sent.first['dropped'], 3);
      expect(sent.last['message'], 'line 7');
      expect(log.pending, isEmpty);
      expect(log.droppedCount, 0);
    });

    test('flushes on reaching the threshold, in batches of at most 50', () async {
      final log = _logger(flushAt: 3);
      final sender = _FakeSender();
      log.start(sender: sender.call, observeLifecycle: false);
      log.info('a');
      log.info('b');
      expect(sender.batches, isEmpty);
      log.info('c');
      await pumpEventQueue();
      expect(sender.batches.single.map((e) => e['message']), ['a', 'b', 'c']);

      for (var i = 0; i < 120; i++) {
        log.info('bulk $i');
      }
      await log.flush();
      await pumpEventQueue();
      log.stop();
      expect(sender.batches.every((b) => b.length <= 50), isTrue);
      expect(log.pending, isEmpty);
    });

    test('debug lines are not shipped when the ship level is info (release)', () {
      final log = _logger(minShipLevel: LogLevel.info);
      log.debug('noise');
      log.info('signal');
      expect(log.pending.map((e) => e['message']), ['signal']);
    });
  });

  group('never throws', () {
    test('an error whose toString throws is still logged', () {
      final log = _logger();
      expect(() => log.error('boom', error: _Explodes(), fields: {'bad': _Explodes()}), returnsNormally);
      expect(log.pending.single['error_type'], '_Explodes');
    });

    test('a failing sender keeps the entries for next time and does not throw', () async {
      final log = _logger();
      final sender = _FakeSender()..fail = true;
      log.start(sender: sender.call, observeLifecycle: false);
      log.warn('one');
      log.warn('two');
      await expectLater(log.flush(), completes);
      expect(log.pending.map((e) => e['message']), ['one', 'two']);

      sender.fail = false;
      await log.flush();
      log.stop();
      expect(sender.batches.single.map((e) => e['message']), ['one', 'two']);
    });
  });

  group('LoggingInterceptor', () {
    Dio dioWith(AppLogger log, _StatusAdapter adapter) =>
        Dio(BaseOptions(baseUrl: 'http://localhost:3000'))
          ..httpClientAdapter = adapter
          ..interceptors.add(LoggingInterceptor(logger: log));

    test('5xx is an error with path (no query), status, duration and request id', () async {
      final log = _logger();
      final dio = dioWith(log, _StatusAdapter(503, headers: {'x-request-id': ['req-42']}));
      await expectLater(dio.get<void>('/api/leads?token=abc&q=Priya'), throwsA(isA<DioException>()));
      final entry = log.pending.single;
      expect(entry['level'], 'error');
      expect(entry['method'], 'GET');
      expect(entry['path'], '/api/leads');
      expect(entry['status'], 503);
      expect(entry['request_id'], 'req-42');
      expect(entry['duration_ms'], isA<int>());
      expect(jsonEncode(entry), isNot(contains('Priya')));
      expect(jsonEncode(entry), isNot(contains('abc')));
    });

    test('4xx is info, 401 and successes are not logged', () async {
      final log = _logger();
      await expectLater(dioWith(log, _StatusAdapter(404)).get<void>('/api/x'), throwsA(isA<DioException>()));
      await expectLater(dioWith(log, _StatusAdapter(401)).get<void>('/api/x'), throwsA(isA<DioException>()));
      await dioWith(log, _StatusAdapter(200)).get<void>('/api/x');
      expect(log.pending.single['level'], 'info');
      expect(log.pending.single['status'], 404);
    });

    test('the ingest request itself is never logged', () async {
      final log = _logger();
      final adapter = _StatusAdapter(500);
      final dio = dioWith(log, adapter);
      log.start(sender: dioLogSender(dio), observeLifecycle: false);
      log.error('first');
      await log.flush();
      log.stop();
      expect(adapter.paths, [AppLogger.endpoint]);
      // Only the original line, kept for retry — no "request failed" about the flush.
      expect(log.pending.map((e) => e['message']), ['first']);
    });
  });

  test('Env version defaults match pubspec.yaml', () {
    final line = File('pubspec.yaml').readAsLinesSync().firstWhere((l) => l.startsWith('version:'));
    expect(line.trim(), 'version: ${Env.appVersion}+${Env.buildNumber}');
  });
}
