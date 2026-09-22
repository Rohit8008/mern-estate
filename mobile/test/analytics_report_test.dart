import 'package:flutter_test/flutter_test.dart';
import 'package:realvista_crm/features/analytics/domain/analytics_report.dart';

/// The funnel comes from a `$facet` in analytics.controller.js, so every stage
/// is an array — `[{count: 7}]` or `[]` — never a number. Reading one as a
/// number threw `List<dynamic> is not a subtype of num?` and the Analytics
/// screen showed "Could not load analytics" for every workspace, empty or not.
/// These payloads are copied from the live `/api/analytics/leads/conversion`.
void main() {
  group('LeadsReport.fromJson', () {
    test(r'reads counts out of the $facet stage arrays', () {
      final report = LeadsReport.fromJson({
        'bySource': [
          {'_id': 'referral', 'count': 5},
          {'_id': null, 'count': 2},
        ],
        'funnel': {
          'total': [
            {'count': 12},
          ],
          'contacted': [
            {'count': 9},
          ],
          'qualified': [
            {'count': 6},
          ],
          'proposal': [
            {'count': 3},
          ],
          'won': [
            {'count': 1},
          ],
        },
        'conversionRate': 8.33,
        'avgConversionDays': 14,
      });

      expect(report.funnel.total, 12);
      expect(report.funnel.contacted, 9);
      expect(report.funnel.qualified, 6);
      expect(report.funnel.proposal, 3);
      expect(report.funnel.won, 1);
      expect(report.conversionRate, 8.33);
      expect(report.avgConversionDays, 14);

      // A null `_id` is a client with no source set, not a missing bucket.
      expect(report.bySource.map((b) => b.key), ['referral', 'Unspecified']);
      expect(report.bySource.map((b) => b.count), [5, 2]);
    });

    test('an empty workspace sends empty stage arrays, and reads as zeroes', () {
      final report = LeadsReport.fromJson({
        'byStatus': <dynamic>[],
        'bySource': <dynamic>[],
        'funnel': {
          'total': <dynamic>[],
          'contacted': <dynamic>[],
          'qualified': <dynamic>[],
          'proposal': <dynamic>[],
          'won': <dynamic>[],
        },
        'conversionRate': 0,
        'avgConversionDays': 0,
      });

      expect(report.funnel.stages.map((s) => s.$2), [0, 0, 0, 0, 0]);
      expect(report.bySource, isEmpty);
    });

    test('a missing funnel does not throw', () {
      final report = LeadsReport.fromJson({'bySource': <dynamic>[]});
      expect(report.funnel.total, 0);
      expect(report.conversionRate, 0);
    });
  });

  group('SalesReport.fromJson', () {
    test('byStage and closedDeals are plain groups, not facets', () {
      final report = SalesReport.fromJson({
        'byStage': [
          {'_id': 'negotiation', 'count': 2, 'value': 4500000},
        ],
        'closedDeals': {
          'totalValue': 9000000,
          'avgValue': 4500000,
          'count': 2,
          'totalCommission': 180000,
        },
      });

      expect(report.byStage.single.key, 'negotiation');
      expect(report.byStage.single.count, 2);
      expect(report.byStage.single.value, 4500000);
      expect(report.closedDeals.totalValue, 9000000);
      expect(report.closedDeals.count, 2);
    });

    test('an empty workspace falls back to zeroes', () {
      final report = SalesReport.fromJson({'byStage': <dynamic>[], 'closedDeals': null});
      expect(report.byStage, isEmpty);
      expect(report.closedDeals.totalValue, 0);
      expect(report.closedDeals.count, 0);
    });
  });
}
