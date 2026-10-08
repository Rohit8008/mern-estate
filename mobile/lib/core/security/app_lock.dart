import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'biometric_service.dart';

final biometricServiceProvider = Provider<BiometricService>((ref) => BiometricService());

final appLockControllerProvider =
    StateNotifierProvider<AppLockController, AppLockState>((ref) => AppLockController(ref.watch(biometricServiceProvider)));

class AppLockState {
  const AppLockState({
    this.enabled = false,
    this.available = false,
    this.locked = false,
    this.ready = false,
  });

  /// The user has turned the lock on (persisted).
  final bool enabled;

  /// The device can actually authenticate (hardware + OS support).
  final bool available;

  /// Right now the app should be covered by the lock screen.
  final bool locked;

  /// The initial async load (prefs + availability) has finished.
  final bool ready;

  AppLockState copyWith({bool? enabled, bool? available, bool? locked, bool? ready}) => AppLockState(
        enabled: enabled ?? this.enabled,
        available: available ?? this.available,
        locked: locked ?? this.locked,
        ready: ready ?? this.ready,
      );
}

/// Owns the biometric app-lock: the saved on/off preference, whether the device
/// can authenticate, and the live locked/unlocked state. No password or token is
/// stored — the lock only gates access to the session the cookie jar already
/// holds, so the backend is untouched and nothing secret lives on the device.
class AppLockController extends StateNotifier<AppLockState> with WidgetsBindingObserver {
  AppLockController(this._bio) : super(const AppLockState()) {
    _init();
  }

  final BiometricService _bio;
  static const _prefKey = 'app_lock_enabled';

  // True only while a system auth sheet is up. The biometric dialog can push the
  // app through inactive/paused, which would otherwise re-lock mid-prompt and
  // loop; this guard suppresses that.
  bool _authenticating = false;

  Future<void> _init() async {
    WidgetsBinding.instance.addObserver(this);
    bool enabled = false;
    try {
      final prefs = await SharedPreferences.getInstance();
      enabled = prefs.getBool(_prefKey) ?? false;
    } catch (_) {/* default off */}
    final available = await _bio.isAvailable();
    // Cold start begins locked when the lock is on and still usable.
    state = AppLockState(enabled: enabled, available: available, locked: enabled && available, ready: true);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  // Not named `state`: that is the StateNotifier's own property.
  // ignore: avoid_renaming_method_parameters
  void didChangeAppLifecycleState(AppLifecycleState lifecycle) {
    if (!state.enabled || !state.available || _authenticating) return;
    // Lock when the app actually leaves the foreground, so returning to it
    // requires re-authentication. `paused` (not `inactive`) avoids re-locking on
    // transient interruptions like the notification shade or a permission sheet.
    if (lifecycle == AppLifecycleState.paused) {
      if (!state.locked) state = state.copyWith(locked: true);
    }
  }

  /// Turn the lock on. Requires a successful authentication first, so the lock is
  /// never enabled on a device that cannot actually unlock it.
  Future<bool> enable() async {
    final available = await _bio.isAvailable();
    if (!available) {
      state = state.copyWith(available: false);
      return false;
    }
    final ok = await _guardedAuth('Confirm to turn on app lock');
    if (!ok) return false;
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setBool(_prefKey, true);
    } catch (_) {/* best effort; state still reflects the choice this session */}
    state = state.copyWith(enabled: true, available: true, locked: false);
    return true;
  }

  /// Turn the lock off. No auth required — reaching Settings already means the
  /// app is unlocked.
  Future<void> disable() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setBool(_prefKey, false);
    } catch (_) {/* best effort */}
    state = state.copyWith(enabled: false, locked: false);
  }

  /// Attempt to unlock from the lock screen.
  Future<bool> unlock() => _guardedAuth('Unlock Real Vista');

  Future<bool> _guardedAuth(String reason) async {
    _authenticating = true;
    try {
      final ok = await _bio.authenticate(reason);
      if (ok) state = state.copyWith(locked: false);
      return ok;
    } finally {
      _authenticating = false;
    }
  }
}
