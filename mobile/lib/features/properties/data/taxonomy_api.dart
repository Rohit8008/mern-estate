import 'package:dio/dio.dart';

import '../../../core/errors/app_failure.dart';
import '../domain/field_definition.dart';

/// Categories and PropertyTypes drive Listing's two parallel dynamic-field
/// systems — fetched once and cached for the session (see
/// properties_providers.dart), not per-listing.
class TaxonomyApi {
  TaxonomyApi(this._dio);

  final Dio _dio;

  Future<List<PropertyCategory>> listCategories() async {
    try {
      final res = await _dio.get<List<dynamic>>('/api/category/list');
      return (res.data ?? const []).map((e) => PropertyCategory.fromJson(e as Map<String, dynamic>)).toList();
    } on DioException catch (e) {
      throw AppFailure.fromDioException(e);
    }
  }

  Future<List<PropertyTypeDef>> listPropertyTypes() async {
    try {
      final res = await _dio.get<Map<String, dynamic>>('/api/property-types/list');
      final raw = res.data?['data'] as List? ?? const [];
      return raw.map((e) => PropertyTypeDef.fromJson(e as Map<String, dynamic>)).toList();
    } on DioException catch (e) {
      throw AppFailure.fromDioException(e);
    }
  }
}
