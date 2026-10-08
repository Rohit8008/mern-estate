import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../../../core/config/env.dart';
import '../../../core/errors/app_failure.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../shared/widgets/widgets.dart';
import '../../auth/auth_providers.dart';
import '../profile_providers.dart';

/// Your own account: the identity fields you are allowed to change, plus the
/// ones you are not (email, role) shown read-only rather than hidden, so the
/// screen answers "which account am I signed in as" without a round trip.
///
/// Validation is `errorText` rather than a Form — AppTextField has no
/// validator hook, and inventing a second text field just for this screen
/// would fork the design system.
class ProfileScreen extends ConsumerStatefulWidget {
  const ProfileScreen({super.key});

  @override
  ConsumerState<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends ConsumerState<ProfileScreen> {
  late final TextEditingController _username;
  late final TextEditingController _firstName;
  late final TextEditingController _lastName;
  late final TextEditingController _phone;
  late final TextEditingController _currentPassword;
  late final TextEditingController _newPassword;

  bool _saving = false;
  String? _error;
  String? _usernameError;

  bool _uploadingAvatar = false;

  bool _changingPassword = false;
  String? _passwordError;
  bool _obscureCurrent = true;
  bool _obscureNew = true;

  @override
  void initState() {
    super.initState();
    final user = ref.read(authControllerProvider).user;
    _username = TextEditingController(text: user?.username ?? '');
    _firstName = TextEditingController(text: user?.firstName ?? '');
    _lastName = TextEditingController(text: user?.lastName ?? '');
    _phone = TextEditingController(text: user?.phone ?? '');
    _currentPassword = TextEditingController();
    _newPassword = TextEditingController();
  }

  @override
  void dispose() {
    _username.dispose();
    _firstName.dispose();
    _lastName.dispose();
    _phone.dispose();
    _currentPassword.dispose();
    _newPassword.dispose();
    super.dispose();
  }

  /// Relative `/uploads/...` URLs from the backend need the host prepended
  /// before a NetworkImage can fetch them; absolute (e.g. Cloudinary) URLs are
  /// left as-is.
  static String? _resolveAvatar(String? url) {
    if (url == null || url.isEmpty) return null;
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    return '${Env.apiBaseUrl}$url';
  }

  /// Mirrors the server's Joi rule (alphanum, 3..30) so a bad username is
  /// caught before a round trip rather than coming back as a raw 400.
  String? _validateUsername(String value) {
    final t = value.trim();
    if (t.length < 3) return 'At least 3 characters';
    if (t.length > 30) return 'At most 30 characters';
    if (!RegExp(r'^[a-zA-Z0-9]+$').hasMatch(t)) return 'Letters and numbers only';
    return null;
  }

  Future<void> _save() async {
    final user = ref.read(authControllerProvider).user;
    if (user == null) return;

    final usernameError = _validateUsername(_username.text);
    setState(() => _usernameError = usernameError);
    if (usernameError != null) return;

    setState(() {
      _saving = true;
      _error = null;
    });

    try {
      final updated = await ref.read(profileApiProvider).update(user.id, {
        'username': _username.text.trim(),
        'firstName': _firstName.text.trim(),
        'lastName': _lastName.text.trim(),
        'phone': _phone.text.trim(),
      });
      // In place, not bootstrap() — see AuthController.applyUser.
      ref.read(authControllerProvider.notifier).applyUser(updated);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Profile updated')));
    } on AppFailure catch (f) {
      if (mounted) setState(() => _error = f.message);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _changeAvatar() async {
    final user = ref.read(authControllerProvider).user;
    if (user == null || _uploadingAvatar) return;

    final source = await showModalBottomSheet<ImageSource>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.photo_camera_outlined),
              title: const Text('Take a photo'),
              onTap: () => Navigator.pop(ctx, ImageSource.camera),
            ),
            ListTile(
              leading: const Icon(Icons.photo_library_outlined),
              title: const Text('Choose from gallery'),
              onTap: () => Navigator.pop(ctx, ImageSource.gallery),
            ),
          ],
        ),
      ),
    );
    if (source == null) return;

    final picked = await ImagePicker().pickImage(source: source, imageQuality: 85, maxWidth: 1024);
    if (picked == null) return;

    setState(() {
      _uploadingAvatar = true;
      _error = null;
    });
    try {
      final bytes = await picked.readAsBytes();
      final api = ref.read(profileApiProvider);
      final url = await api.uploadAvatar(picked.name, bytes);
      final updated = await api.update(user.id, {'avatar': url});
      ref.read(authControllerProvider.notifier).applyUser(updated);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Photo updated')));
    } on AppFailure catch (f) {
      if (mounted) setState(() => _error = f.message);
    } finally {
      if (mounted) setState(() => _uploadingAvatar = false);
    }
  }

  Future<void> _changePassword() async {
    if (_changingPassword) return;
    final current = _currentPassword.text;
    final next = _newPassword.text;

    if (current.isEmpty) {
      setState(() => _passwordError = 'Enter your current password');
      return;
    }
    if (next.length < 8) {
      setState(() => _passwordError = 'New password must be at least 8 characters');
      return;
    }

    setState(() {
      _changingPassword = true;
      _passwordError = null;
    });
    try {
      await ref.read(profileApiProvider).changePassword(currentPassword: current, newPassword: next);
      _currentPassword.clear();
      _newPassword.clear();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Password changed')));
    } on AppFailure catch (f) {
      if (mounted) setState(() => _passwordError = f.message);
    } finally {
      if (mounted) setState(() => _changingPassword = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authControllerProvider).user;
    if (user == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Profile')),
        body: const AppEmptyState(
          icon: Icons.person_off_outlined,
          title: 'Not signed in',
          message: 'Sign in again to view your profile.',
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(title: const Text('Profile')),
      body: ListView(
        padding: const EdgeInsets.all(AppSpacing.md),
        children: [
          Center(
            child: Column(
              children: [
                GestureDetector(
                  onTap: _uploadingAvatar ? null : _changeAvatar,
                  child: Stack(
                    children: [
                      CircleAvatar(
                        radius: 36,
                        backgroundColor: AppColors.slate100,
                        backgroundImage: _resolveAvatar(user.avatar) != null
                            ? NetworkImage(_resolveAvatar(user.avatar)!)
                            : null,
                        child: (user.avatar == null || user.avatar!.isEmpty)
                            ? Text(
                                _initials(user.fullName),
                                style: const TextStyle(
                                  fontSize: 22,
                                  fontWeight: FontWeight.w600,
                                  color: AppColors.slate600,
                                ),
                              )
                            : null,
                      ),
                      Positioned(
                        right: 0,
                        bottom: 0,
                        child: Container(
                          padding: const EdgeInsets.all(5),
                          decoration: BoxDecoration(
                            color: AppColors.indigo600,
                            shape: BoxShape.circle,
                            border: Border.all(color: Colors.white, width: 2),
                          ),
                          child: _uploadingAvatar
                              ? const SizedBox(
                                  width: 12,
                                  height: 12,
                                  child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                                )
                              : const Icon(Icons.photo_camera_rounded, size: 13, color: Colors.white),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: AppSpacing.sm),
                Text(user.fullName, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w600)),
                const SizedBox(height: 2),
                Text(user.email, style: const TextStyle(color: AppColors.slate400, fontSize: 13)),
                const SizedBox(height: AppSpacing.xs),
                AppBadge(label: _roleLabel(user.role)),
              ],
            ),
          ),
          const SizedBox(height: AppSpacing.lg),
          if (_error != null) ...[
            AppCard(child: Text(_error!, style: const TextStyle(color: AppColors.rose600, fontSize: 13))),
            const SizedBox(height: AppSpacing.md),
          ],
          AppTextField(
            label: 'Username',
            controller: _username,
            errorText: _usernameError,
            onChanged: (_) {
              if (_usernameError != null) setState(() => _usernameError = null);
            },
          ),
          const SizedBox(height: AppSpacing.md),
          AppTextField(label: 'First name', controller: _firstName),
          const SizedBox(height: AppSpacing.md),
          AppTextField(label: 'Last name', controller: _lastName),
          const SizedBox(height: AppSpacing.md),
          AppTextField(label: 'Phone', controller: _phone, keyboardType: TextInputType.phone),
          const SizedBox(height: AppSpacing.lg),
          AppButton(label: 'Save changes', onPressed: _saving ? null : _save, loading: _saving, expand: true),
          const SizedBox(height: AppSpacing.md),
          const Text(
            'Email and role are set by your workspace admin and cannot be changed here.',
            style: TextStyle(color: AppColors.slate400, fontSize: 12),
            textAlign: TextAlign.center,
          ),

          const SizedBox(height: AppSpacing.xl),
          const Text('Change password', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
          const SizedBox(height: AppSpacing.md),
          if (_passwordError != null) ...[
            AppCard(child: Text(_passwordError!, style: const TextStyle(color: AppColors.rose600, fontSize: 13))),
            const SizedBox(height: AppSpacing.md),
          ],
          AppTextField(
            label: 'Current password',
            controller: _currentPassword,
            obscureText: _obscureCurrent,
            suffixIcon: IconButton(
              tooltip: _obscureCurrent ? 'Show password' : 'Hide password',
              icon: Icon(_obscureCurrent ? Icons.visibility_off_outlined : Icons.visibility_outlined,
                  size: 20, color: AppColors.slate400),
              onPressed: () => setState(() => _obscureCurrent = !_obscureCurrent),
            ),
          ),
          const SizedBox(height: AppSpacing.md),
          AppTextField(
            label: 'New password',
            controller: _newPassword,
            obscureText: _obscureNew,
            suffixIcon: IconButton(
              tooltip: _obscureNew ? 'Show password' : 'Hide password',
              icon: Icon(_obscureNew ? Icons.visibility_off_outlined : Icons.visibility_outlined,
                  size: 20, color: AppColors.slate400),
              onPressed: () => setState(() => _obscureNew = !_obscureNew),
            ),
          ),
          const SizedBox(height: AppSpacing.xs),
          const Text('At least 8 characters.', style: TextStyle(color: AppColors.slate400, fontSize: 12)),
          const SizedBox(height: AppSpacing.md),
          AppButton(
            label: 'Update password',
            variant: AppButtonVariant.secondary,
            onPressed: _changingPassword ? null : _changePassword,
            loading: _changingPassword,
            expand: true,
          ),

          const SizedBox(height: AppSpacing.xxl),
        ],
      ),
    );
  }

  static String _initials(String name) {
    final parts = name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
    if (parts.isEmpty) return '?';
    if (parts.length == 1) return parts.first.substring(0, 1).toUpperCase();
    return (parts.first.substring(0, 1) + parts.last.substring(0, 1)).toUpperCase();
  }

  static String _roleLabel(String role) => switch (role) {
        'admin' => 'Admin',
        'employee' => 'Agent',
        'seller' => 'Seller',
        _ => role,
      };
}
