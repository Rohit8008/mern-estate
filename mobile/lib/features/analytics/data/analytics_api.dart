import 'package:dio/dio.dart';

import '../../../core/errors/app_failure.dart';
import '../domain/analytics_report.dart';

class AnalyticsApi {
  AnalyticsApi(this._dio);

  final Dio _dio;

  Map<String, dynamic> _unwrap(Map<String, dynamic> body) =>
      body['data'] is Map<String, dynamic> ? body['data'] as Map<String, dynamic> : body;

  /// Both calls in parallel — they hit different collections and neither
  /// depends on the other, so serialising them only makes the screen slower.
  Future<AnalyticsReport> report() async {
    try {
      final responses = await Future.wait([
        _dio.get<Map<String, dynamic>>('/api/analytics/sales'),
        _dio.get<Map<String, dynamic>>('/api/analytics/leads/conversion'),
      ]);
      return AnalyticsReport(
        sales: SalesReport.fromJson(_unwrap(responses[0].data!)),
        leads: LeadsReport.fromJson(_unwrap(responses[1].data!)),
      );
    } on DioException catch (e) {
      throw AppFailure.fromDioException(e);
    }
  }
}
