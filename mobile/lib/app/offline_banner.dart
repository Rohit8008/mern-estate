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
      return Positioned(
        bottom: AppSpacing.xl,
        left: 0,
        right: 0,
        child: Center(
          child: DecoratedBox(
            decoration: BoxDecoration(color: AppColors.emerald600, borderRadius: BorderRadius.circular(999)),
            child: const Padding(
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
      );
    }

    return const Positioned(
      bottom: 0,
      left: 0,
      right: 0,
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
    );
  }
}
