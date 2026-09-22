import 'package:dio/dio.dart';

import '../../../core/errors/app_failure.dart';
import '../domain/team_member.dart';

class AdminApi {
  AdminApi(this._dio);

  final Dio _dio;

  /// /api/user/list answers with a bare array; /api/roles wraps in
  /// {data:{roles:[...]}}. Two shapes, one screen — normalised here so the UI
  /// never sees the difference.
  Future<AdminOverview> overview() async {
    try {
      final users = await _dio.get<List<dynamic>>('/api/user/list');
      final roles = await _dio.get<Map<String, dynamic>>('/api/roles');

      final roleList = ((roles.data?['data'] as Map<String, dynamic>?)?['roles'] as List<dynamic>?) ?? const [];

      return AdminOverview(
        members: (users.data ?? const [])
            .map((e) => TeamMember.fromJson(e as Map<String, dynamic>))
            .toList(),
        roles: roleList.map((e) => WorkspaceRole.fromJson(e as Map<String, dynamic>)).toList(),
      );
    } on DioException catch (e) {
      throw AppFailure.fromDioException(e);
    }
  }

  Future<void> setStatus(String userId, String status) async {
    try {
      await _dio.post<Map<String, dynamic>>(
        '/api/user/admin/toggle-status/$userId',
        data: {'status': status},
      );
    } on DioException catch (e) {
      throw AppFailure.fromDioException(e);
    }
  }
}
