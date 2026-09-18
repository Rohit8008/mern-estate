import 'package:dio/dio.dart';

import '../../../core/errors/app_failure.dart';
import '../domain/app_user.dart';

/// Thin wrapper over /api/auth and the auth-adjacent /api/user endpoints.
/// Every call converts a DioException into an AppFailure so nothing above
/// this layer ever has to inspect a status code.
class AuthApi {
  AuthApi(this._dio);

  final Dio _dio;

  Future<AppUser> signIn({required String email, required String password}) async {
    try {
      final res = await _dio.post<Map<String, dynamic>>(
        '/api/auth/signin',
        data: {'email': email, 'password': password},
      );
      return AppUser.fromJson(res.data!);
    } on DioException catch (e) {
      throw AppFailure.fromDioException(e);
    }
  }

  Future<AppUser> me() async {
    try {
      final res = await _dio.get<Map<String, dynamic>>('/api/user/me');
      final body = res.data!;
      // The backend's success envelope isn't consistent across endpoints —
      // unwrap {data:{...}} if present, otherwise treat the body itself as the user.
      final userJson = body['data'] is Map<String, dynamic> ? body['data'] as Map<String, dynamic> : body;
      return AppUser.fromJson(userJson);
    } on DioException catch (e) {
      throw AppFailure.fromDioException(e);
    }
  }

  Future<void> signOut() async {
    try {
      await _dio.post<void>('/api/auth/signout');
    } on DioException catch (e) {
      throw AppFailure.fromDioException(e);
    }
  }

  Future<void> signOutAllDevices() async {
    try {
      await _dio.post<void>('/api/auth/signout-all');
    } on DioException catch (e) {
      throw AppFailure.fromDioException(e);
    }
  }

  Future<void> requestPasswordResetOtp(String email) async {
    try {
      await _dio.post<void>('/api/user/password/request-otp', data: {'email': email});
    } on DioException catch (e) {
      throw AppFailure.fromDioException(e);
    }
  }

  Future<void> resetPassword({required String email, required String otp, required String newPassword}) async {
    try {
      await _dio.post<void>(
        '/api/user/password/reset',
        data: {'email': email, 'otp': otp, 'newPassword': newPassword},
      );
    } on DioException catch (e) {
      throw AppFailure.fromDioException(e);
    }
  }
}
