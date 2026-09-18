import 'package:dio/dio.dart';

import '../../../core/errors/app_failure.dart';
import '../domain/lead.dart';

class LeadsApi {
  LeadsApi(this._dio);

  final Dio _dio;

  Future<List<Lead>> list({String? q, String? status, String? contactType}) async {
    try {
      final res = await _dio.get<Map<String, dynamic>>('/api/clients', queryParameters: {
        if (q != null && q.isNotEmpty) 'q': q,
        if (status != null && status.isNotEmpty) 'status': status,
        if (contactType != null && contactType.isNotEmpty) 'contactType': contactType,
        'limit': '200',
      });
      final body = res.data!;
      final raw = body['data'] is List ? body['data'] as List : const [];
      return raw.map((e) => Lead.fromJson(e as Map<String, dynamic>)).toList();
    } on DioException catch (e) {
      throw AppFailure.fromDioException(e);
    }
  }

  Future<Lead> getById(String id) async {
    try {
      final res = await _dio.get<Map<String, dynamic>>('/api/clients/$id');
      final body = res.data!;
      final json = body['data'] is Map<String, dynamic> ? body['data'] as Map<String, dynamic> : body;
      return Lead.fromJson(json);
    } on DioException catch (e) {
      throw AppFailure.fromDioException(e);
    }
  }

  Future<Lead> create(Map<String, dynamic> payload) async {
    try {
      final res = await _dio.post<Map<String, dynamic>>('/api/clients', data: payload);
      final body = res.data!;
      final json = body['data'] is Map<String, dynamic> ? body['data'] as Map<String, dynamic> : body;
      return Lead.fromJson(json);
    } on DioException catch (e) {
      throw AppFailure.fromDioException(e);
    }
  }

  Future<Lead> update(String id, Map<String, dynamic> payload) async {
    try {
      final res = await _dio.patch<Map<String, dynamic>>('/api/clients/$id', data: payload);
      final body = res.data!;
      final json = body['data'] is Map<String, dynamic> ? body['data'] as Map<String, dynamic> : body;
      return Lead.fromJson(json);
    } on DioException catch (e) {
      throw AppFailure.fromDioException(e);
    }
  }

  Future<void> delete(String id) async {
    try {
      await _dio.delete<void>('/api/clients/$id');
    } on DioException catch (e) {
      throw AppFailure.fromDioException(e);
    }
  }
}
