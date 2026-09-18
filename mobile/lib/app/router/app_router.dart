import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../features/activities/presentation/activities_tab.dart';
import '../../features/auth/application/auth_state.dart';
import '../../features/auth/auth_providers.dart';
import '../../features/auth/presentation/forgot_password_screen.dart';
import '../../features/auth/presentation/login_screen.dart';
import '../../features/dashboard/presentation/dashboard_screen.dart';
import '../../features/leads/presentation/leads_list_screen.dart';
import '../../features/properties/presentation/properties_list_screen.dart';
import '../../shared/widgets/app_states.dart';
import 'crm_bottom_nav_shell.dart';
import 'go_router_refresh_notifier.dart';
import 'more_screen.dart';

const _publicPaths = ['/login', '/forgot-password'];

final goRouterProvider = Provider<GoRouter>((ref) {
  return GoRouter(
    initialLocation: '/splash',
    refreshListenable: GoRouterRefreshNotifier(ref),
    redirect: (context, state) {
      final authState = ref.read(authControllerProvider);
      final loc = state.matchedLocation;
      final onPublicPath = _publicPaths.contains(loc);

      switch (authState.status) {
        case AuthStatus.bootstrapping:
          return loc == '/splash' ? null : '/splash';
        case AuthStatus.bootstrapError:
          return loc == '/offline' ? null : '/offline';
        case AuthStatus.unauthenticated:
          return onPublicPath ? null : '/login';
        case AuthStatus.authenticated:
          return (onPublicPath || loc == '/splash' || loc == '/offline') ? '/home' : null;
      }
    },
    routes: [
      GoRoute(path: '/splash', builder: (context, state) => const Scaffold(body: AppPageLoader())),
      GoRoute(
        path: '/offline',
        builder: (context, state) => Consumer(
          builder: (context, ref, _) => Scaffold(
            body: AppErrorState(
              title: 'Unable to reach Real Vista',
              message: ref.watch(authControllerProvider).errorMessage,
              onRetry: () => ref.read(authControllerProvider.notifier).bootstrap(),
            ),
          ),
        ),
      ),
      GoRoute(path: '/login', builder: (context, state) => const LoginScreen()),
      GoRoute(path: '/forgot-password', builder: (context, state) => const ForgotPasswordScreen()),
      GoRoute(path: '/more', builder: (context, state) => const MoreScreen()),
      StatefulShellRoute.indexedStack(
        builder: (context, state, navigationShell) => CrmBottomNavShell(navigationShell: navigationShell),
        branches: [
          StatefulShellBranch(routes: [
            GoRoute(path: '/home', builder: (context, state) => const DashboardScreen()),
          ]),
          StatefulShellBranch(routes: [
            GoRoute(path: '/leads', builder: (context, state) => const LeadsListScreen()),
          ]),
          StatefulShellBranch(routes: [
            GoRoute(path: '/properties', builder: (context, state) => const PropertiesListScreen()),
          ]),
          StatefulShellBranch(routes: [
            GoRoute(path: '/activities', builder: (context, state) => const ActivitiesTab()),
          ]),
        ],
      ),
    ],
  );
});
