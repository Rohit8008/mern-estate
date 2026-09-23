// Widget smoke tests: no live backend is reachable inside a plain widget
// test, so ApiClient is built with a fake HttpClientAdapter whose canned
// responses exercise both the offline/retry path and the full
// bootstrap -> authenticated -> shell -> permission-pruned-More path
// without any real network dependency.

import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:realvista_crm/core/network/api_client.dart';
import 'package:realvista_crm/core/network/providers.dart';
import 'package:realvista_crm/main.dart';

class _AlwaysFailingAdapter implements HttpClientAdapter {
  @override
  Future<ResponseBody> fetch(RequestOptions options, Stream<Uint8List>? requestStream, Future<void>? cancelFuture) {
    throw DioException.connectionError(requestOptions: options, reason: 'no network in test');
  }

  @override
  void close({bool force = false}) {}
}

/// Routes by path suffix to a canned JSON body — enough to drive the auth
/// bootstrap and permissions fetch without a real backend.
class _FakeRoutedAdapter implements HttpClientAdapter {
  _FakeRoutedAdapter(this._responses);
  // Value is the JSON body — a Map for most endpoints, but a bare List for
  // e.g. GET /api/category/list (no {success,data} wrapper on that one).
  final Map<String, dynamic> _responses;

  @override
  Future<ResponseBody> fetch(RequestOptions options, Stream<Uint8List>? requestStream, Future<void>? cancelFuture) async {
    // Exact-path matches first (list vs detail both contain '/clients', so a
    // plain .contains() would conflate them), then fall back to substring.
    for (final entry in _responses.entries) {
      if (options.path == entry.key) {
        return _respond(entry.value);
      }
    }
    for (final entry in _responses.entries) {
      if (options.path.contains(entry.key)) {
        return _respond(entry.value);
      }
    }
    throw DioException(requestOptions: options, response: Response(requestOptions: options, statusCode: 404));
  }

  ResponseBody _respond(dynamic body) => ResponseBody.fromString(jsonEncode(body), 200, headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      });

  @override
  void close({bool force = false}) {}
}

ApiClient _offlineApiClient() {
  final dio = Dio(BaseOptions(baseUrl: 'http://localhost:3000'))..httpClientAdapter = _AlwaysFailingAdapter();
  return ApiClient.forTesting(dio: dio);
}

