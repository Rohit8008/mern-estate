import 'package:dio/dio.dart';

import '../../../core/errors/app_failure.dart';
import '../domain/upcoming_follow_up.dart';

class ActivitiesApi {
  ActivitiesApi(this._dio);

  final Dio _dio;

  Future<List<UpcomingFollowUp>> upcomingFollowUps({int days = 30}) async {
    try {
      final res = await _dio.get<Map<String, dynamic>>('/api/crm/follow-ups/upcoming', queryParameters: {'days': days.toString()});
      final raw = res.data?['data']?['followUps'] as List? ?? const [];
      return raw.map((e) => UpcomingFollowUp.fromJson(e as Map<String, dynamic>)).toList();
    } on DioException catch (e) {
      throw AppFailure.fromDioException(e);
    }
  }
}
