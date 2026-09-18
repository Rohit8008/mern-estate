import 'package:url_launcher/url_launcher.dart';

/// One-tap call/email/WhatsApp — the mobile actions the brief calls out
/// specifically for lead/client rows (desktop just uses tel:/mailto: <a>
/// tags; native apps need url_launcher instead).
abstract final class ContactLauncher {
  static Future<void> call(String phone) => launchUrl(Uri(scheme: 'tel', path: phone));

  static Future<void> email(String address) => launchUrl(Uri(scheme: 'mailto', path: address));

  static Future<void> whatsapp(String phone) {
    final digitsOnly = phone.replaceAll(RegExp(r'[^0-9]'), '');
    return launchUrl(Uri.parse('https://wa.me/$digitsOnly'), mode: LaunchMode.externalApplication);
  }
}
