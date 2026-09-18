import 'package:flutter/material.dart';

import '../../core/theme/app_colors.dart';

enum AppBadgeVariant { defaultVariant, success, warning, error, info, brand, purple, slate }

class _BadgePalette {
  const _BadgePalette(this.bg, this.fg, this.dot);
  final Color bg;
  final Color fg;
  final Color dot;
}

/// Port of design-system/Badge.jsx — used for lead/deal/task status chips.
class AppBadge extends StatelessWidget {
  const AppBadge({super.key, required this.label, this.variant = AppBadgeVariant.defaultVariant, this.dot = false});

  final String label;
  final AppBadgeVariant variant;
  final bool dot;

  static const Map<AppBadgeVariant, _BadgePalette> _palettes = {
    AppBadgeVariant.defaultVariant: _BadgePalette(AppColors.slate100, AppColors.slate700, AppColors.slate400),
    AppBadgeVariant.success: _BadgePalette(AppColors.emerald50, AppColors.emerald700, AppColors.emerald500),
    AppBadgeVariant.warning: _BadgePalette(AppColors.amber50, AppColors.amber700, AppColors.amber500),
    AppBadgeVariant.error: _BadgePalette(AppColors.rose50, AppColors.rose700, AppColors.rose500),
    AppBadgeVariant.info: _BadgePalette(AppColors.blue50, AppColors.blue700, AppColors.blue500),
    AppBadgeVariant.brand: _BadgePalette(AppColors.indigo50, AppColors.indigo700, AppColors.indigo500),
    AppBadgeVariant.purple: _BadgePalette(AppColors.purple50, AppColors.purple700, AppColors.purple500),
    AppBadgeVariant.slate: _BadgePalette(AppColors.slate100, AppColors.slate600, AppColors.slate400),
  };

  @override
  Widget build(BuildContext context) {
    final p = _palettes[variant]!;
    return DecoratedBox(
      decoration: BoxDecoration(color: p.bg, borderRadius: BorderRadius.circular(8)),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (dot) ...[
              Container(width: 6, height: 6, decoration: BoxDecoration(color: p.dot, shape: BoxShape.circle)),
              const SizedBox(width: 5),
            ],
            Text(label, style: TextStyle(color: p.fg, fontSize: 12, fontWeight: FontWeight.w600)),
          ],
        ),
      ),
    );
  }
}