ApiClient _employeeApiClient() {
  final dio = Dio(BaseOptions(baseUrl: 'http://localhost:3000'))
    ..httpClientAdapter = _FakeRoutedAdapter({
      '/user/my-permissions': {
        'permissions': {'viewClients': true, 'viewListings': true},
      },
      '/user/me': {
        'data': {
          '_id': '1',
          'username': 'agent007',
          'email': 'agent@realvista.com',
          'role': 'employee',
          'status': 'active',
          'firstName': 'Asha',
          'lastName': 'Rao',
        },
      },
      '/dashboard/analytics': {
        'data': {
          'properties': {'total': 312, 'available': 200, 'sold': 80, 'underNegotiation': 32},
          'buyers': {'total': 48, 'active': 30, 'matched': 12, 'closed': 6},
          'employees': {'total': 9, 'active': 8},
          'recent': {
            'listings': [
              {'_id': 'l1', 'name': 'Sunrise Villa', 'city': 'Pune', 'locality': 'Baner', 'status': 'available'},
            ],
            'buyers': [
              {'_id': 'b1', 'buyerName': 'Rohan Mehta', 'buyerPhone': '+919876543210', 'status': 'active'},
            ],
          },
        },
      },
      '/api/clients': {
        'data': [
          {'_id': 'c1', 'name': 'Priya Sharma', 'phone': '+919812345678', 'email': 'priya@example.com', 'status': 'contacted', 'priority': 'high', 'contactType': 'lead'},
        ],
      },
      '/api/documents': {
        'data': [
          {'_id': 'd1', 'title': 'Sale Agreement.pdf', 'filename': 'sale_agreement.pdf', 'mimeType': 'application/pdf', 'size': 204800, 'url': 'https://example.com/uploads/docs/sale_agreement.pdf', 'createdAt': '2026-08-10T00:00:00.000Z'},
        ],
      },
      '/api/clients/c1': {
        'data': {
          '_id': 'c1',
          'name': 'Priya Sharma',
          'phone': '+919812345678',
          'email': 'priya@example.com',
          'status': 'contacted',
          'priority': 'high',
          'contactType': 'lead',
          'notes': 'Interested in 3BHK near Baner.',
          'deals': [
            {'_id': 'd1', 'stage': 'negotiation', 'value': 8500000, 'type': 'sale', 'commission': {'percentage': 2, 'amount': 170000, 'status': 'pending'}, 'notes': 'Awaiting final offer.'},
          ],
          'followUps': [
            {'_id': 'f1', 'dueAt': '2026-09-01T10:00:00.000Z', 'type': 'site_visit', 'notes': 'Show Baner property.', 'completed': false},
          ],
          'communications': [
            {'_id': 'k1', 'type': 'call', 'direction': 'outbound', 'summary': 'Discussed budget and locality.', 'outcome': 'Interested', 'createdAt': '2026-08-15T09:00:00.000Z'},
          ],
        },
      },
      '/api/tasks': {
        'data': [
          {'_id': 't1', 'title': 'Send brochure to Priya', 'status': 'todo', 'priority': 'medium', 'dueAt': '2026-08-25T09:00:00.000Z', 'related': {'kind': 'client', 'clientId': 'c1'}},
        ],
      },
      '/api/crm/follow-ups/upcoming': {
        'data': {
          'total': 1,
          'overdue': 0,
          'dueToday': 0,
          'followUps': [
            {'clientId': 'c1', 'clientName': 'Priya Sharma', 'followUpId': 'f1', 'dueAt': '2026-09-01T10:00:00.000Z', 'type': 'site_visit', 'notes': 'Show Baner property.', 'isOverdue': false, 'isDueToday': false},
          ],
        },
      },
      '/api/listing/my-assigned': {
        'data': {
          'listings': [
            {
              '_id': 'l1',
              'name': 'Sunrise Villa',
              'city': 'Pune',
              'locality': 'Baner',
              'regularPrice': 8500000,
              'discountPrice': 0,
              'offer': false,
              'type': 'sale',
              'status': 'available',
              'bedrooms': 3,
              'bathrooms': 2,
              'furnished': true,
              'parking': true,
              'imageUrls': <String>[],
              'location': {'lat': 18.5599, 'lng': 73.7871},
              'category': 'villa',
              'propertyType': 'independent-house',
            },
          ],
          'pagination': {'hasMore': false},
        },
      },
      '/api/listing/get/l1': {
        '_id': 'l1',
        'name': 'Sunrise Villa',
        'address': '123 Baner Road',
        'city': 'Pune',
        'locality': 'Baner',
        'regularPrice': 8500000,
        'discountPrice': 0,
        'offer': false,
        'type': 'sale',
        'status': 'available',
        'bedrooms': 3,
        'bathrooms': 2,
        'furnished': true,
        'parking': true,
        'imageUrls': <String>[],
        'location': {'lat': 18.5599, 'lng': 73.7871},
        'category': 'villa',
        'propertyType': 'independent-house',
        'areaSqFt': 1800,
        'attributes': {'facing': 'east'},
        'propertyTypeFields': {'floors': 2},
        'owners': [
          {'_id': 'o1', 'name': 'Ramesh Kumar', 'companyName': 'Kumar Estates', 'phone': '+919812345000', 'email': 'ramesh@example.com'},
        ],
      },
      '/api/category/list': [],
      '/api/property-types/list': {
        'data': [
          {
            '_id': 'pt1',
            'name': 'Independent House',
            'slug': 'independent-house',
            'fields': [
              {'key': 'floors', 'label': 'Number of Floors', 'type': 'number', 'unit': 'floors', 'order': 1},
            ],
          },
        ],
        'count': 1,
      },
      '/api/message/conversations': [
        {
          'otherId': 'u9',
          'otherUser': {'_id': 'u9', 'username': 'rahul_agent', 'firstName': 'Rahul'},
          'lastMessage': {'_id': 'm1', 'senderId': 'u9', 'receiverId': '1', 'content': 'Can you check the Baner listing?', 'read': false, 'createdAt': '2026-08-19T10:00:00.000Z'},
          'unread': 1,
        },
      ],
      '/api/message/thread/u9': [
        {'_id': 'm1', 'senderId': 'u9', 'receiverId': '1', 'content': 'Can you check the Baner listing?', 'read': false, 'createdAt': '2026-08-19T10:00:00.000Z'},
      ],
    });
  return ApiClient.forTesting(dio: dio);
}

