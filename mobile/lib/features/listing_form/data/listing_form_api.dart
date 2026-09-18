import 'dart:typed_data';

import 'package:dio/dio.dart';

import '../../../core/errors/app_failure.dart';
import '../../properties/domain/listing.dart';
import '../domain/geocode_result.dart';

class ListingFormApi {
  ListingFormApi(this._dio);

  final Dio _dio;

  /// Create is enveloped ({success,data}); update returns the raw lean
  /// object with no wrapper at all — confirmed by reading both controller
  /// handlers directly, not assumed.
  Future<Listing> create(Map<String, dynamic> payload) async {
    try {
      final res = await _dio.post<Map<String, dynamic>>('/api/listing/create', data: payload);
      return Listing.fromJson(res.data!['data'] as Map<String, dynamic>);
    } on DioException catch (e) {
      throw AppFailure.fromDioException(e);
    }
  }

  Future<Listing> update(String id, Map<String, dynamic> payload) async {
    try {
      final res = await _dio.post<Map<String, dynamic>>('/api/listing/update/$id', data: payload);
      return Listing.fromJson(res.data!);
    } on DioException catch (e) {
      throw AppFailure.fromDioException(e);
    }
  }

  /// Field name must be exactly 'images' (multer.array('images', 6) on the
  /// backend) — max 6 files, 10MB each, magic-byte validated server-side.
  /// Returns full absolute URLs, ready to drop straight into imageUrls.
  Future<List<String>> uploadImages(List<(String filename, Uint8List bytes)> images) async {
    try {
      final formData = FormData();
      for (final (filename, bytes) in images) {
        formData.files.add(MapEntry('images', MultipartFile.fromBytes(bytes, filename: filename)));
      }
      final res = await _dio.post<Map<String, dynamic>>('/api/upload/multiple', data: formData);
      return ((res.data?['urls'] as List?) ?? const []).cast<String>();
    } on DioException catch (e) {
      throw AppFailure.fromDioException(e);
    }
  }

  Future<List<GeocodeResult>> geocodeSearch(String query) async {
    try {
      final res = await _dio.get<Map<String, dynamic>>('/api/geocode/search', queryParameters: {'q': query, 'limit': '8'});
      final raw = res.data?['data'] as List? ?? const [];
      return raw.map((e) => GeocodeResult.fromJson(e as Map<String, dynamic>)).toList();
    } on DioException catch (e) {
      throw AppFailure.fromDioException(e);
    }
  }

  Future<GeocodeResult?> geocodeReverse(double lat, double lng) async {
    try {
      final res = await _dio.get<Map<String, dynamic>>('/api/geocode/reverse', queryParameters: {'lat': lat, 'lng': lng});
      final data = res.data?['data'];
      return data is Map<String, dynamic> ? GeocodeResult.fromJson(data) : null;
    } on DioException catch (e) {
      throw AppFailure.fromDioException(e);
    }
  }
}
