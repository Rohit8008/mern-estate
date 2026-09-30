import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../errors/app_failure.dart';
import 'app_logger.dart';

/// Reports providers that fail. Only the failure — never provider values,
/// which carry customer data.
class ProviderLoggingObserver extends ProviderObserver {
  ProviderLoggingObserver({AppLogger? logger}) : _logger = logger ?? AppLogger.instance;

  final AppLogger _logger;

  @override
  void providerDidFail(
    ProviderBase<Object?> provider,
    Object error,
    StackTrace stackTrace,
    ProviderContainer container,
  ) {
    try {
      final fields = <String, Object?>{'provider': provider.name ?? provider.runtimeType.toString()};
      if (error is AppFailure) {
        // Already turned into a user-facing message; the transport-level
        // cause (if any) was logged by LoggingInterceptor. Keep the type and
        // status, not the message.
        fields['failure_type'] = error.type.name;
        fields['status'] = error.statusCode;
        _logger.error('provider failed', fields: fields);
      } else {
        _logger.error('provider failed', error: error, stack: stackTrace, fields: fields);
      }
    } catch (_) {}
  }
}
