import 'package:dio/dio.dart';

import '../../../core/errors/app_failure.dart';
import '../domain/search_result.dart';

/// Cross-entity global search — the same /api/search the web ⌘K palette uses.
class SearchApi {
  SearchApi(this._dio);

  final Dio _dio;

  Future<List<SearchGroup>> search(String query, {int limit = 8}) async {
    try {
      final res = await _dio.get<Map<String, dynamic>>(
        '/api/search',
        queryParameters: {'q': query, 'limit': limit},
      );
      final groups = (res.data?['groups'] as List?) ?? const [];
      return groups.map((e) => SearchGroup.fromJson(e as Map<String, dynamic>)).toList();
    } on DioException catch (e) {
      throw AppFailure.fromDioException(e);
    }
  }
}
