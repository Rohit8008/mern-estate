// Scheduling a follow-up has to refresh the Activities agenda, not just the
// lead it belongs to.
//
// `upcomingFollowUpsProvider` is not autoDispose, so once the Activities tab
// has built it, it caches for the rest of the session. The quick-action sheet
// ("Log Follow-up" / "Schedule Visit") returns you straight to that tab — so
// when AddFollowUpScreen invalidated only `leadDetailProvider`, the follow-up
// was saved by the server and then never appeared anywhere the user was
// looking. It reads exactly like the save silently failed.

import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:realvista_crm/core/network/api_client.dart';
import 'package:realvista_crm/core/network/providers.dart';
import 'package:realvista_crm/features/activities/activities_providers.dart';
import 'package:realvista_crm/features/leads/presentation/add_follow_up_screen.dart';

class _RecordingAdapter implements HttpClientAdapter {
  int upcomingGets = 0;
  final List<String> postedPaths = [];
  final List<Map<String, dynamic>> postedBodies = [];

  @override
  Future<ResponseBody> fetch(RequestOptions options, Stream<Uint8List>? requestStream, Future<void>? cancelFuture) async {
    final method = options.method.toUpperCase();

    if (method == 'GET' && options.path.contains('/follow-ups/upcoming')) {
      upcomingGets++;
      return _json({
        'success': true,
        'data': {'total': 0, 'overdue': 0, 'dueToday': 0, 'followUps': <dynamic>[]},
      });
    }

    if (method == 'POST' && options.path.contains('/follow-ups')) {
      postedPaths.add(options.path);
      final data = options.data;
      postedBodies.add(data is Map<String, dynamic> ? data : <String, dynamic>{});
      return _json({'success': true, 'message': 'Follow-up scheduled'});
    }

    throw DioException(requestOptions: options, response: Response(requestOptions: options, statusCode: 404));
  }

  ResponseBody _json(Object body) => ResponseBody.fromString(jsonEncode(body), 200, headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      });

  @override
  void close({bool force = false}) {}
}

/// Stands in for the Activities tab: it watches the agenda provider from inside
/// the widget tree, which is what keeps that provider alive between visits in
/// the real app. Everything stays inside the pump loop — awaiting a provider
/// future directly from the test body deadlocks under the test binding.
class _AgendaWatcher extends ConsumerWidget {
  const _AgendaWatcher();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final agenda = ref.watch(upcomingFollowUpsProvider);
    return Text('agenda:${agenda.valueOrNull?.length ?? -1}', textDirection: TextDirection.ltr);
  }
}

void main() {
  testWidgets('scheduling a follow-up refetches the Activities agenda', (tester) async {
    final adapter = _RecordingAdapter();
    final dio = Dio(BaseOptions(baseUrl: 'http://test.local'))..httpClientAdapter = adapter;

    await tester.pumpWidget(
      ProviderScope(
        overrides: [apiClientProvider.overrideWithValue(ApiClient.forTesting(dio: dio))],
        child: const MaterialApp(
          home: Column(
            children: [
              _AgendaWatcher(),
              Expanded(
                child: AddFollowUpScreen(leadId: 'lead-1', leadName: 'QA Lead', initialType: 'site_visit'),
              ),
            ],
          ),
        ),
      ),
    );

    // Bounded pumps, never pumpAndSettle: the submit button swaps in a
    // CircularProgressIndicator, and an indefinite animation means
    // pumpAndSettle never returns.
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    expect(adapter.upcomingGets, 1, reason: 'the agenda loads once up front');

    await tester.tap(find.text('Schedule follow-up'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(adapter.postedPaths, ['/api/crm/lead-1/follow-ups']);
    expect(adapter.postedBodies.single['type'], 'site_visit');

    // The invalidation must have driven a second fetch. Without it the agenda
    // keeps serving its first, now-stale answer for the rest of the session.
    await tester.pump(const Duration(milliseconds: 100));
    expect(adapter.upcomingGets, 2, reason: 'the agenda must refetch after a follow-up is scheduled');
  });
}
