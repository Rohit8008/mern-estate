import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

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

  bool _saving = false;
  String? _error;
  String? _usernameError;

  @override
  void initState() {
    super.initState();
    final user = ref.read(authControllerProvider).user;
    _username = TextEditingController(text: user?.username ?? '');
    _firstName = TextEditingController(text: user?.firstName ?? '');
    _lastName = TextEditingController(text: user?.lastName ?? '');
    _phone = TextEditingController(text: user?.phone ?? '');
  }

  @override
  void dispose() {
    _username.dispose();
    _firstName.dispose();
    _lastName.dispose();
    _phone.dispose();
    super.dispose();
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
                CircleAvatar(
                  radius: 36,
                  backgroundColor: AppColors.slate100,
                  backgroundImage: (user.avatar != null && user.avatar!.isNotEmpty)
                      ? NetworkImage(user.avatar!)
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
