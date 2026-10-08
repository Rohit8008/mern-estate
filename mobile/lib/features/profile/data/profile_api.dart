import 'dart:typed_data';

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

  /// Uploads one image through the backend (same path the listing photos use)
  /// and returns the stored URL to save as the avatar. The backend answers with
  /// a relative `/uploads/...` path; the schema accepts relative avatar URLs.
  Future<String> uploadAvatar(String filename, Uint8List bytes) async {
    try {
      final form = FormData();
      form.files.add(MapEntry('image', MultipartFile.fromBytes(bytes, filename: filename)));
      final res = await _dio.post<Map<String, dynamic>>('/api/upload/single', data: form);
      final url = res.data?['url'] as String?;
      if (url == null || url.isEmpty) {
        throw const AppFailure(message: "That image couldn't be uploaded.", type: AppFailureType.unknown);
      }
      return url;
    } on DioException catch (e) {
      throw AppFailure.fromDioException(e);
    }
  }

  /// Changes the signed-in user's password. Mirrors the web flow; the backend
  /// enforces the current password and an 8-character minimum.
  Future<void> changePassword({required String currentPassword, required String newPassword}) async {
    try {
      await _dio.post<Map<String, dynamic>>(
        '/api/user/password/change',
        data: {'currentPassword': currentPassword, 'newPassword': newPassword},
      );
    } on DioException catch (e) {
      throw AppFailure.fromDioException(e);
    }
  }
}
