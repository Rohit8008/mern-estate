import 'package:dio/dio.dart';

import '../../../core/errors/app_failure.dart';
import '../domain/buyer_requirement.dart';

/// Bare array/object responses — buyerRequirement.controller.js has no
/// {success,data} envelope.
class BuyersApi {
  BuyersApi(this._dio);

  final Dio _dio;

  Future<List<BuyerRequirement>> list({String? search, String? status}) async {
    try {
      final res = await _dio.get<List<dynamic>>('/api/buyer-requirements', queryParameters: {
        if (search != null && search.isNotEmpty) 'search': search,
        if (status != null) 'status': status,
      });
      return (res.data ?? const []).map((e) => BuyerRequirement.fromJson(e as Map<String, dynamic>)).toList();
    } on DioException catch (e) {
      throw AppFailure.fromDioException(e);
    }
  }

  Future<BuyerRequirement> create(Map<String, dynamic> payload) async {
    try {
      final res = await _dio.post<Map<String, dynamic>>('/api/buyer-requirements', data: payload);
      return BuyerRequirement.fromJson(res.data!);
    } on DioException catch (e) {
      throw AppFailure.fromDioException(e);
    }
  }

  Future<BuyerRequirement> update(String id, Map<String, dynamic> payload) async {
    try {
      final res = await _dio.put<Map<String, dynamic>>('/api/buyer-requirements/$id', data: payload);
      return BuyerRequirement.fromJson(res.data!);
    } on DioException catch (e) {
      throw AppFailure.fromDioException(e);
    }
  }

  Future<void> delete(String id) async {
    try {
      await _dio.delete<void>('/api/buyer-requirements/$id');
    } on DioException catch (e) {
      throw AppFailure.fromDioException(e);
    }
  }
}
