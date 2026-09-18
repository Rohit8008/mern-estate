import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app/realtime_overlay.dart';
import 'app/router/app_router.dart';
import 'core/config/env.dart';
import 'core/network/api_client.dart';
import 'core/network/providers.dart';
import 'core/theme/app_theme.dart';
import 'core/utils/root_messenger.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final apiClient = await ApiClient.create(baseUrl: Env.apiBaseUrl);

  runApp(ProviderScope(
    overrides: [apiClientProvider.overrideWithValue(apiClient)],
    child: const RealVistaCrmApp(),
  ));
}

class RealVistaCrmApp extends ConsumerWidget {
  const RealVistaCrmApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(goRouterProvider);
    return MaterialApp.router(
      title: 'Real Vista CRM',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      themeMode: ThemeMode.system,
      routerConfig: router,
      scaffoldMessengerKey: rootScaffoldMessengerKey,
      builder: (context, child) => RealtimeOverlay(child: child ?? const SizedBox.shrink()),
    );
  }
}
