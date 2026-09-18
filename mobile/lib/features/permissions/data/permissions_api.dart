import 'package:dio/dio.dart';

import '../../../core/errors/app_failure.dart';

/// Mirrors frontend/src/contexts/PermissionsContext.jsx's fetch of
/// GET /api/user/my-permissions -> { permissions: { key: bool, ... } }.
class PermissionsApi {
  PermissionsApi(this._dio);

  final Dio _dio;

  Future<Map<String, dynamic>> myPermissions() async {
    try {
      final res = await _dio.get<Map<String, dynamic>>('/api/user/my-permissions');
      final body = res.data!;
      return (body['permissions'] as Map<String, dynamic>?) ?? {};
    } on DioException catch (e) {
      throw AppFailure.fromDioException(e);
    }
  }
}
