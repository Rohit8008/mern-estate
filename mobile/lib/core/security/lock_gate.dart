import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../theme/app_colors.dart';
import '../theme/app_spacing.dart';
import '../../features/auth/application/auth_state.dart';
import '../../features/auth/auth_providers.dart';
import 'app_lock.dart';

/// Wraps the whole app. When the biometric lock is on, the device can
/// authenticate, the app is locked, and a session is actually signed in, it
/// paints an opaque lock screen over everything — the app underneath keeps its
/// state, so unlocking returns the user exactly where they were. On the login
/// screen there is nothing to protect, so the gate stays out of the way.
class AppLockGate extends ConsumerWidget {
  const AppLockGate({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final lock = ref.watch(appLockControllerProvider);
    final authed = ref.watch(authControllerProvider).status == AuthStatus.authenticated;
    final show = lock.ready && lock.enabled && lock.available && lock.locked && authed;

    return Stack(
      children: [
        child,
        if (show) const Positioned.fill(child: _LockScreen()),
      ],
    );
  }
}

class _LockScreen extends ConsumerStatefulWidget {
  const _LockScreen();

  @override
  ConsumerState<_LockScreen> createState() => _LockScreenState();
}

class _LockScreenState extends ConsumerState<_LockScreen> {
  bool _attempting = false;

  @override
  void initState() {
    super.initState();
    // Prompt as soon as the lock appears, so unlocking is one glance/touch.
    WidgetsBinding.instance.addPostFrameCallback((_) => _tryUnlock());
  }

  Future<void> _tryUnlock() async {
    if (_attempting) return;
    setState(() => _attempting = true);
    try {
      final unlocked = await ref.read(appLockControllerProvider.notifier).unlock();
      // The fingerprint only lifts the LOCAL lock — it is not a server login.
      // Confirm the session is still alive, so unlocking can never drop the
      // user into a session that expired while the app was backgrounded; a dead
      // session sends them to /login instead.
      if (unlocked) await ref.read(authControllerProvider.notifier).revalidate();
    } finally {
      if (mounted) setState(() => _attempting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final bg = dark ? AppColors.slate950 : AppColors.white;
    final fg = dark ? AppColors.slate100 : AppColors.slate900;
    const muted = AppColors.slate400;

    return Material(
      color: bg,
      child: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(AppSpacing.xl),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  height: 72,
                  width: 72,
                  decoration: const BoxDecoration(color: AppColors.indigo600, shape: BoxShape.circle),
                  child: const Icon(Icons.lock_rounded, color: Colors.white, size: 34),
                ),
                const SizedBox(height: AppSpacing.lg),
                Text('Real Vista is locked',
                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: fg)),
                const SizedBox(height: AppSpacing.xs),
                const Text('Unlock with Face ID, fingerprint or your device passcode.',
                    textAlign: TextAlign.center, style: TextStyle(fontSize: 13, color: muted)),
                const SizedBox(height: AppSpacing.xl),
                SizedBox(
                  width: 220,
                  child: FilledButton.icon(
                    onPressed: _attempting ? null : _tryUnlock,
                    icon: _attempting
                        ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                        : const Icon(Icons.fingerprint_rounded, size: 20),
                    label: Text(_attempting ? 'Unlocking…' : 'Unlock'),
                    style: FilledButton.styleFrom(
                      backgroundColor: AppColors.indigo600,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(vertical: 12),
                    ),
                  ),
                ),
                const SizedBox(height: AppSpacing.sm),
                TextButton(
                  onPressed: () => ref.read(authControllerProvider.notifier).signOut(),
                  child: const Text('Sign out instead', style: TextStyle(color: muted, fontSize: 13)),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
