import 'package:dio/dio.dart';

import '../../../core/errors/app_failure.dart';
import '../domain/listing.dart';
import '../domain/listing_filters.dart';

class ListingPage {
  const ListingPage({required this.listings, required this.hasMore});
  final List<Listing> listings;
  final bool hasMore;
}

class PropertiesApi {
  PropertiesApi(this._dio);

  final Dio _dio;

  /// Employees only see listings assigned to them (/my-assigned); admins see
  /// everything (/get) — same split as PropertiesBoard.jsx.
  Future<ListingPage> list({
    required bool isEmployee,
    required ListingFilters filters,
    required int startIndex,
    int limit = 20,
  }) async {
    try {
      final path = isEmployee ? '/api/listing/my-assigned' : '/api/listing/get';
      final res = await _dio.get<Map<String, dynamic>>(path, queryParameters: {
        ...filters.toQueryParams(),
        'startIndex': startIndex.toString(),
        'limit': limit.toString(),
        'populate': 'agent,owners',
      });
      final data = res.data?['data'] as Map<String, dynamic>? ?? const {};
      final rawListings = data['listings'] as List? ?? const [];
      final pagination = data['pagination'] as Map<String, dynamic>? ?? const {};
      return ListingPage(
        listings: rawListings.map((e) => Listing.fromJson(e as Map<String, dynamic>)).toList(),
        hasMore: pagination['hasMore'] as bool? ?? false,
      );
    } on DioException catch (e) {
      throw AppFailure.fromDioException(e);
    }
  }

  Future<Listing> getById(String id) async {
    try {
      final res = await _dio.get<Map<String, dynamic>>('/api/listing/get/$id');
      return Listing.fromJson(res.data!);
    } on DioException catch (e) {
      throw AppFailure.fromDioException(e);
    }
  }

  Future<void> delete(String id) async {
    try {
      await _dio.delete<void>('/api/listing/delete/$id');
    } on DioException catch (e) {
      throw AppFailure.fromDioException(e);
    }
  }
}
