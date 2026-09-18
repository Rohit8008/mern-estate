import 'package:dio/dio.dart';

import '../../../core/errors/app_failure.dart';

/// Wraps /api/crm/* — deal/follow-up/communication mutations on a Client.
/// Every mutation here returns the full updated client document from the
/// backend, but callers simply invalidate leadDetailProvider afterwards
/// (a fresh GET) rather than parsing the mutation response directly, to
/// keep a single source of truth for "what the lead looks like now".
class CrmApi {
  CrmApi(this._dio);

  final Dio _dio;

  Future<void> addDeal(String clientId, Map<String, dynamic> payload) => _post('/api/crm/$clientId/deals', payload);

  Future<void> updateDealStage(String clientId, String dealId, {required String stage, String? notes}) =>
      _patch('/api/crm/$clientId/deals/$dealId/stage', {'stage': stage, if (notes != null) 'notes': notes});

  Future<void> addFollowUp(String clientId, Map<String, dynamic> payload) =>
      _post('/api/crm/$clientId/follow-ups', payload);

  Future<void> completeFollowUp(String clientId, String followUpId, {String? notes, String? outcome}) => _patch(
        '/api/crm/$clientId/follow-ups/$followUpId/complete',
        {if (notes != null) 'notes': notes, if (outcome != null) 'outcome': outcome},
      );

  Future<void> addCommunication(String clientId, Map<String, dynamic> payload) =>
      _post('/api/crm/$clientId/communications', payload);

  Future<void> _post(String path, Map<String, dynamic> payload) async {
    try {
      await _dio.post<void>(path, data: payload);
    } on DioException catch (e) {
      throw AppFailure.fromDioException(e);
    }
  }

  Future<void> _patch(String path, Map<String, dynamic> payload) async {
    try {
      await _dio.patch<void>(path, data: payload);
    } on DioException catch (e) {
      throw AppFailure.fromDioException(e);
    }
  }
}
