import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../network/providers.dart';
import 'push_service.dart';

/// Whether Firebase started. Overridden in main(): false on devices or
/// platforms without it, in which case every push call below is skipped.
final pushAvailableProvider = Provider<bool>((ref) => false);

final pushServiceProvider = Provider<PushService>((ref) => PushService(ref.watch(apiClientProvider).dio));
