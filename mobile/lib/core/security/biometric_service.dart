import 'package:flutter/services.dart';
import 'package:local_auth/local_auth.dart';

/// Thin wrapper over local_auth. Every call is defensive: a device with no
/// hardware, no enrolled biometric, or a thrown platform channel must resolve
/// to a plain false, never an exception that bubbles into the UI.
class BiometricService {
  final LocalAuthentication _auth = LocalAuthentication();

  /// Whether this device can authenticate the user at all — biometric OR the
  /// device passcode. `isDeviceSupported()` is the broad check; we allow the
  /// passcode fallback (biometricOnly: false below), so hardware biometrics are
  /// not strictly required.
  Future<bool> isAvailable() async {
    try {
      return await _auth.isDeviceSupported();
    } on PlatformException {
      return false;
    } catch (_) {
      return false;
    }
  }

  /// Prompts for Face ID / fingerprint, falling back to the device passcode.
  /// Returns true only on a confirmed success; a cancel, lockout or error is
  /// false so the caller simply stays locked.
  Future<bool> authenticate(String reason) async {
    try {
      return await _auth.authenticate(
        localizedReason: reason,
        options: const AuthenticationOptions(
          stickyAuth: true, // survive the app being backgrounded by the system sheet
          biometricOnly: false, // allow the device PIN/passcode as a fallback
        ),
      );
    } on PlatformException {
      return false;
    } catch (_) {
      return false;
    }
  }
}
