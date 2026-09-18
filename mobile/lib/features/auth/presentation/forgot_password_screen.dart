import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/errors/app_failure.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../shared/widgets/widgets.dart';
import '../auth_providers.dart';

enum _Step { email, resetWithOtp, done }

/// Two-step OTP flow matching /api/user/password/request-otp then
/// /api/user/password/reset (PasswordReset.jsx's web equivalent).
class ForgotPasswordScreen extends ConsumerStatefulWidget {
  const ForgotPasswordScreen({super.key});

  @override
  ConsumerState<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends ConsumerState<ForgotPasswordScreen> {
  final _emailController = TextEditingController();
  final _otpController = TextEditingController();
  final _newPasswordController = TextEditingController();

  _Step _step = _Step.email;
  bool _submitting = false;
  String? _errorText;

  @override
  void dispose() {
    _emailController.dispose();
    _otpController.dispose();
    _newPasswordController.dispose();
    super.dispose();
  }

  Future<void> _requestOtp() async {
    final email = _emailController.text.trim();
    if (email.isEmpty) {
      setState(() => _errorText = 'Enter your account email.');
      return;
    }
    setState(() {
      _submitting = true;
      _errorText = null;
    });
    try {
      await ref.read(authApiProvider).requestPasswordResetOtp(email);
      if (!mounted) return;
      setState(() => _step = _Step.resetWithOtp);
    } on AppFailure catch (f) {
      if (mounted) setState(() => _errorText = f.message);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Future<void> _resetPassword() async {
    final otp = _otpController.text.trim();
    final newPassword = _newPasswordController.text;
    if (otp.length != 6 || newPassword.length < 8) {
      setState(() => _errorText = 'Enter the 6-digit code and a password of at least 8 characters.');
      return;
    }
    setState(() {
      _submitting = true;
      _errorText = null;
    });
    try {
      await ref.read(authApiProvider).resetPassword(
            email: _emailController.text.trim(),
            otp: otp,
            newPassword: newPassword,
          );
      if (!mounted) return;
      setState(() => _step = _Step.done);
    } on AppFailure catch (f) {
      if (mounted) setState(() => _errorText = f.message);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Reset password')),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(AppSpacing.xxl),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (_step == _Step.email) ..._buildEmailStep(),
              if (_step == _Step.resetWithOtp) ..._buildOtpStep(),
              if (_step == _Step.done) ..._buildDoneStep(context),
            ],
          ),
        ),
      ),
    );
  }

  List<Widget> _buildEmailStep() {
    return [
      Text('Enter your email', style: Theme.of(context).textTheme.titleLarge),
      const SizedBox(height: 6),
      const Text("We'll send a 6-digit code to reset your password.",
          style: TextStyle(color: AppColors.slate500, fontSize: 13.5)),
      const SizedBox(height: AppSpacing.xl),
      AppTextField(
        label: 'Email',
        hint: 'you@realvista.com',
        controller: _emailController,
        keyboardType: TextInputType.emailAddress,
        prefixIcon: Icons.mail_outline_rounded,
      ),
      ..._buildErrorBanner(),
      const SizedBox(height: AppSpacing.xl),
      AppButton(
        label: 'Send code',
        onPressed: _submitting ? null : _requestOtp,
        loading: _submitting,
        variant: AppButtonVariant.brand,
        expand: true,
      ),
    ];
  }

  List<Widget> _buildOtpStep() {
    return [
      Text('Enter the code', style: Theme.of(context).textTheme.titleLarge),
      const SizedBox(height: 6),
      Text('Sent to ${_emailController.text.trim()}', style: const TextStyle(color: AppColors.slate500, fontSize: 13.5)),
      const SizedBox(height: AppSpacing.xl),
      AppTextField(
        label: '6-digit code',
        hint: '000000',
        controller: _otpController,
        keyboardType: TextInputType.number,
        prefixIcon: Icons.pin_outlined,
      ),
      const SizedBox(height: AppSpacing.lg),
      AppTextField(
        label: 'New password',
        controller: _newPasswordController,
        obscureText: true,
        prefixIcon: Icons.lock_outline_rounded,
      ),
      ..._buildErrorBanner(),
      const SizedBox(height: AppSpacing.xl),
      AppButton(
        label: 'Reset password',
        onPressed: _submitting ? null : _resetPassword,
        loading: _submitting,
        variant: AppButtonVariant.brand,
        expand: true,
      ),
      const SizedBox(height: AppSpacing.sm),
      AppButton(
        label: "Didn't get it? Resend code",
        onPressed: _submitting ? null : _requestOtp,
        variant: AppButtonVariant.ghost,
        expand: true,
      ),
    ];
  }

  List<Widget> _buildDoneStep(BuildContext context) {
    return [
      const Icon(Icons.check_circle_rounded, color: AppColors.emerald500, size: 40),
      const SizedBox(height: AppSpacing.lg),
      Text('Password updated', style: Theme.of(context).textTheme.titleLarge),
      const SizedBox(height: 6),
      const Text('Sign in with your new password.', style: TextStyle(color: AppColors.slate500, fontSize: 13.5)),
      const SizedBox(height: AppSpacing.xl),
      AppButton(label: 'Back to sign in', onPressed: () => Navigator.of(context).pop(), variant: AppButtonVariant.brand, expand: true),
    ];
  }

  List<Widget> _buildErrorBanner() {
    if (_errorText == null) return const [];
    return [
      const SizedBox(height: AppSpacing.sm),
      DecoratedBox(
        decoration: BoxDecoration(color: AppColors.rose50, borderRadius: BorderRadius.circular(10)),
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.md),
          child: Text(_errorText!, style: const TextStyle(color: AppColors.rose700, fontSize: 13)),
        ),
      ),
    ];
  }
}
