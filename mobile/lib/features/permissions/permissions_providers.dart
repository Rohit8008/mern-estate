import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/network/providers.dart';
import '../auth/auth_providers.dart';
import 'data/permissions_api.dart';

final permissionsApiProvider = Provider<PermissionsApi>((ref) => PermissionsApi(ref.watch(apiClientProvider).dio));

/// Recomputes whenever auth state changes — admins short-circuit to "all"
/// (no fetch, matching PermissionsContext.jsx), non-employees get no CRM
/// permissions, employees fetch their assigned permission map.
final permissionsProvider = FutureProvider<Map<String, dynamic>>((ref) async {
  final user = ref.watch(authControllerProvider).user;
  if (user == null) return const {};
  if (user.isAdmin) return const {'_all': true};
  if (!user.isEmployee) return const {};

  try {
    return await ref.watch(permissionsApiProvider).myPermissions();
  } catch (_) {
    return const {};
  }
});

/// `ref.watch(canProvider('viewClients'))` — pass null when a screen has no
/// specific permission requirement (e.g. Tasks/Calendar in the web sidebar).
final canProvider = Provider.family<bool, String?>((ref, permission) {
  final user = ref.watch(authControllerProvider).user;
  if (user == null) return false;

  final perms = ref.watch(permissionsProvider).valueOrNull ?? const {};
  if (user.isAdmin || perms['_all'] == true) return true;
  if (permission == null) return true;
  return perms[permission] == true;
});
