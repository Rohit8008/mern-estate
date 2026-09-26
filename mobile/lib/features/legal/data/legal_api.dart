import 'package:dio/dio.dart';

import '../../../core/errors/app_failure.dart';

/// Where the signed-in user stands against the current Terms/Privacy version.
class LegalAcceptanceStatus {
  const LegalAcceptanceStatus({required this.version, required this.required, this.acceptedVersion});

  /// The version in force — what a POST must send back.
  final String version;
  final String? acceptedVersion;

  /// True when [acceptedVersion] is missing or older than [version].
  final bool required;

  factory LegalAcceptanceStatus.fromJson(Map<String, dynamic> json) => LegalAcceptanceStatus(
        version: (json['version'] ?? '').toString(),
        acceptedVersion: json['acceptedVersion']?.toString(),
        required: json['required'] == true,
      );
}

/// The version sent was superseded between the GET and the POST — the user
/// must see (and tick) the new one, not have the old tick carried over.
class LegalVersionChanged implements Exception {
  const LegalVersionChanged(this.version);
  final String? version;
}

/// /api/user/legal-acceptance — cookie-authenticated like everything else;
/// the POST gets its X-CSRF-Token from ApiClient's CSRF interceptor.
class LegalApi {
  LegalApi(this._dio);

  final Dio _dio;

  static const _path = '/api/user/legal-acceptance';

  Future<LegalAcceptanceStatus> status() async {
    try {
      final res = await _dio.get<Map<String, dynamic>>(_path);
      return LegalAcceptanceStatus.fromJson(res.data ?? const {});
    } on DioException catch (e) {
      throw AppFailure.fromDioException(e);
    }
  }

  /// Throws [LegalVersionChanged] on 409 LEGAL_VERSION_CHANGED, AppFailure otherwise.
  Future<void> accept(String version) async {
    try {
      await _dio.post<Map<String, dynamic>>(_path, data: {'version': version});
    } on DioException catch (e) {
      final data = e.response?.data;
      if (e.response?.statusCode == 409 && data is Map && data['code'] == 'LEGAL_VERSION_CHANGED') {
        throw LegalVersionChanged(data['version']?.toString());
      }
      throw AppFailure.fromDioException(e);
    }
  }
}
