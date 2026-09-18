import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../config/env.dart';
import '../network/providers.dart';
import 'socket_service.dart';

final socketServiceProvider = Provider<SocketService>((ref) {
  final service = SocketService(ref.watch(apiClientProvider), Env.apiBaseUrl);
  ref.onDispose(service.disconnect);
  return service;
});
