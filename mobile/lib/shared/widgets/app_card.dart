import 'package:flutter/material.dart';

import '../../core/theme/app_colors.dart';
import '../../core/theme/app_spacing.dart';

/// bg-white border-slate-200 rounded-xl shadow-sm — the base card shell
/// used across almost every CRM screen.
class AppCard extends StatelessWidget {
  const AppCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(AppSpacing.lg),
    this.onTap,
    this.topAccent,
  });

  final Widget child;
  final EdgeInsets padding;
  final VoidCallback? onTap;
  final Color? topAccent;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final content = Container(
      decoration: BoxDecoration(
        color: isDark ? AppColors.slate900 : AppColors.white,
        borderRadius: BorderRadius.circular(AppRadius.lg),
        border: Border.all(color: isDark ? AppColors.slate800 : AppColors.slate200),
        boxShadow: isDark
            ? null
            : [BoxShadow(color: AppColors.slate900.withOpacity(0.04), blurRadius: 6, offset: const Offset(0, 1))],
      ),
      foregroundDecoration: topAccent == null
          ? null
          : BoxDecoration(
              border: Border(top: BorderSide(color: topAccent!, width: 2)),
              borderRadius: BorderRadius.circular(AppRadius.lg),
            ),
      child: Padding(padding: padding, child: child),
    );

    if (onTap == null) return content;
    return Material(
      color: Colors.transparent,
      borderRadius: BorderRadius.circular(AppRadius.lg),
      child: InkWell(borderRadius: BorderRadius.circular(AppRadius.lg), onTap: onTap, child: content),
    );
  }
}
