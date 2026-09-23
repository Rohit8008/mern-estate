/// Mirrors GET /api/dashboard/analytics. Deliberately narrower than the web
/// payload — v1 mobile skips byCategory/byCity/monthlyTrend breakdowns
/// (those feed the desktop's chart widgets, which the mobile dashboard
/// doesn't port; see AgencyDashboard.jsx) and keeps only what a KPI strip
/// and a recent-activity list need.
class DashboardAnalytics {
  const DashboardAnalytics({
    required this.properties,
    required this.buyers,
    required this.employees,
    required this.recentListings,
    required this.recentBuyers,
    this.sales,
  });

  /// Open deals, follow-ups, won deals and new clients (GET
  /// /api/analytics/dashboard); null if that request failed.
  final SalesOverview? sales;

  DashboardAnalytics withSales(SalesOverview? value) => DashboardAnalytics(
        properties: properties,
        buyers: buyers,
        employees: employees,
        recentListings: recentListings,
        recentBuyers: recentBuyers,
        sales: value,
      );

  final PropertyStats properties;
  final BuyerStats buyers;
  final EmployeeStats employees;
  final List<RecentListing> recentListings;
  final List<RecentBuyer> recentBuyers;

  factory DashboardAnalytics.fromJson(Map<String, dynamic> json) {
    final recent = json['recent'] as Map<String, dynamic>? ?? const {};
    return DashboardAnalytics(
      properties: PropertyStats.fromJson(json['properties'] as Map<String, dynamic>? ?? const {}),
      buyers: BuyerStats.fromJson(json['buyers'] as Map<String, dynamic>? ?? const {}),
      employees: EmployeeStats.fromJson(json['employees'] as Map<String, dynamic>? ?? const {}),
      recentListings: ((recent['listings'] as List?) ?? const [])
          .map((e) => RecentListing.fromJson(e as Map<String, dynamic>))
          .toList(),
      recentBuyers:
          ((recent['buyers'] as List?) ?? const []).map((e) => RecentBuyer.fromJson(e as Map<String, dynamic>)).toList(),
    );
  }
}

class PropertyStats {
  const PropertyStats({required this.total, required this.available, required this.sold, required this.rented, required this.underNegotiation});

  final int total;
  final int available;
  final int sold;
  final int rented;
  final int underNegotiation;

  factory PropertyStats.fromJson(Map<String, dynamic> json) => PropertyStats(
        total: (json['total'] as num?)?.toInt() ?? 0,
        available: (json['available'] as num?)?.toInt() ?? 0,
        sold: (json['sold'] as num?)?.toInt() ?? 0,
        rented: (json['rented'] as num?)?.toInt() ?? 0,
        underNegotiation: (json['underNegotiation'] as num?)?.toInt() ?? 0,
      );
}

/// The CRM half of the dashboard: right-now open deals and follow-ups, and
/// won deals / new clients over the last 30 days.
class SalesOverview {
  const SalesOverview({
    required this.openDeals,
    required this.pipelineValue,
    required this.followUpsOverdue,
    required this.followUpsUpcoming,
    required this.wonDeals,
    required this.wonCommission,
    required this.newClients,
    required this.totalClients,
  });

  final int openDeals;
  final num pipelineValue;
  final int followUpsOverdue;
  final int followUpsUpcoming;
  final int wonDeals;
  final num wonCommission;
  final int newClients;
  final int totalClients;

  factory SalesOverview.fromJson(Map<String, dynamic> json) {
    final deals = json['deals'] as Map<String, dynamic>? ?? const {};
    final fu = json['followUps'] as Map<String, dynamic>? ?? const {};
    final clients = json['clients'] as Map<String, dynamic>? ?? const {};
    int i(Object? v) => (v as num?)?.toInt() ?? 0;
    return SalesOverview(
      openDeals: i(deals['activeDeals']),
      pipelineValue: (deals['pipelineValue'] as num?) ?? 0,
      followUpsOverdue: i(fu['overdue']),
      followUpsUpcoming: i(fu['upcoming']),
      wonDeals: i(deals['closedWon']),
      wonCommission: (deals['totalCommission'] as num?) ?? 0,
      newClients: i(clients['new']),
      totalClients: i(clients['total']),
    );
  }
}

class BuyerStats {
  const BuyerStats({required this.total, required this.active, required this.matched, required this.closed});

  final int total;
  final int active;
  final int matched;
  final int closed;

  factory BuyerStats.fromJson(Map<String, dynamic> json) => BuyerStats(
        total: (json['total'] as num?)?.toInt() ?? 0,
        active: (json['active'] as num?)?.toInt() ?? 0,
        matched: (json['matched'] as num?)?.toInt() ?? 0,
        closed: (json['closed'] as num?)?.toInt() ?? 0,
      );
}

class EmployeeStats {
  const EmployeeStats({required this.total, required this.active});

  final int total;
  final int active;

  factory EmployeeStats.fromJson(Map<String, dynamic> json) => EmployeeStats(
        total: (json['total'] as num?)?.toInt() ?? 0,
        active: (json['active'] as num?)?.toInt() ?? 0,
      );
}

class RecentListing {
  const RecentListing({required this.id, required this.name, this.city, this.locality, required this.status});

  final String id;
  final String name;
  final String? city;
  final String? locality;
  final String status;

  factory RecentListing.fromJson(Map<String, dynamic> json) => RecentListing(
        id: json['_id'] as String? ?? '',
        name: json['name'] as String? ?? 'Untitled listing',
        city: json['city'] as String?,
        locality: json['locality'] as String?,
        status: json['status'] as String? ?? 'available',
      );
}

class RecentBuyer {
  const RecentBuyer({required this.id, required this.buyerName, this.buyerPhone, required this.status});

  final String id;
  final String buyerName;
  final String? buyerPhone;
  final String status;

  factory RecentBuyer.fromJson(Map<String, dynamic> json) => RecentBuyer(
        id: json['_id'] as String? ?? '',
        buyerName: json['buyerName'] as String? ?? 'Unnamed buyer',
        buyerPhone: json['buyerPhone'] as String?,
        status: json['status'] as String? ?? 'active',
      );
}
