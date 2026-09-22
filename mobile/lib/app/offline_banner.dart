import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/connectivity/connectivity_providers.dart';
import '../core/theme/app_colors.dart';
import '../core/theme/app_spacing.dart';

/// Mirrors OfflineIndicator.jsx: an amber "you're offline" strip pinned to
/// the bottom while disconnected, replaced by a brief green "Back online"
/// pill for 3s on reconnect.
class OfflineBanner extends ConsumerStatefulWidget {
  const OfflineBanner({super.key});

  @override
  ConsumerState<OfflineBanner> createState() => _OfflineBannerState();
}

class _OfflineBannerState extends ConsumerState<OfflineBanner> {
  bool _showBackOnline = false;

  @override
  Widget build(BuildContext context) {
    final isOnline = ref.watch(isOnlineProvider);

    ref.listen<bool>(isOnlineProvider, (previous, next) {
      if (previous == false && next == true) {
        setState(() => _showBackOnline = true);
        Future.delayed(const Duration(seconds: 3), () {
          if (mounted) setState(() => _showBackOnline = false);
        });
      }
    });

    if (isOnline && !_showBackOnline) return const SizedBox.shrink();

    if (isOnline && _showBackOnline) {
      return const Positioned(
        bottom: AppSpacing.xl,
        left: 0,
        right: 0,
        child: _BannerSurface(
          child: Center(
            child: DecoratedBox(
              decoration: BoxDecoration(color: AppColors.emerald600, borderRadius: BorderRadius.all(Radius.circular(999))),
              child: Padding(
                padding: EdgeInsets.symmetric(horizontal: AppSpacing.lg, vertical: AppSpacing.sm),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.wifi_rounded, color: AppColors.white, size: 16),
                    SizedBox(width: AppSpacing.sm),
                    Text('Back online', style: TextStyle(color: AppColors.white, fontSize: 13, fontWeight: FontWeight.w600)),
                  ],
                ),
              ),
            ),
          ),
        ),
      );
    }

    return const Positioned(
      bottom: 0,
      left: 0,
      right: 0,
      child: _BannerSurface(
        child: SafeArea(
          top: false,
          child: ColoredBox(
            color: AppColors.amber500,
            child: Padding(
              padding: EdgeInsets.symmetric(horizontal: AppSpacing.lg, vertical: AppSpacing.sm),
              child: Row(
                children: [
                  Icon(Icons.wifi_off_rounded, color: AppColors.white, size: 16),
                  SizedBox(width: AppSpacing.sm),
                  Expanded(child: Text("You're offline — showing cached data", style: TextStyle(color: AppColors.white, fontSize: 12.5, fontWeight: FontWeight.w600))),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// This banner is mounted from `MaterialApp.router`'s `builder`, which sits
/// ABOVE the Navigator — so there is no Scaffold or Material in scope and
/// `Text` falls back to DefaultTextStyle.fallback(): monospace, with a double
/// yellow underline. An explicit TextStyle does not rescue it, because a style
/// that leaves `decoration` unset inherits the fallback's underline. That
/// fallback renders in release builds too, so the strip a user sees the moment
/// their connection drops looked broken. A transparent Material puts a real
/// DefaultTextStyle back in scope.
class _BannerSurface extends StatelessWidget {
  const _BannerSurface({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) => Material(
        type: MaterialType.transparency,
        child: child,
      );
}
