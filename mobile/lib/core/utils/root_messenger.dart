import 'package:flutter/material.dart';

/// Lets code outside any screen's BuildContext (the realtime socket
/// listener) show a SnackBar — mirrors the web app's toast system driven
/// from PushNotificationsListener.jsx, which isn't tied to a single screen.
final rootScaffoldMessengerKey = GlobalKey<ScaffoldMessengerState>();