/// Admin user — bypasses the /user/my-permissions fetch entirely (admins
/// get {_all: true} client-side, per PermissionsContext.jsx parity) and
/// exercises the Owners/Buyers/Transactions/Tasks screens reached from More.
ApiClient _adminApiClient() {
  final dio = Dio(BaseOptions(baseUrl: 'http://localhost:3000'))
    ..httpClientAdapter = _FakeRoutedAdapter({
      '/user/me': {
        'data': {'_id': '2', 'username': 'admin01', 'email': 'admin@realvista.com', 'role': 'admin', 'status': 'active', 'firstName': 'Meera'},
      },
      '/dashboard/analytics': {
        'data': {
          'properties': {'total': 0, 'available': 0, 'sold': 0, 'underNegotiation': 0},
          'buyers': {'total': 0, 'active': 0, 'matched': 0, 'closed': 0},
          'employees': {'total': 0, 'active': 0},
          'recent': {'listings': [], 'buyers': []},
        },
      },
      '/api/listing/get': {
        'data': {'listings': [], 'pagination': {'hasMore': false}},
      },
      '/api/category/list': [],
      '/api/property-types/list': {'data': [], 'count': 0},
      '/api/owner/list': [
        {'_id': 'ow1', 'name': 'Vikram Singh', 'companyName': 'Singh Properties', 'phone': '+919900011122', 'active': true},
      ],
      '/api/listing/create': {
        'data': {'_id': 'newl1', 'name': 'Test Villa', 'address': '42 Test Lane', 'regularPrice': 5000000, 'discountPrice': 0, 'offer': false, 'type': 'sale', 'status': 'available', 'bedrooms': 1, 'bathrooms': 1, 'furnished': false, 'parking': false, 'imageUrls': <String>[]},
      },
      '/api/buyer-requirements': [
        {
          '_id': 'br1',
          'buyerName': 'Anita Desai',
          'buyerPhone': '+919900033344',
          'preferredLocation': 'Kothrud',
          'propertyType': 'sale',
          'propertyTypeInterest': 'residential',
          'minPrice': 3000000,
          'maxPrice': 6000000,
          'status': 'active',
          'priority': 'medium',
        },
      ],
      '/api/transactions/stats': {
        'data': {'totalPipeline': 8500000, 'totalCommission': 170000, 'completed': 1, 'pending': 0},
      },
      '/api/transactions': {
        'data': [
          {'_id': 'tx1', 'propertyName': 'Sunrise Villa', 'clientName': 'Priya Sharma', 'type': 'sale', 'amount': 8500000, 'commissionPercent': 2, 'commission': 170000, 'status': 'completed'},
        ],
      },
      '/api/tasks': {
        'data': [
          {'_id': 't1', 'title': 'Send brochure to Priya', 'status': 'todo', 'priority': 'medium', 'related': {'kind': 'none'}},
        ],
      },
    });
  return ApiClient.forTesting(dio: dio);
}

// PageView (non-.builder) mounts all wizard steps at once, so a plain
// find.byType(TextField).at(N) indexes across every step's fields, not just
// the visible step's — hence looking fields up by their explicit Key.
Finder _fieldWithKey(String key) => find.descendant(of: find.byKey(Key(key)), matching: find.byType(TextField));

Future<void> _settle(WidgetTester tester) async {
  // A fixed number of pumps, not pumpAndSettle: some component states
  // (e.g. spinners, ripples) animate forever and would never let it return.
  for (var i = 0; i < 10; i++) {
    await tester.pump(const Duration(milliseconds: 200));
  }
}

