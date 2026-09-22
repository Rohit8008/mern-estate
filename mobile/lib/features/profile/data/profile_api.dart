import 'package:dio/dio.dart';

import '../../../core/errors/app_failure.dart';
import '../../auth/domain/app_user.dart';

/// Editing your own account.
///
/// The backend's `updateProfile` schema (middleware/validation.js) accepts
/// name, phone, address and bio only — deliberately not email, role or
/// password. Sending any of those is a 400, so the form does not offer them:
/// a field that always fails is worse than a field that is not there.
class ProfileApi {
  ProfileApi(this._dio);

  final Dio _dio;

  Future<AppUser> update(String id, Map<String, dynamic> payload) async {
    try {
      final res = await _dio.post<Map<String, dynamic>>('/api/user/update/$id', data: payload);
      final body = res.data!;
      // Same inconsistent envelope as /api/user/me — unwrap {data:{...}} if present.
      final json = body['data'] is Map<String, dynamic> ? body['data'] as Map<String, dynamic> : body;
      return AppUser.fromJson(json);
    } on DioException catch (e) {
      throw AppFailure.fromDioException(e);
    }
  }
}
