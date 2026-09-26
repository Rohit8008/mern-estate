import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';

import 'app/realtime_overlay.dart';
import 'app/router/app_router.dart';
import 'core/config/env.dart';
import 'core/network/api_client.dart';
import 'core/network/providers.dart';
import 'core/theme/app_theme.dart';
import 'core/utils/root_messenger.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Fonts come from assets/google_fonts/ only. Left on, google_fonts would
  // download any missing weight from fonts.gstatic.com at runtime — handing
  // a third party every user's IP address, which the privacy policy does not
  // disclose.
  GoogleFonts.config.allowRuntimeFetching = false;
  LicenseRegistry.addLicense(() async* {
    final license = await rootBundle.loadString('assets/google_fonts/OFL.txt');
    yield LicenseEntryWithLineBreaks(['Outfit'], license);
  });

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
