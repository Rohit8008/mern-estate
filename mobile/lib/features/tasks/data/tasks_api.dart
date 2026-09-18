import 'package:dio/dio.dart';

import '../../../core/errors/app_failure.dart';
import '../domain/crm_task.dart';

class TasksApi {
  TasksApi(this._dio);

  final Dio _dio;

  Future<List<CrmTask>> listForClient(String clientId) => _list({'clientId': clientId});

  /// Unscoped — every task assigned to the current user (or, for admins,
  /// everyone's if `assignedTo` is passed), for the standalone Tasks screen.
  Future<List<CrmTask>> list({String? status, String? assignedTo}) => _list({
        if (status != null) 'status': status,
        if (assignedTo != null) 'assignedTo': assignedTo,
      });

  Future<List<CrmTask>> _list(Map<String, String> filters) async {
    try {
      final res = await _dio.get<Map<String, dynamic>>('/api/tasks', queryParameters: {...filters, 'limit': '100'});
      final body = res.data!;
      final raw = body['data'] is List ? body['data'] as List : const [];
      return raw.map((e) => CrmTask.fromJson(e as Map<String, dynamic>)).toList();
    } on DioException catch (e) {
      throw AppFailure.fromDioException(e);
    }
  }

  Future<void> createForClient(String clientId, Map<String, dynamic> payload) => create({
        ...payload,
        'related': {'kind': 'client', 'clientId': clientId},
      });

  Future<void> create(Map<String, dynamic> payload) async {
    try {
      await _dio.post<void>('/api/tasks', data: payload);
    } on DioException catch (e) {
      throw AppFailure.fromDioException(e);
    }
  }

  Future<void> update(String id, Map<String, dynamic> payload) async {
    try {
      await _dio.patch<void>('/api/tasks/$id', data: payload);
    } on DioException catch (e) {
      throw AppFailure.fromDioException(e);
    }
  }

  Future<void> delete(String id) async {
    try {
      await _dio.delete<void>('/api/tasks/$id');
    } on DioException catch (e) {
      throw AppFailure.fromDioException(e);
    }
  }
}
