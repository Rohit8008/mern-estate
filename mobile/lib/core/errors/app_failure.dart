import 'package:dio/dio.dart';

/// Discriminant mirroring the backend's error envelope
/// ({success:false, statusCode, message, type}) — see backend/utils/error.js.
enum AppFailureType { network, validation, authentication, authorization, notFound, conflict, rateLimit, server, unknown }

/// A user-presentable failure. Every repository/API call throws this instead
/// of a raw DioException so screens never have to sniff status codes.
class AppFailure implements Exception {
  const AppFailure({required this.message, required this.type, this.field, this.statusCode});

  final String message;
  final AppFailureType type;
  final String? field;
  final int? statusCode;

  factory AppFailure.fromDioException(DioException e) {
    switch (e.type) {
      case DioExceptionType.connectionError:
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.receiveTimeout:
      case DioExceptionType.sendTimeout:
        return const AppFailure(
          message: 'Check your internet connection and try again.',
          type: AppFailureType.network,
        );
      default:
        break;
    }

    final statusCode = e.response?.statusCode;
    final data = e.response?.data;
    if (data is Map && data['message'] is String) {
      return AppFailure(
        message: data['message'] as String,
        type: _mapType(data['type'] as String?, statusCode),
        field: data['field'] as String?,
        statusCode: statusCode,
      );
    }

    if (statusCode != null && statusCode >= 500) {
      return AppFailure(
        message: 'Something went wrong on our end. Please try again shortly.',
        type: AppFailureType.server,
        statusCode: statusCode,
      );
    }

    return AppFailure(message: 'Something went wrong. Please try again.', type: AppFailureType.unknown, statusCode: statusCode);
  }

  static AppFailureType _mapType(String? type, int? statusCode) {
    switch (type) {
      case 'validation':
        return AppFailureType.validation;
      case 'authentication':
        return AppFailureType.authentication;
      case 'authorization':
        return AppFailureType.authorization;
      case 'not_found':
        return AppFailureType.notFound;
      case 'conflict':
        return AppFailureType.conflict;
      case 'rate_limit':
        return AppFailureType.rateLimit;
    }
    if (statusCode == 401) return AppFailureType.authentication;
    if (statusCode == 403) return AppFailureType.authorization;
    if (statusCode == 404) return AppFailureType.notFound;
    if (statusCode != null && statusCode >= 500) return AppFailureType.server;
    return AppFailureType.unknown;
  }
}