void main() {
  testWidgets('shows the offline/retry state when the backend is unreachable', (WidgetTester tester) async {
    await tester.pumpWidget(ProviderScope(
      overrides: [apiClientProvider.overrideWithValue(_offlineApiClient())],
      child: const RealVistaCrmApp(),
    ));
    await _settle(tester);

    expect(tester.takeException(), isNull);
    expect(find.text('Unable to reach Real Vista'), findsOneWidget);
    expect(find.text('Retry'), findsOneWidget);
  });

  testWidgets('bootstraps into the shell and prunes More by permission', (WidgetTester tester) async {
    await tester.pumpWidget(ProviderScope(
      overrides: [apiClientProvider.overrideWithValue(_employeeApiClient())],
      child: const RealVistaCrmApp(),
    ));
    await _settle(tester);

    expect(tester.takeException(), isNull);
    // Lands on the Dashboard tab inside the bottom-nav shell, with real
    // analytics rendered (greeting name, KPI value, recent activity row).
    expect(find.text('Dashboard'), findsWidgets);
    expect(find.text('Leads'), findsOneWidget);
    expect(find.text('Properties'), findsOneWidget);
    expect(find.text('Activities'), findsOneWidget);
    expect(find.textContaining('Asha'), findsOneWidget);
    expect(find.text('312'), findsOneWidget);

    // The recent-activity rows are below the fold in the test viewport —
    // scroll the dashboard list down to bring them into the widget tree.
    await tester.drag(find.byType(ListView).first, const Offset(0, -400));
    await _settle(tester);
    expect(find.text('Sunrise Villa'), findsOneWidget);
    expect(find.text('Rohan Mehta'), findsOneWidget);

    await tester.tap(find.byTooltip('More'));
    await _settle(tester);

    // This employee only has viewClients/viewListings — every More item
    // gated behind viewAnalytics/viewOwners/viewBuyerRequirements/exportData
    // must be pruned; the ungated ones (Messages, Settings) must remain.
    expect(find.text('Analytics'), findsNothing);
    expect(find.text('Property Owners'), findsNothing);
    expect(find.text('Buyer Requirements'), findsNothing);
    expect(find.text('Transactions'), findsNothing);
    expect(find.text('Client Reports'), findsNothing);
    expect(find.text('Messages'), findsOneWidget);
    expect(find.text('Settings'), findsOneWidget);
    expect(find.text('Admin Panel'), findsNothing);
  });

  testWidgets('system back closes an opened screen instead of the app', (WidgetTester tester) async {
    var exited = 0;
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, (call) async {
      if (call.method == 'SystemNavigator.pop') exited++;
      return null;
    });
    await tester.pumpWidget(ProviderScope(
      overrides: [apiClientProvider.overrideWithValue(_employeeApiClient())],
      child: const RealVistaCrmApp(),
    ));
    await _settle(tester);

    await tester.tap(find.text('Leads'));
    await _settle(tester);
    await tester.tap(find.text('Priya Sharma'));
    await _settle(tester);
    expect(find.text('Overview'), findsOneWidget);
    await tester.binding.handlePopRoute();
    await _settle(tester);
    expect(exited, 0, reason: 'back from a lead exited the app');
    expect(find.text('Overview'), findsNothing);

    // A tab other than Dashboard goes back to Dashboard first.
    await tester.tap(find.text('Properties').last);
    await _settle(tester);
    await tester.binding.handlePopRoute();
    await _settle(tester);
    expect(exited, 0, reason: 'back on the Properties tab exited the app');
    expect(find.text('Dashboard'), findsWidgets);
  });

  testWidgets('system back from More screens returns instead of exiting', (WidgetTester tester) async {
    var exited = 0;
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, (call) async {
      if (call.method == 'SystemNavigator.pop') exited++;
      return null;
    });
    await tester.pumpWidget(ProviderScope(
      overrides: [apiClientProvider.overrideWithValue(_adminApiClient())],
      child: const RealVistaCrmApp(),
    ));
    await _settle(tester);

    await tester.tap(find.byTooltip('More'));
    await _settle(tester);
    await tester.tap(find.text('Property Owners'));
    await _settle(tester);
    await tester.binding.handlePopRoute();
    await _settle(tester);
    expect(exited, 0, reason: 'back from Owners exited the app');
    expect(find.text('Admin Panel'), findsOneWidget);
    await tester.binding.handlePopRoute();
    await _settle(tester);
    expect(exited, 0, reason: 'back from More exited the app');

  });

  testWidgets('cards fit at a large system font size', (WidgetTester tester) async {
    // Phones with "Font size: Largest" were where the cards overflowed.
    tester.platformDispatcher.textScaleFactorTestValue = 1.6;
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    await tester.pumpWidget(ProviderScope(
      overrides: [apiClientProvider.overrideWithValue(_adminApiClient())],
      child: const RealVistaCrmApp(),
    ));
    await _settle(tester);
    expect(tester.takeException(), isNull, reason: 'Dashboard overflowed');

    await tester.tap(find.text('Properties').last);
    await _settle(tester);
    expect(tester.takeException(), isNull, reason: 'Properties grid overflowed');

    await tester.tap(find.byTooltip('More'));
    await _settle(tester);
    await tester.tap(find.text('Transactions'));
    await _settle(tester);
    expect(tester.takeException(), isNull, reason: 'Transactions overflowed');
  });

  testWidgets('Leads tab lists a lead and opens its detail', (WidgetTester tester) async {
    await tester.pumpWidget(ProviderScope(
      overrides: [apiClientProvider.overrideWithValue(_employeeApiClient())],
      child: const RealVistaCrmApp(),
    ));
    await _settle(tester);

    await tester.tap(find.text('Leads'));
    await _settle(tester);

    expect(tester.takeException(), isNull);
    expect(find.text('Priya Sharma'), findsOneWidget);
    expect(find.text('Contacted'), findsWidgets);

    await tester.tap(find.text('Priya Sharma'));
    await _settle(tester);

    expect(tester.takeException(), isNull);
    expect(find.text('Overview'), findsOneWidget);
    expect(find.text('Deals'), findsOneWidget);

    // The notes card is below the fold in the test viewport.
    await tester.drag(find.byType(ListView).first, const Offset(0, -400));
    await _settle(tester);
    expect(find.text('Interested in 3BHK near Baner.'), findsOneWidget);
  });

  testWidgets('Lead detail tabs render embedded deals/follow-ups/communications and fetched tasks', (WidgetTester tester) async {
    await tester.pumpWidget(ProviderScope(
      overrides: [apiClientProvider.overrideWithValue(_employeeApiClient())],
      child: const RealVistaCrmApp(),
    ));
    await _settle(tester);

    await tester.tap(find.text('Leads'));
    await _settle(tester);
    await tester.tap(find.text('Priya Sharma'));
    await _settle(tester);

    await tester.tap(find.text('Deals'));
    await _settle(tester);
    expect(tester.takeException(), isNull);
    expect(find.text('Negotiation'), findsOneWidget);
    expect(find.text('₹85,00,000'), findsOneWidget);

    await tester.tap(find.text('Follow-ups'));
    await _settle(tester);
    expect(tester.takeException(), isNull);
    expect(find.text('Site Visit'), findsOneWidget);
    expect(find.text('Show Baner property.'), findsOneWidget);

    await tester.tap(find.text('Communications'));
    await _settle(tester);
    expect(tester.takeException(), isNull);
    expect(find.text('Discussed budget and locality.'), findsOneWidget);

    await tester.tap(find.text('Tasks'));
    await _settle(tester);
    expect(tester.takeException(), isNull);
    expect(find.text('Send brochure to Priya'), findsOneWidget);
  });

  testWidgets('Properties tab lists a listing and resolves its dynamic fields generically', (WidgetTester tester) async {
    await tester.pumpWidget(ProviderScope(
      overrides: [apiClientProvider.overrideWithValue(_employeeApiClient())],
      child: const RealVistaCrmApp(),
    ));
    await _settle(tester);

    await tester.tap(find.text('Properties'));
    await _settle(tester);

    expect(tester.takeException(), isNull);
    expect(find.text('Sunrise Villa'), findsOneWidget);

    await tester.tap(find.text('Sunrise Villa'));
    await _settle(tester);

    expect(tester.takeException(), isNull);
    // 'floors' resolves against the PropertyType field def (label + unit);
    // 'facing' has no Category field def in this fixture, so it falls back
    // to the humanized raw key.
    expect(find.text('Number of Floors'), findsOneWidget);
    expect(find.text('2 floors'), findsOneWidget);
    expect(find.text('Facing'), findsOneWidget);
    expect(find.text('east'), findsOneWidget);
    expect(find.text('Ramesh Kumar'), findsOneWidget);
  });

  testWidgets('More screen reaches Owners, Buyers, Transactions, and Tasks for an admin', (WidgetTester tester) async {
    await tester.pumpWidget(ProviderScope(
      overrides: [apiClientProvider.overrideWithValue(_adminApiClient())],
      child: const RealVistaCrmApp(),
    ));
    await _settle(tester);

    await tester.tap(find.byTooltip('More'));
    await _settle(tester);

    // Admins bypass the permission fetch entirely (client-side {_all: true}
    // shortcut) — every gated item, plus Admin Panel, must be visible.
    expect(find.text('Property Owners'), findsOneWidget);
    expect(find.text('Buyer Requirements'), findsOneWidget);
    expect(find.text('Transactions'), findsOneWidget);
    expect(find.text('Tasks'), findsOneWidget);
    expect(find.text('Admin Panel'), findsOneWidget);

    await tester.tap(find.text('Property Owners'));
    await _settle(tester);
    expect(tester.takeException(), isNull);
    expect(find.text('Vikram Singh'), findsOneWidget);
    await tester.tap(find.byTooltip('Back'));
    await _settle(tester);

    await tester.tap(find.text('Buyer Requirements'));
    await _settle(tester);
    expect(tester.takeException(), isNull);
    expect(find.text('Anita Desai'), findsOneWidget);
    await tester.tap(find.byTooltip('Back'));
    await _settle(tester);

    await tester.tap(find.text('Transactions'));
    await _settle(tester);
    expect(tester.takeException(), isNull);
    expect(find.text('Sunrise Villa'), findsOneWidget);
    expect(find.text('Priya Sharma'), findsOneWidget);
    await tester.tap(find.byTooltip('Back'));
    await _settle(tester);

    await tester.tap(find.text('Tasks'));
    await _settle(tester);
    expect(tester.takeException(), isNull);
    expect(find.text('Send brochure to Priya'), findsOneWidget);
  });

  testWidgets('Activities tab merges tasks and upcoming follow-ups, filterable to Site Visits', (WidgetTester tester) async {
    await tester.pumpWidget(ProviderScope(
      overrides: [apiClientProvider.overrideWithValue(_employeeApiClient())],
      child: const RealVistaCrmApp(),
    ));
    await _settle(tester);

    await tester.tap(find.text('Activities'));
    await _settle(tester);

    expect(tester.takeException(), isNull);
    expect(find.text('Send brochure to Priya'), findsOneWidget);
    expect(find.textContaining('Priya Sharma'), findsWidgets);

    // Site Visits filters out the task, keeping only the site_visit follow-up.
    await tester.tap(find.text('Site Visits'));
    await _settle(tester);
    expect(tester.takeException(), isNull);
    expect(find.text('Send brochure to Priya'), findsNothing);
    expect(find.textContaining('Site Visit'), findsWidgets);
  });

  testWidgets('Messages: conversation list opens a thread with its history', (WidgetTester tester) async {
    await tester.pumpWidget(ProviderScope(
      overrides: [apiClientProvider.overrideWithValue(_employeeApiClient())],
      child: const RealVistaCrmApp(),
    ));
    await _settle(tester);

    await tester.tap(find.byTooltip('More'));
    await _settle(tester);
    await tester.tap(find.text('Messages'));
    await _settle(tester);

    expect(tester.takeException(), isNull);
    expect(find.text('Rahul'), findsOneWidget);
    expect(find.text('Can you check the Baner listing?'), findsWidgets);
    expect(find.text('1'), findsOneWidget); // unread badge

    await tester.tap(find.text('Rahul'));
    await _settle(tester);

    expect(tester.takeException(), isNull);
    expect(find.text('Can you check the Baner listing?'), findsOneWidget);
  });

  testWidgets('Documents panel renders on both a lead and a property', (WidgetTester tester) async {
    await tester.pumpWidget(ProviderScope(
      overrides: [apiClientProvider.overrideWithValue(_employeeApiClient())],
      child: const RealVistaCrmApp(),
    ));
    await _settle(tester);

    await tester.tap(find.text('Leads'));
    await _settle(tester);
    await tester.tap(find.text('Priya Sharma'));
    await _settle(tester);
    // The lead-detail TabBar is scrollable and 'Documents' is the 6th tab —
    // off the edge of the test viewport until scrolled into view.
    await tester.ensureVisible(find.text('Documents'));
    await _settle(tester);
    await tester.tap(find.text('Documents'));
    await _settle(tester);

    expect(tester.takeException(), isNull);
    expect(find.text('Sale Agreement.pdf'), findsOneWidget);
    expect(find.textContaining('200 KB'), findsOneWidget);

    await tester.tap(find.byTooltip('Back'));
    await _settle(tester);
    await tester.tap(find.text('Properties'));
    await _settle(tester);
    await tester.tap(find.text('Sunrise Villa'));
    await _settle(tester);
    await tester.drag(find.byType(ListView).first, const Offset(0, -800));
    await _settle(tester);

    expect(tester.takeException(), isNull);
    expect(find.text('Documents'), findsOneWidget);
    expect(find.text('Sale Agreement.pdf'), findsOneWidget);
  });

  testWidgets('Create Listing wizard: validates required fields per step and submits', (WidgetTester tester) async {
    // A typical phone viewport, not the default 800x600 test surface — the
    // wizard's fixed AppBar+bottom-button chrome needs realistic height to
    // judge overflow against.
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(ProviderScope(
      overrides: [apiClientProvider.overrideWithValue(_adminApiClient())],
      child: const RealVistaCrmApp(),
    ));
    await _settle(tester);

    await tester.tap(find.byType(FloatingActionButton));
    await _settle(tester);
    await tester.tap(find.text('Add Property'));
    await _settle(tester);

    expect(tester.takeException(), isNull);
    expect(find.text('New Property'), findsOneWidget);

    // Step 1 (Basics): advancing with no name must be blocked with an error.
    await tester.tap(find.text('Continue'));
    await _settle(tester);
    expect(find.text('Name must be at least 3 characters.'), findsOneWidget);

    await tester.enterText(_fieldWithKey('listing-name-field'), 'Test Villa');
    await tester.tap(find.text('Continue'));
    await _settle(tester);

    // Step 2 (Location): advancing with no address must be blocked.
    expect(find.text('Step 2 of 6'), findsOneWidget, reason: 'should have advanced past Basics');
    await tester.tap(find.text('Continue'));
    await _settle(tester);
    expect(find.text('Address must be at least 5 characters.'), findsOneWidget);
    await tester.enterText(_fieldWithKey('listing-address-field'), '42 Test Lane');
    await tester.tap(find.text('Continue'));
    await _settle(tester);

    // Step 3 (Pricing): advancing with no price must be blocked.
    expect(find.text('Step 3 of 6'), findsOneWidget, reason: 'should have advanced past Location');
    await tester.tap(find.text('Continue'));
    await _settle(tester);
    expect(find.text('Enter a valid price.'), findsOneWidget);
    await tester.enterText(_fieldWithKey('listing-price-field'), '5000000');
    await tester.tap(find.text('Continue'));
    await _settle(tester);

    // Step 4 (Owners) — fetched from the same /api/owner/list as the Owners screen.
    expect(find.text('Vikram Singh'), findsOneWidget);
    await tester.tap(find.text('Continue'));
    await _settle(tester);

    // Step 5 (Photos) — nothing required.
    await tester.tap(find.text('Continue'));
    await _settle(tester);

    // Step 6 (Review) — submit.
    expect(find.text('Test Villa'), findsWidgets);
    await tester.tap(find.text('Create listing'));
    await _settle(tester);

    expect(tester.takeException(), isNull);
    expect(find.text('New Property'), findsNothing);
  });
}
