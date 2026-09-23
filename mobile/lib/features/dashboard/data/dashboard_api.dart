import 'package:dio/dio.dart';

import '../../../core/errors/app_failure.dart';
import '../domain/dashboard_analytics.dart';

class DashboardApi {
  DashboardApi(this._dio);

  final Dio _dio;

  Future<DashboardAnalytics> fetchAnalytics() async {
    try {
      final res = await _dio.get<Map<String, dynamic>>('/api/dashboard/analytics');
      final body = res.data!;
      final json = body['data'] is Map<String, dynamic> ? body['data'] as Map<String, dynamic> : body;
      return DashboardAnalytics.fromJson(json).withSales(await _fetchSales());
    } on DioException catch (e) {
      throw AppFailure.fromDioException(e);
    }
  }

  /// The deals/follow-ups half. A role without CRM analytics access gets a
  /// 403 here, which must not take the whole dashboard down with it.
  Future<SalesOverview?> _fetchSales() async {
    try {
      final res = await _dio.get<Map<String, dynamic>>('/api/analytics/dashboard');
      final data = res.data?['data'];
      return data is Map<String, dynamic> ? SalesOverview.fromJson(data) : null;
    } on DioException {
      return null;
    }
  }
}
