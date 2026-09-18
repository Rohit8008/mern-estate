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
      return DashboardAnalytics.fromJson(json);
    } on DioException catch (e) {
      throw AppFailure.fromDioException(e);
    }
  }
}
