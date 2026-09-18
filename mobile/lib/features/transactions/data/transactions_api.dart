import 'package:dio/dio.dart';

import '../../../core/errors/app_failure.dart';
import '../domain/transaction.dart';

class TransactionsApi {
  TransactionsApi(this._dio);

  final Dio _dio;

  Future<List<CrmTransaction>> list({String? q, String? status}) async {
    try {
      final res = await _dio.get<Map<String, dynamic>>('/api/transactions', queryParameters: {
        if (q != null && q.isNotEmpty) 'q': q,
        if (status != null) 'status': status,
        'limit': '100',
      });
      final raw = res.data?['data'] as List? ?? const [];
      return raw.map((e) => CrmTransaction.fromJson(e as Map<String, dynamic>)).toList();
    } on DioException catch (e) {
      throw AppFailure.fromDioException(e);
    }
  }

  Future<TransactionStats> stats() async {
    try {
      final res = await _dio.get<Map<String, dynamic>>('/api/transactions/stats');
      return TransactionStats.fromJson(res.data?['data'] as Map<String, dynamic>? ?? const {});
    } on DioException catch (e) {
      throw AppFailure.fromDioException(e);
    }
  }

  Future<void> create(Map<String, dynamic> payload) async {
    try {
      await _dio.post<void>('/api/transactions', data: payload);
    } on DioException catch (e) {
      throw AppFailure.fromDioException(e);
    }
  }

  Future<void> update(String id, Map<String, dynamic> payload) async {
    try {
      await _dio.patch<void>('/api/transactions/$id', data: payload);
    } on DioException catch (e) {
      throw AppFailure.fromDioException(e);
    }
  }

  Future<void> delete(String id) async {
    try {
      await _dio.delete<void>('/api/transactions/$id');
    } on DioException catch (e) {
      throw AppFailure.fromDioException(e);
    }
  }
}
