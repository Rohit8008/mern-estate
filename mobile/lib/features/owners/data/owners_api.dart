import 'package:dio/dio.dart';

import '../../../core/errors/app_failure.dart';
import '../domain/owner.dart';

/// Responses here are bare arrays/objects (no {success,data} envelope) —
/// owner.controller.js just does res.json(owner)/res.json(owners).
class OwnersApi {
  OwnersApi(this._dio);

  final Dio _dio;

  Future<List<PropertyOwner>> list({String? q}) async {
    try {
      final res = await _dio.get<List<dynamic>>('/api/owner/list', queryParameters: {if (q != null && q.isNotEmpty) 'q': q});
      return (res.data ?? const []).map((e) => PropertyOwner.fromJson(e as Map<String, dynamic>)).toList();
    } on DioException catch (e) {
      throw AppFailure.fromDioException(e);
    }
  }

  Future<PropertyOwner> create(Map<String, dynamic> payload) async {
    try {
      final res = await _dio.post<Map<String, dynamic>>('/api/owner', data: payload);
      return PropertyOwner.fromJson(res.data!);
    } on DioException catch (e) {
      throw AppFailure.fromDioException(e);
    }
  }

  Future<PropertyOwner> update(String id, Map<String, dynamic> payload) async {
    try {
      final res = await _dio.post<Map<String, dynamic>>('/api/owner/$id', data: payload);
      return PropertyOwner.fromJson(res.data!);
    } on DioException catch (e) {
      throw AppFailure.fromDioException(e);
    }
  }

  Future<void> delete(String id) async {
    try {
      await _dio.delete<void>('/api/owner/$id');
    } on DioException catch (e) {
      throw AppFailure.fromDioException(e);
    }
  }
}
