import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';

import 'app/realtime_overlay.dart';
import 'app/router/app_router.dart';
import 'core/security/lock_gate.dart';
import 'core/config/env.dart';
import 'core/logging/app_logger.dart';
import 'core/logging/provider_logging_observer.dart';
import 'core/network/api_client.dart';
import 'core/network/providers.dart';
import 'package:firebase_messaging/firebase_messaging.dart';

import 'core/push/chat_notifications.dart';
import 'core/push/push_providers.dart';
import 'core/push/push_service.dart';
import 'core/theme/app_theme.dart';
import 'core/utils/root_messenger.dart';

void main() {
  final launchedAt = DateTime.now();
  // The binding is initialised INSIDE the zone, so framework callbacks and
  // runApp share it (a mismatch is what Flutter warns about).
  runZonedGuarded(
    () => _run(launchedAt),
    (error, stack) => appLog.error('uncaught zone error', error: error, stack: stack),
  );
}

Future<void> _run(DateTime launchedAt) async {
  WidgetsFlutterBinding.ensureInitialized();
  _captureGlobalErrors();

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
  appLog.start(sender: dioLogSender(apiClient.dio));
  final pushAvailable = await PushService.initFirebase();
  if (pushAvailable) {
    FirebaseMessaging.onBackgroundMessage(firebaseBackgroundHandler);
    await ChatNotifications.init();
  }

  runApp(ProviderScope(
    overrides: [
      apiClientProvider.overrideWithValue(apiClient),
      pushAvailableProvider.overrideWithValue(pushAvailable),
    ],
    observers: [ProviderLoggingObserver()],
    child: const RealVistaCrmApp(),
  ));

  WidgetsBinding.instance.addPostFrameCallback((_) {
    appLog.info('app start', fields: {'cold_start_ms': DateTime.now().difference(launchedAt).inMilliseconds});
  });
}

/// Framework errors (build/layout/paint) and uncaught async errors both go
/// to the logger. The previous FlutterError handler still runs, so debug
/// builds keep the red screen and console dump.
void _captureGlobalErrors() {
  final previous = FlutterError.onError;
  FlutterError.onError = (details) {
    appLog.error(
      'flutter error: ${details.exceptionAsString()}',
      error: details.exception,
      stack: details.stack,
      fields: {'library': details.library, 'context': details.context?.toDescription()},
    );
    previous?.call(details);
  };
  PlatformDispatcher.instance.onError = (error, stack) {
    appLog.error('uncaught platform error', error: error, stack: stack);
    return true;
  };
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
      builder: (context, child) => AppLockGate(child: RealtimeOverlay(child: child ?? const SizedBox.shrink())),
    );
  }
}
