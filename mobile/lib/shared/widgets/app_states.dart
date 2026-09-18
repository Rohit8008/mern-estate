import 'package:flutter/material.dart';

import '../../core/theme/app_colors.dart';
import '../../core/theme/app_spacing.dart';
import 'app_button.dart';

/// Centered full-loading state for a screen's first fetch.
class AppPageLoader extends StatelessWidget {
  const AppPageLoader({super.key});

  @override
  Widget build(BuildContext context) {
    return const Center(child: CircularProgressIndicator(strokeWidth: 2.5));
  }
}

/// Nothing-to-show state — always pairs a concrete message with an
/// optional primary action, never a bare icon.
class AppEmptyState extends StatelessWidget {
  const AppEmptyState({
    super.key,
    required this.icon,
    required this.title,
    this.message,
    this.actionLabel,
    this.onAction,
  });

  final IconData icon;
  final String title;
  final String? message;
  final String? actionLabel;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.xxxl),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 56,
              height: 56,
              decoration: const BoxDecoration(color: AppColors.slate100, shape: BoxShape.circle),
              child: Icon(icon, size: 26, color: AppColors.slate400),
            ),
            const SizedBox(height: AppSpacing.lg),
            Text(title, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: AppColors.slate700)),
            if (message != null) ...[
              const SizedBox(height: 6),
              Text(message!,
                  textAlign: TextAlign.center, style: const TextStyle(fontSize: 13, color: AppColors.slate500)),
            ],
            if (actionLabel != null && onAction != null) ...[
              const SizedBox(height: AppSpacing.lg),
              AppButton(label: actionLabel!, onPressed: onAction, variant: AppButtonVariant.brand, size: AppButtonSize.sm),
            ],
          ],
        ),
      ),
    );
  }
}

/// Failure state — a specific message plus Retry, per the "never a bare
/// Something went wrong" rule.
class AppErrorState extends StatelessWidget {
  const AppErrorState({super.key, required this.title, this.message, this.onRetry});

  final String title;
  final String? message;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.xxxl),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 56,
              height: 56,
              decoration: const BoxDecoration(color: AppColors.rose50, shape: BoxShape.circle),
              child: const Icon(Icons.wifi_off_rounded, size: 26, color: AppColors.rose500),
            ),
            const SizedBox(height: AppSpacing.lg),
            Text(title,
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: AppColors.slate700)),
            if (message != null) ...[
              const SizedBox(height: 6),
              Text(message!,
                  textAlign: TextAlign.center, style: const TextStyle(fontSize: 13, color: AppColors.slate500)),
            ],
            if (onRetry != null) ...[
              const SizedBox(height: AppSpacing.lg),
              AppButton(label: 'Retry', onPressed: onRetry, variant: AppButtonVariant.secondary, size: AppButtonSize.sm),
            ],
          ],
        ),
      ),
    );
  }
}
