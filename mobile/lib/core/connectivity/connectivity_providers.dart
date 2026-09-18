import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

final _connectivityStreamProvider = StreamProvider<List<ConnectivityResult>>((ref) {
  return Connectivity().onConnectivityChanged;
});

/// True until proven otherwise — assume online while the first reading is
/// still in flight rather than flashing an offline banner on cold start.
final isOnlineProvider = Provider<bool>((ref) {
  final results = ref.watch(_connectivityStreamProvider).valueOrNull;
  if (results == null) return true;
  return results.any((r) => r != ConnectivityResult.none);
});
