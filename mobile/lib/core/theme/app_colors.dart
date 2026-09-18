import 'package:flutter/material.dart';

/// Color tokens ported 1:1 from the web CRM's Tailwind palette
/// (frontend/src/design-system/*.jsx) so both surfaces read as one product.
abstract final class AppColors {
  // Slate — page backgrounds, borders, ink.
  static const slate50 = Color(0xFFF8FAFC);
  static const slate100 = Color(0xFFF1F5F9);
  static const slate200 = Color(0xFFE2E8F0);
  static const slate300 = Color(0xFFCBD5E1);
  static const slate400 = Color(0xFF94A3B8);
  static const slate500 = Color(0xFF64748B);
  static const slate600 = Color(0xFF475569);
  static const slate700 = Color(0xFF334155);
  static const slate800 = Color(0xFF1E293B);
  static const slate900 = Color(0xFF0F172A);
  static const slate950 = Color(0xFF020617);

  // Indigo — brand accent, primary CTAs on dark surfaces.
  static const indigo50 = Color(0xFFEEF2FF);
  static const indigo100 = Color(0xFFE0E7FF);
  static const indigo200 = Color(0xFFC7D2FE);
  static const indigo300 = Color(0xFFA5B4FC);
  static const indigo400 = Color(0xFF818CF8);
  static const indigo500 = Color(0xFF6366F1);
  static const indigo600 = Color(0xFF4F46E5);
  static const indigo700 = Color(0xFF4338CA);
  static const indigo800 = Color(0xFF3730A3);

  // Emerald — success / won / positive trend.
  static const emerald50 = Color(0xFFECFDF5);
  static const emerald100 = Color(0xFFD1FAE5);
  static const emerald200 = Color(0xFFA7F3D0);
  static const emerald500 = Color(0xFF10B981);
  static const emerald600 = Color(0xFF059669);
  static const emerald700 = Color(0xFF047857);

  // Amber — warning / pending.
  static const amber50 = Color(0xFFFFFBEB);
  static const amber100 = Color(0xFFFEF3C7);
  static const amber200 = Color(0xFFFDE68A);
  static const amber500 = Color(0xFFF59E0B);
  static const amber600 = Color(0xFFD97706);
  static const amber700 = Color(0xFFB45309);

  // Rose — danger / error / lost / overdue.
  static const rose50 = Color(0xFFFFF1F2);
  static const rose100 = Color(0xFFFFE4E6);
  static const rose200 = Color(0xFFFECDD3);
  static const rose300 = Color(0xFFFDA4AF);
  static const rose500 = Color(0xFFF43F5E);
  static const rose600 = Color(0xFFE11D48);
  static const rose700 = Color(0xFFBE123C);
  static const rose800 = Color(0xFF9F1239);

  // Blue — info.
  static const blue50 = Color(0xFFEFF6FF);
  static const blue100 = Color(0xFFDBEAFE);
  static const blue200 = Color(0xFFBFDBFE);
  static const blue500 = Color(0xFF3B82F6);
  static const blue600 = Color(0xFF2563EB);
  static const blue700 = Color(0xFF1D4ED8);

  // Purple — secondary accent (KPI cards, badges).
  static const purple50 = Color(0xFFFAF5FF);
  static const purple100 = Color(0xFFF3E8FF);
  static const purple200 = Color(0xFFE9D5FF);
  static const purple500 = Color(0xFFA855F7);
  static const purple600 = Color(0xFF9333EA);
  static const purple700 = Color(0xFF7E22CE);

  static const white = Color(0xFFFFFFFF);
}

/// Named accent used by [KpiCard] and other color-keyed components —
/// mirrors the ACCENT_COLORS map in KpiCard.jsx exactly.
enum AppAccent { blue, amber, emerald, purple, rose, indigo, slate }

class AppAccentSwatch {
  const AppAccentSwatch({required this.bar, required this.iconBg, required this.iconRing, required this.text});

  final Color bar;
  final Color iconBg;
  final Color iconRing;
  final Color text;

  static AppAccentSwatch of(AppAccent accent) => switch (accent) {
        AppAccent.blue => const AppAccentSwatch(
            bar: AppColors.blue500, iconBg: AppColors.blue50, iconRing: AppColors.blue100, text: AppColors.blue600),
        AppAccent.amber => const AppAccentSwatch(
            bar: AppColors.amber500, iconBg: AppColors.amber50, iconRing: AppColors.amber100, text: AppColors.amber600),
        AppAccent.emerald => const AppAccentSwatch(
            bar: AppColors.emerald500,
            iconBg: AppColors.emerald50,
            iconRing: AppColors.emerald100,
            text: AppColors.emerald600),
        AppAccent.purple => const AppAccentSwatch(
            bar: AppColors.purple500,
            iconBg: AppColors.purple50,
            iconRing: AppColors.purple100,
            text: AppColors.purple600),
        AppAccent.rose => const AppAccentSwatch(
            bar: AppColors.rose500, iconBg: AppColors.rose50, iconRing: AppColors.rose100, text: AppColors.rose600),
        AppAccent.indigo => const AppAccentSwatch(
            bar: AppColors.indigo500,
            iconBg: AppColors.indigo50,
            iconRing: AppColors.indigo100,
            text: AppColors.indigo600),
        AppAccent.slate => const AppAccentSwatch(
            bar: AppColors.slate500, iconBg: AppColors.slate100, iconRing: AppColors.slate200, text: AppColors.slate600),
      };
}
