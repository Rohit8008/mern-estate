// Outfit must load from assets/google_fonts/ with runtime fetching off (as
// main() sets it). If the theme starts requesting a variant with no bundled
// file — a new weight, or a renamed file — this fails, rather than the app
// logging a font error at runtime and falling back to the platform font.

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:realvista_crm/core/theme/app_colors.dart';
import 'package:realvista_crm/core/theme/app_typography.dart';

/// google_fonts' family-variant key ('Outfit_regular', 'Outfit_700') to the
/// `Family-Weight.ttf` name it looks for among the assets.
const _variantFileNames = {
  'regular': 'Regular', '100': 'Thin', '200': 'ExtraLight', '300': 'Light', '500': 'Medium',
  '600': 'SemiBold', '700': 'Bold', '800': 'ExtraBold', '900': 'Black', 'italic': 'Italic',
};

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('every Outfit variant the theme uses is bundled', () async {
    final theme = AppTypography.textTheme(AppColors.slate900, AppColors.slate500);
    final styles = [
      theme.displayLarge, theme.displayMedium, theme.displaySmall,
      theme.headlineLarge, theme.headlineMedium, theme.headlineSmall,
      theme.titleLarge, theme.titleMedium, theme.titleSmall,
      theme.bodyLarge, theme.bodyMedium, theme.bodySmall,
      theme.labelLarge, theme.labelMedium, theme.labelSmall,
    ];
    final families = styles.map((s) => s?.fontFamily).whereType<String>().toSet();
    expect(families, isNotEmpty);

    for (final family in families) {
      final [name, variant] = family.split('_');
      final file = 'assets/google_fonts/$name-${_variantFileNames[variant] ?? variant}.ttf';
      ByteData? data;
      try {
        data = await rootBundle.load(file);
      } catch (_) {}
      expect(data, isNotNull, reason: '$family is requested but $file is not bundled');
    }
  });
}
