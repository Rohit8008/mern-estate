import 'dart:typed_data';

import 'package:dio/dio.dart';

import '../../../core/errors/app_failure.dart';
import '../domain/crm_document.dart';

/// `kind` is 'client' or 'listing' — exactly one of Document.related.clientId
/// /listingId. Upload is multipart with a 10MB server-side cap and a fixed
/// allowlist (PDF/docx/xlsx/pptx/zip/jpg/png/legacy doc-xls-ppt), enforced
/// by magic-byte sniffing server-side regardless of what we send here.
class DocumentsApi {
  DocumentsApi(this._dio);

  final Dio _dio;

  Future<List<CrmDocument>> list({required String kind, required String refId}) async {
    try {
      final res = await _dio.get<Map<String, dynamic>>('/api/documents', queryParameters: {
        'kind': kind,
        if (kind == 'client') 'clientId': refId else 'listingId': refId,
        'limit': '100',
      });
      final raw = res.data?['data'] as List? ?? const [];
      return raw.map((e) => CrmDocument.fromJson(e as Map<String, dynamic>)).toList();
    } on DioException catch (e) {
      throw AppFailure.fromDioException(e);
    }
  }

  Future<void> upload({
    required String kind,
    required String refId,
    required Uint8List bytes,
    required String filename,
    String? title,
  }) async {
    try {
      final formData = FormData.fromMap({
        'kind': kind,
        if (kind == 'client') 'clientId': refId else 'listingId': refId,
        if (title != null && title.isNotEmpty) 'title': title,
        'file': MultipartFile.fromBytes(bytes, filename: filename),
      });
      await _dio.post<void>('/api/documents/upload', data: formData);
    } on DioException catch (e) {
      throw AppFailure.fromDioException(e);
    }
  }

  Future<void> delete(String id) async {
    try {
      await _dio.delete<void>('/api/documents/$id');
    } on DioException catch (e) {
      throw AppFailure.fromDioException(e);
    }
  }
}
