// The login screen's workspace choice: every agency shares one server, so the
// workspace typed is sent as x-tenant. A wrong name must say so, and the
// chosen name must be what signing in sends.

import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:realvista_crm/core/network/api_client.dart';
import 'package:realvista_crm/core/network/providers.dart';
import 'package:realvista_crm/core/network/workspace_store.dart';
import 'package:realvista_crm/main.dart';

class _WorkspaceAdapter implements HttpClientAdapter {
  final List<String?> signInTenants = [];

  @override
  Future<ResponseBody> fetch(RequestOptions options, Stream<Uint8List>? requestStream, Future<void>? cancelFuture) async {
    final tenant = options.headers['x-tenant'] as String?;
    if (options.path == '/api/tenant/lookup') {
      if (tenant == null || tenant.isEmpty) return _json(200, {'data': {'slug': 'default', 'name': 'Real Vista'}});
      if (tenant == 'akmrealtor') return _json(200, {'data': {'slug': 'akmrealtor', 'name': 'AkmRealtor'}});
      return _json(404, {'success': false, 'message': 'There\'s no workspace called "$tenant". Check the name and try again.'});
    }
    if (options.path == '/api/auth/signin') {
      signInTenants.add(tenant);
      return _json(401, {'success': false, 'message': 'Invalid email or password'});
    }
    return _json(401, {'success': false, 'message': 'Sign in to continue.'});
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

void main() {
  testWidgets('choosing a workspace on the login screen', (tester) async {
    final adapter = _WorkspaceAdapter();
    final store = WorkspaceStore.memory();
    final dio = Dio(BaseOptions(baseUrl: 'http://localhost:3000'))..httpClientAdapter = adapter;
    await tester.pumpWidget(ProviderScope(
      overrides: [apiClientProvider.overrideWithValue(ApiClient.forTesting(dio: dio, workspace: store))],
      child: const RealVistaCrmApp(),
    ));
    await _settle(tester);

    // The default workspace, by name, until something else is chosen.
    expect(find.text('Real Vista'), findsOneWidget);

    await tester.tap(find.text('Change'));
    await _settle(tester);
    await tester.enterText(find.byType(TextField).last, 'akmreal');
    await tester.tap(find.text('Continue'));
    await _settle(tester);
    expect(find.textContaining('no workspace called "akmreal"'), findsOneWidget);
    expect(store.slug, isEmpty, reason: 'a wrong name must not be kept');

    await tester.enterText(find.byType(TextField).last, 'AkmRealtor');
    await tester.tap(find.text('Continue'));
    await _settle(tester);
    expect(find.text('AkmRealtor'), findsOneWidget);
    expect(store.slug, 'akmrealtor');

    await tester.enterText(find.byType(TextField).at(0), 'rohit@example.com');
    await tester.enterText(find.byType(TextField).at(1), 'Secret-123');
    await tester.tap(find.text('Sign in').last);
    await _settle(tester);
    expect(adapter.signInTenants, ['akmrealtor']);
  });
}
