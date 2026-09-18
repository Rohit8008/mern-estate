import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../features/auth/auth_providers.dart';

/// Bridges Riverpod's authControllerProvider to GoRouter's
/// refreshListenable so a sign-in/sign-out/bootstrap-result re-runs the
/// router's redirect logic without any screen calling context.go() itself.
class GoRouterRefreshNotifier extends ChangeNotifier {
  GoRouterRefreshNotifier(Ref ref) {
    ref.listen(authControllerProvider, (_, __) => notifyListeners());
  }
}
