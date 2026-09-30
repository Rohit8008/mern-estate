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

/// Wraps a centred state in a pull-to-refresh that still works when there is
/// nothing to scroll: an AlwaysScrollable view at least as tall as the
/// viewport, so an empty or failed list can be dragged to reload just like a
/// full one. Without [onRefresh] the child is returned untouched.
class _Refreshable extends StatelessWidget {
  const _Refreshable({required this.onRefresh, required this.child});

  final Future<void> Function()? onRefresh;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    if (onRefresh == null) return child;
    return RefreshIndicator(
      onRefresh: onRefresh!,
      child: LayoutBuilder(
        builder: (context, constraints) => SingleChildScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          child: ConstrainedBox(
            constraints: BoxConstraints(minHeight: constraints.maxHeight, minWidth: constraints.maxWidth),
            child: child,
          ),
        ),
      ),
    );
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
    this.onRefresh,
  });

  final IconData icon;
  final String title;
  final String? message;
  final String? actionLabel;
  final VoidCallback? onAction;
  final Future<void> Function()? onRefresh;

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    return _Refreshable(
      onRefresh: onRefresh,
      child: Center(
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.xxxl),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 56,
                height: 56,
                decoration: BoxDecoration(color: dark ? AppColors.slate800 : AppColors.slate100, shape: BoxShape.circle),
                child: Icon(icon, size: 26, color: dark ? AppColors.slate500 : AppColors.slate400),
              ),
              const SizedBox(height: AppSpacing.lg),
              Text(title,
                  textAlign: TextAlign.center, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
              if (message != null) ...[
                const SizedBox(height: 6),
                Text(message!,
                    textAlign: TextAlign.center,
                    style: TextStyle(fontSize: 13, color: dark ? AppColors.slate400 : AppColors.slate500)),
              ],
              if (actionLabel != null && onAction != null) ...[
                const SizedBox(height: AppSpacing.lg),
                AppButton(
                    label: actionLabel!, onPressed: onAction, variant: AppButtonVariant.brand, size: AppButtonSize.md),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// Failure state — a specific message plus Retry, per the "never a bare
/// Something went wrong" rule.
class AppErrorState extends StatelessWidget {
  const AppErrorState({super.key, required this.title, this.message, this.onRetry, this.onRefresh});

  final String title;
  final String? message;
  final VoidCallback? onRetry;
  final Future<void> Function()? onRefresh;

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    return _Refreshable(
      onRefresh: onRefresh,
      child: Center(
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.xxxl),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 56,
                height: 56,
                decoration: BoxDecoration(
                    color: dark ? AppColors.roseTintDark : AppColors.rose50, shape: BoxShape.circle),
                child: Icon(Icons.wifi_off_rounded, size: 26, color: dark ? AppColors.rose300 : AppColors.rose500),
              ),
              const SizedBox(height: AppSpacing.lg),
              Text(title,
                  textAlign: TextAlign.center, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
              if (message != null) ...[
                const SizedBox(height: 6),
                Text(message!,
                    textAlign: TextAlign.center,
                    style: TextStyle(fontSize: 13, color: dark ? AppColors.slate400 : AppColors.slate500)),
              ],
              if (onRetry != null) ...[
                const SizedBox(height: AppSpacing.lg),
                AppButton(
                    label: 'Retry', onPressed: onRetry, variant: AppButtonVariant.secondary, size: AppButtonSize.md),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
