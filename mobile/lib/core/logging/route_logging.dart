import 'package:go_router/go_router.dart';

import 'app_logger.dart';

/// Logs a `screen_view` whenever the router lands somewhere new, and keeps
/// [AppLogger.route] current so every later line carries its screen.
///
/// Listens to the router delegate rather than a NavigatorObserver: the
/// bottom-nav branches each have their own Navigator, which a root observer
/// never sees. Logged: the route pattern (`/leads/:id`) and the path (whose
/// only parameters are Mongo ids) — never the query string.
///
/// Returns a function that detaches the listener.
void Function() attachRouteLogging(GoRouter router, {AppLogger? logger}) {
  final log = logger ?? AppLogger.instance;
  String? last;

  void listener() {
    try {
      if (router.routerDelegate.currentConfiguration.isEmpty) return;
      final state = router.state;
      final path = state.uri.path;
      if (path == last) return;
      last = path;
      final pattern = state.fullPath;
      final route = (pattern == null || pattern.isEmpty) ? path : pattern;
      log.route = route;
      log.info('screen_view', fields: {'screen': state.name ?? route, 'path': path});
    } catch (_) {}
  }

  router.routerDelegate.addListener(listener);
  return () => router.routerDelegate.removeListener(listener);
}
