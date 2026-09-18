import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import 'app_colors.dart';

/// Text scale built on 'Outfit' — the same family the web CRM sets globally
/// in index.css — so type feels continuous between the two surfaces.
abstract final class AppTypography {
  static TextTheme textTheme(Color ink, Color inkSoft) {
    final base = GoogleFonts.outfitTextTheme();
    return base
        .copyWith(
          displaySmall: base.displaySmall?.copyWith(fontWeight: FontWeight.w800, letterSpacing: -0.5, color: ink),
          headlineMedium: base.headlineMedium?.copyWith(fontWeight: FontWeight.w700, color: ink),
          headlineSmall: base.headlineSmall?.copyWith(fontWeight: FontWeight.w700, color: ink),
          titleLarge: base.titleLarge?.copyWith(fontWeight: FontWeight.w700, color: ink, fontSize: 20),
          titleMedium: base.titleMedium?.copyWith(fontWeight: FontWeight.w600, color: ink, fontSize: 15),
          titleSmall: base.titleSmall?.copyWith(fontWeight: FontWeight.w600, color: ink, fontSize: 13),
          bodyLarge: base.bodyLarge?.copyWith(color: ink, fontSize: 15),
          bodyMedium: base.bodyMedium?.copyWith(color: inkSoft, fontSize: 14),
          bodySmall: base.bodySmall?.copyWith(color: inkSoft, fontSize: 12.5),
          labelLarge: base.labelLarge?.copyWith(fontWeight: FontWeight.w600, color: ink, fontSize: 14),
          labelMedium: base.labelMedium?.copyWith(fontWeight: FontWeight.w600, color: inkSoft, fontSize: 12),
          labelSmall: base.labelSmall?.copyWith(
              fontWeight: FontWeight.w600, color: AppColors.slate500, fontSize: 11, letterSpacing: 0.4),
        )
        .apply(bodyColor: ink, displayColor: ink);
  }
}
