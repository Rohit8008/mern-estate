import 'package:flutter/material.dart';

import '../../core/theme/app_colors.dart';
import '../../core/theme/app_spacing.dart' show AppRadius;

enum AppButtonVariant { primary, secondary, ghost, danger, brand, dark, darkBrand }

enum AppButtonSize { xs, sm, md, lg }

/// Direct port of design-system/Button.jsx — same variant names, same
/// color roles, so "primary" means the same thing on both surfaces.
class AppButton extends StatelessWidget {
  const AppButton({
    super.key,
    required this.label,
    this.onPressed,
    this.variant = AppButtonVariant.primary,
    this.size = AppButtonSize.md,
    this.icon,
    this.iconRight,
    this.loading = false,
    this.expand = false,
  });

  final String label;
  final VoidCallback? onPressed;
  final AppButtonVariant variant;
  final AppButtonSize size;
  final IconData? icon;
  final IconData? iconRight;
  final bool loading;
  final bool expand;

  bool get _disabled => onPressed == null || loading;

  @override
  Widget build(BuildContext context) {
    final palette = _palette(variant, _disabled);
    final dims = _dims(size);

    final child = Row(
      mainAxisSize: expand ? MainAxisSize.max : MainAxisSize.min,
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        if (loading)
          SizedBox(
            width: dims.iconSize,
            height: dims.iconSize,
            child: CircularProgressIndicator(strokeWidth: 2, color: palette.fg),
          )
        else if (icon != null)
          Icon(icon, size: dims.iconSize, color: palette.fg),
        if ((loading || icon != null) && label.isNotEmpty) SizedBox(width: dims.gap),
        if (label.isNotEmpty)
          Flexible(
            child: Text(
              label,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(color: palette.fg, fontSize: dims.fontSize, fontWeight: FontWeight.w600),
            ),
          ),
        if (!loading && iconRight != null) ...[
          SizedBox(width: dims.gap),
          Icon(iconRight, size: dims.iconSize, color: palette.fg),
        ],
      ],
    );

    return Material(
      color: palette.bg,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(dims.radius),
        side: palette.border != null ? BorderSide(color: palette.border!) : BorderSide.none,
      ),
      child: InkWell(
        onTap: _disabled ? null : onPressed,
        borderRadius: BorderRadius.circular(dims.radius),
        child: Padding(
          padding: EdgeInsets.symmetric(horizontal: dims.paddingX, vertical: dims.paddingY),
          child: child,
        ),
      ),
    );
  }

  static _ButtonPalette _palette(AppButtonVariant variant, bool disabled) {
    switch (variant) {
      case AppButtonVariant.primary:
        return _ButtonPalette(bg: disabled ? AppColors.slate400 : AppColors.slate900, fg: AppColors.white);
      case AppButtonVariant.secondary:
        return _ButtonPalette(
            bg: AppColors.white, fg: AppColors.slate700.withOpacity(disabled ? 0.5 : 1), border: AppColors.slate200);
      case AppButtonVariant.ghost:
        return _ButtonPalette(bg: Colors.transparent, fg: AppColors.slate600.withOpacity(disabled ? 0.5 : 1));
      case AppButtonVariant.danger:
        return _ButtonPalette(bg: disabled ? AppColors.rose300 : AppColors.rose600, fg: AppColors.white);
      case AppButtonVariant.brand:
        return _ButtonPalette(bg: disabled ? AppColors.indigo300 : AppColors.indigo600, fg: AppColors.white);
      case AppButtonVariant.dark:
        return _ButtonPalette(
            bg: AppColors.white.withOpacity(0.1),
            fg: AppColors.white.withOpacity(disabled ? 0.5 : 1),
            border: AppColors.white.withOpacity(0.1));
      case AppButtonVariant.darkBrand:
        return _ButtonPalette(bg: disabled ? AppColors.indigo800 : AppColors.indigo600, fg: AppColors.white);
    }
  }

  static _ButtonDims _dims(AppButtonSize size) {
    switch (size) {
      case AppButtonSize.xs:
        return const _ButtonDims(paddingX: 10, paddingY: 6, radius: AppRadius.sm, fontSize: 12, iconSize: 14, gap: 6);
      case AppButtonSize.sm:
        return const _ButtonDims(paddingX: 12, paddingY: 8, radius: AppRadius.md, fontSize: 13, iconSize: 16, gap: 6);
      case AppButtonSize.md:
        return const _ButtonDims(paddingX: 16, paddingY: 10, radius: AppRadius.md, fontSize: 14, iconSize: 16, gap: 8);
      case AppButtonSize.lg:
        return const _ButtonDims(paddingX: 20, paddingY: 12, radius: AppRadius.lg, fontSize: 15, iconSize: 18, gap: 8);
    }
  }
}

class _ButtonPalette {
  const _ButtonPalette({required this.bg, required this.fg, this.border});
  final Color bg;
  final Color fg;
  final Color? border;
}

class _ButtonDims {
  const _ButtonDims({
    required this.paddingX,
    required this.paddingY,
    required this.radius,
    required this.fontSize,
    required this.iconSize,
    required this.gap,
  });
  final double paddingX;
  final double paddingY;
  final double radius;
  final double fontSize;
  final double iconSize;
  final double gap;
}
