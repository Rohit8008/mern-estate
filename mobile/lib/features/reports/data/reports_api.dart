import 'package:dio/dio.dart';

import '../../../core/errors/app_failure.dart';
import '../domain/report.dart';

class ReportsApi {
  ReportsApi(this._dio);

  final Dio _dio;

  List<dynamic> _list(Map<String, dynamic> body) {
    final data = body['data'];
    if (data is List) return data;
    if (data is Map<String, dynamic> && data['items'] is List) return data['items'] as List<dynamic>;
    return const [];
  }

  Future<ReportsOverview> overview() async {
    try {
      final responses = await Future.wait([
        _dio.get<Map<String, dynamic>>('/api/report-templates'),
        _dio.get<Map<String, dynamic>>('/api/generated-reports'),
      ]);
      return ReportsOverview(
        templates: _list(responses[0].data!)
            .map((e) => ReportTemplate.fromJson(e as Map<String, dynamic>))
            .toList(),
        generated: _list(responses[1].data!)
            .map((e) => GeneratedReport.fromJson(e as Map<String, dynamic>))
            .toList(),
      );
    } on DioException catch (e) {
      throw AppFailure.fromDioException(e);
    }
  }
}
