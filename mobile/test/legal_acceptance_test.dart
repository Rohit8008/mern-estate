// The Terms acceptance gate: shown after sign-in/restore when the server says
// the version in force is unaccepted, blocking until the box is ticked; the
// POST carries the GET's version (the CSRF header comes from ApiClient's
// shared interceptor, which ApiClient.forTesting does not install); a stale version (409)
// shows the new one with the box cleared; and a failed check fails open.

import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:realvista_crm/core/legal/legal_links.dart';
import 'package:realvista_crm/core/network/api_client.dart';
import 'package:realvista_crm/core/network/providers.dart';
import 'package:realvista_crm/features/legal/presentation/legal_acceptance_screen.dart';
import 'package:realvista_crm/main.dart';

class _LegalAdapter implements HttpClientAdapter {
  _LegalAdapter({this.versions = const ['2026-09-26'], this.statusFails = false});

  /// Successive "version in force" values; a POST of anything but the
  /// current head answers 409 and advances nothing.
  final List<String> versions;
  final bool statusFails;
  int _current = 0;
  bool accepted = false;
  final List<Map<String, dynamic>> posts = [];

  /// After the first POST, the server moves on to the next version.
  bool bumpOnFirstPost = false;

  @override
  Future<ResponseBody> fetch(RequestOptions options, Stream<Uint8List>? requestStream, Future<void>? cancelFuture) async {
    final path = options.path;
    if (path == '/api/user/me') {
      return _json(200, {
        'data': {'_id': '1', 'username': 'agent', 'email': 'a@b.c', 'role': 'employee', 'status': 'active', 'firstName': 'Asha'},
      });
    }
    if (path == '/api/user/legal-acceptance') {
      if (options.method == 'GET') {
        if (statusFails) throw DioException.connectionError(requestOptions: options, reason: 'offline');
        return _json(200, {
          'success': true,
          'version': versions[_current],
          'acceptedVersion': accepted ? versions[_current] : null,
          'required': !accepted,
        });
      }
      final body = options.data is String ? jsonDecode(options.data as String) : options.data;
      posts.add(Map<String, dynamic>.from(body as Map));
      if (bumpOnFirstPost && posts.length == 1) _current = 1;
      if (body['version'] != versions[_current]) {
        return _json(409, {'success': false, 'code': 'LEGAL_VERSION_CHANGED', 'version': versions[_current]});
      }
      accepted = true;
      return _json(200, {'success': true, 'version': versions[_current], 'acceptedAt': '2026-09-26T00:00:00Z'});
    }
    return _json(404, {'success': false, 'message': 'Not found'});
  }

  ResponseBody _json(int status, Object body) =>
      ResponseBody.fromString(jsonEncode(body), status, headers: {Headers.contentTypeHeader: [Headers.jsonContentType]});

  @override
  void close({bool force = false}) {}
}

Future<void> _settle(WidgetTester tester) async {
  for (var i = 0; i < 10; i++) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}

Future<void> _pumpApp(WidgetTester tester, _LegalAdapter adapter) async {
  final dio = Dio(BaseOptions(baseUrl: 'http://localhost:3000'))..httpClientAdapter = adapter;
  await tester.pumpWidget(ProviderScope(
    overrides: [apiClientProvider.overrideWithValue(ApiClient.forTesting(dio: dio))],
    child: const RealVistaCrmApp(),
  ));
  await _settle(tester);
}

Finder get _continueButton => find.widgetWithText(InkWell, 'Continue');

bool _continueEnabled(WidgetTester tester) {
  final inkwells = tester.widgetList<InkWell>(find.ancestor(of: find.text('Continue'), matching: find.byType(InkWell)));
  return inkwells.any((w) => w.onTap != null);
}

void main() {
  test('policy links are built from the API origin, not a fixed domain', () {
    expect(LegalDocument.privacy.uriFor('https://crm.example.org').toString(), 'https://crm.example.org/privacy');
    expect(LegalDocument.refunds.uriFor('http://10.0.2.2:3000/').toString(), 'http://10.0.2.2:3000/refunds');
    expect(LegalDocument.terms.uriFor('https://x.test/api').toString(), 'https://x.test/terms');
  });

  testWidgets('blocks until ticked, then records the version and lets the user in', (tester) async {
    final adapter = _LegalAdapter();
    await _pumpApp(tester, adapter);

    expect(find.byType(LegalAcceptanceScreen), findsOneWidget);
    final checkbox = find.byType(Checkbox);
    expect(tester.widget<Checkbox>(checkbox).value, isFalse, reason: 'must start unticked');
    expect(find.text('I agree to the Terms of Service and have read the Privacy Policy'), findsOneWidget);
    expect(find.text('Sign out'), findsOneWidget);
    expect(_continueEnabled(tester), isFalse);

    // Back does not escape the step.
    await tester.binding.handlePopRoute();
    await _settle(tester);
    expect(find.byType(LegalAcceptanceScreen), findsOneWidget);

    await tester.tap(checkbox);
    await _settle(tester);
    expect(_continueEnabled(tester), isTrue);

    await tester.ensureVisible(_continueButton.first);
    await tester.tap(_continueButton.first);
    await _settle(tester);

    expect(adapter.posts, [
      {'version': '2026-09-26'},
    ]);
    expect(find.byType(LegalAcceptanceScreen), findsNothing);
  });

  testWidgets('a stale version shows the new one again with the box cleared', (tester) async {
    final adapter = _LegalAdapter(versions: ['2026-09-26', '2026-10-01'])..bumpOnFirstPost = true;
    await _pumpApp(tester, adapter);

    await tester.tap(find.byType(Checkbox));
    await _settle(tester);
    await tester.ensureVisible(_continueButton.first);
    await tester.tap(_continueButton.first);
    await _settle(tester);

    expect(find.byType(LegalAcceptanceScreen), findsOneWidget);
    expect(find.text('Version 2026-10-01'), findsOneWidget);
    expect(tester.widget<Checkbox>(find.byType(Checkbox)).value, isFalse);
    expect(_continueEnabled(tester), isFalse);

    await tester.tap(find.byType(Checkbox));
    await _settle(tester);
    await tester.ensureVisible(_continueButton.first);
    await tester.tap(_continueButton.first);
    await _settle(tester);

    expect(adapter.posts.last, {'version': '2026-10-01'});
    expect(find.byType(LegalAcceptanceScreen), findsNothing);
  });

  testWidgets('fails open when the acceptance check cannot be made', (tester) async {
    await _pumpApp(tester, _LegalAdapter(statusFails: true));
    expect(find.byType(LegalAcceptanceScreen), findsNothing);
    expect(find.text('Dashboard'), findsWidgets);
  });
}
