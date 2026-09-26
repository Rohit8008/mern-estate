import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../network/providers.dart';
import '../theme/app_colors.dart';

/// The policies the web app publishes. They live on the same origin as the
/// API, so the link is built from the base URL the ApiClient was created
/// with (Env.apiBaseUrl / --dart-define=API_BASE_URL) — a build pointed at a
/// different server shows that server's policies, never a hardcoded domain.
enum LegalDocument {
  privacy('/privacy', 'Privacy Policy'),
  terms('/terms', 'Terms of Service'),
  cookies('/cookies', 'Cookie Policy'),
  refunds('/refunds', 'Refund and Cancellation Policy');

  const LegalDocument(this.path, this.title);

  final String path;
  final String title;

  /// Origin of [baseUrl] + this document's path. `resolve` with an absolute
  /// path drops any path the base carries, which is what "same origin" means.
  Uri uriFor(String baseUrl) => Uri.parse(baseUrl).resolve(path);
}

/// Opens a policy in the external browser, reporting failure in a snackbar
/// rather than silently doing nothing.
Future<void> openLegalDocument(BuildContext context, WidgetRef ref, LegalDocument doc) async {
  final baseUrl = ref.read(apiClientProvider).dio.options.baseUrl;
  final messenger = ScaffoldMessenger.maybeOf(context);
  var opened = false;
  try {
    opened = await launchUrl(doc.uriFor(baseUrl), mode: LaunchMode.externalApplication);
  } catch (_) {
    opened = false;
  }
  if (!opened) {
    messenger?.showSnackBar(SnackBar(
      content: Text('Could not open the ${doc.title}.'),
      backgroundColor: AppColors.rose600,
    ));
  }
}

/// A single tappable policy name, for inline use in footers and body text.
class LegalLinkText extends ConsumerWidget {
  const LegalLinkText(this.doc, {super.key, this.fontSize = 12});

  final LegalDocument doc;
  final double fontSize;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Semantics(
      link: true,
      child: InkWell(
        onTap: () => openLegalDocument(context, ref, doc),
        borderRadius: BorderRadius.circular(4),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 2, vertical: 6),
          child: Text(
            doc.title,
            style: TextStyle(
              fontSize: fontSize,
              fontWeight: FontWeight.w600,
              color: AppColors.slate500,
              decoration: TextDecoration.underline,
              decorationColor: AppColors.slate300,
            ),
          ),
        ),
      ),
    );
  }
}
