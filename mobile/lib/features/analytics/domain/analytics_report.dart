/// A `{_id, count, value?}` bucket, which is what every `$group` in
/// analytics.controller.js returns. One class rather than three, because the
/// only difference between stage/status/source breakdowns is the label.
class AnalyticsBucket {
  const AnalyticsBucket({required this.key, required this.count, this.value});

  final String key;
  final int count;
  final num? value;

  factory AnalyticsBucket.fromJson(Map<String, dynamic> json) => AnalyticsBucket(
        // `_id` is null for records with no value set for the grouped field.
        key: (json['_id'] as String?)?.trim().isNotEmpty == true ? json['_id'] as String : 'Unspecified',
        count: (json['count'] as num?)?.toInt() ?? 0,
        value: json['value'] as num?,
      );
}

class ClosedDeals {
  const ClosedDeals({
    required this.totalValue,
    required this.avgValue,
    required this.count,
    required this.totalCommission,
  });

  final num totalValue;
  final num avgValue;
  final int count;
  final num totalCommission;

  factory ClosedDeals.fromJson(Map<String, dynamic>? json) => ClosedDeals(
        totalValue: (json?['totalValue'] as num?) ?? 0,
        avgValue: (json?['avgValue'] as num?) ?? 0,
        count: ((json?['count'] as num?) ?? 0).toInt(),
        totalCommission: (json?['totalCommission'] as num?) ?? 0,
      );
}

class SalesReport {
  const SalesReport({required this.byStage, required this.closedDeals});

  final List<AnalyticsBucket> byStage;
  final ClosedDeals closedDeals;

  factory SalesReport.fromJson(Map<String, dynamic> json) => SalesReport(
        byStage: ((json['byStage'] as List<dynamic>?) ?? const [])
            .map((e) => AnalyticsBucket.fromJson(e as Map<String, dynamic>))
            .toList(),
        closedDeals: ClosedDeals.fromJson(json['closedDeals'] as Map<String, dynamic>?),
      );
}

class LeadFunnel {
  const LeadFunnel({
    required this.total,
    required this.contacted,
    required this.qualified,
    required this.proposal,
    required this.won,
  });

  final int total;
  final int contacted;
  final int qualified;
  final int proposal;
  final int won;

  /// The server sends `conversionFunnel[0]`, which is absent entirely when the
  /// workspace has no clients yet — so this must tolerate null rather than
  /// throwing on an empty account.
  factory LeadFunnel.fromJson(Map<String, dynamic>? json) => LeadFunnel(
        total: _stageCount(json?['total']),
        contacted: _stageCount(json?['contacted']),
        qualified: _stageCount(json?['qualified']),
        proposal: _stageCount(json?['proposal']),
        won: _stageCount(json?['won']),
      );

  /// Each funnel stage is one branch of the controller's `$facet`, and a `$facet`
  /// branch is always an array: `[{count: 7}]` when it matched, `[]` when nothing
  /// did. It is never a bare number, so reading it as one threw
  /// `List<dynamic> is not a subtype of num?` and broke the whole screen.
  static int _stageCount(dynamic stage) {
    if (stage is List) {
      final first = stage.isEmpty ? null : stage.first;
      return first is Map<String, dynamic> ? ((first['count'] as num?) ?? 0).toInt() : 0;
    }
    return ((stage as num?) ?? 0).toInt();
  }

  List<(String, int)> get stages => [
        ('All leads', total),
        ('Contacted', contacted),
        ('Qualified', qualified),
        ('Proposal', proposal),
        ('Won', won),
      ];
}

class LeadsReport {
  const LeadsReport({
    required this.funnel,
    required this.bySource,
    required this.conversionRate,
    required this.avgConversionDays,
  });

  final LeadFunnel funnel;
  final List<AnalyticsBucket> bySource;
  final num conversionRate;
  final int avgConversionDays;

  factory LeadsReport.fromJson(Map<String, dynamic> json) => LeadsReport(
        funnel: LeadFunnel.fromJson(json['funnel'] as Map<String, dynamic>?),
        bySource: ((json['bySource'] as List<dynamic>?) ?? const [])
            .map((e) => AnalyticsBucket.fromJson(e as Map<String, dynamic>))
            .toList(),
        conversionRate: (json['conversionRate'] as num?) ?? 0,
        avgConversionDays: ((json['avgConversionDays'] as num?) ?? 0).toInt(),
      );
}

/// Both reports together, so the screen makes one state transition instead of
/// two independent spinners that finish at different times.
class AnalyticsReport {
  const AnalyticsReport({required this.sales, required this.leads});

  final SalesReport sales;
  final LeadsReport leads;
}
