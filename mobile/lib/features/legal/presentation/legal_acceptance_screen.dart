import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/errors/app_failure.dart';
import '../../../core/legal/legal_links.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../shared/widgets/widgets.dart';
import '../../auth/auth_providers.dart';
import '../data/legal_api.dart';

/// The blocking step shown after sign-in when the server says the Terms
/// version in force has not been accepted by this user.
///
/// The router keeps the user here (AuthState.needsLegalAcceptance), and back
/// is swallowed, so the only ways out are accepting or signing out. The box
/// starts unticked — acceptance has to be an action the person takes.
class LegalAcceptanceScreen extends ConsumerStatefulWidget {
  const LegalAcceptanceScreen({super.key});

  @override
  ConsumerState<LegalAcceptanceScreen> createState() => _LegalAcceptanceScreenState();
}

class _LegalAcceptanceScreenState extends ConsumerState<LegalAcceptanceScreen> {
  bool _agreed = false;
  bool _submitting = false;
  bool _signingOut = false;
  String? _errorText;

  Future<void> _continue() async {
    setState(() {
      _submitting = true;
      _errorText = null;
    });
    try {
      await ref.read(authControllerProvider.notifier).acceptLegal();
      // On success the router's redirect moves us on; nothing to do here.
    } on LegalVersionChanged {
      if (!mounted) return;
      setState(() {
        _agreed = false;
        _errorText = 'The terms were updated a moment ago. Please review the current version and tick the box again.';
      });
    } on AppFailure catch (f) {
      if (!mounted) return;
      setState(() => _errorText = f.message);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Future<void> _signOut() async {
    setState(() => _signingOut = true);
    await ref.read(authControllerProvider.notifier).signOut();
  }

  @override
  Widget build(BuildContext context) {
    final busy = _submitting || _signingOut;
    final version = ref.watch(authControllerProvider.select((s) => s.pendingLegalVersion));

    return PopScope(
      canPop: false,
      child: Scaffold(
        body: SafeArea(
          child: ListView(
            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.xxl, vertical: AppSpacing.xxxl),
            children: [
              Container(
                width: 52,
                height: 52,
                decoration: BoxDecoration(color: AppColors.slate900, borderRadius: BorderRadius.circular(14)),
                alignment: Alignment.center,
                child: const Icon(Icons.description_outlined, color: AppColors.white, size: 26),
              ),
              const SizedBox(height: AppSpacing.xl),
              Text('Before you continue', style: Theme.of(context).textTheme.headlineSmall),
              const SizedBox(height: AppSpacing.sm),
              const Text(
                'Our Terms of Service and Privacy Policy have been published or updated. '
                'Please read them and confirm below to keep using Real Vista.',
                style: TextStyle(color: AppColors.slate500, fontSize: 14, height: 1.4),
              ),
              if (version != null) ...[
                const SizedBox(height: AppSpacing.xs),
                Text('Version $version', style: const TextStyle(color: AppColors.slate400, fontSize: 12)),
              ],
              const SizedBox(height: AppSpacing.lg),
              AppCard(
                padding: EdgeInsets.zero,
                child: Column(
                  children: [
                    _DocumentRow(doc: LegalDocument.terms, onTap: () => openLegalDocument(context, ref, LegalDocument.terms)),
                    const Divider(height: 1),
                    _DocumentRow(
                        doc: LegalDocument.privacy, onTap: () => openLegalDocument(context, ref, LegalDocument.privacy)),
                  ],
                ),
              ),
              const SizedBox(height: AppSpacing.lg),
              CheckboxListTile(
                value: _agreed,
                onChanged: busy ? null : (v) => setState(() => _agreed = v ?? false),
                controlAffinity: ListTileControlAffinity.leading,
                contentPadding: EdgeInsets.zero,
                title: const Text(
                  'I agree to the Terms of Service and have read the Privacy Policy',
                  style: TextStyle(fontSize: 14),
                ),
              ),
              if (_errorText != null) ...[
                const SizedBox(height: AppSpacing.sm),
                DecoratedBox(
                  decoration: BoxDecoration(color: AppColors.rose50, borderRadius: BorderRadius.circular(10)),
                  child: Padding(
                    padding: const EdgeInsets.all(AppSpacing.md),
                    child: Row(
                      children: [
                        const Icon(Icons.error_outline_rounded, size: 18, color: AppColors.rose600),
                        const SizedBox(width: AppSpacing.sm),
                        Expanded(
                            child: Text(_errorText!, style: const TextStyle(color: AppColors.rose700, fontSize: 13))),
                      ],
                    ),
                  ),
                ),
              ],
              const SizedBox(height: AppSpacing.xl),
              AppButton(
                label: 'Continue',
                onPressed: _agreed && !busy ? _continue : null,
                loading: _submitting,
                variant: AppButtonVariant.brand,
                size: AppButtonSize.lg,
                expand: true,
              ),
              const SizedBox(height: AppSpacing.sm),
              AppButton(
                label: 'Sign out',
                onPressed: busy ? null : _signOut,
                loading: _signingOut,
                variant: AppButtonVariant.ghost,
                size: AppButtonSize.lg,
                expand: true,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _DocumentRow extends StatelessWidget {
  const _DocumentRow({required this.doc, required this.onTap});

  final LegalDocument doc;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => ListTile(
        title: Text(doc.title, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
        subtitle: const Text('Opens in your browser', style: TextStyle(color: AppColors.slate400, fontSize: 12)),
        trailing: const Icon(Icons.open_in_new_rounded, size: 18, color: AppColors.slate400),
        onTap: onTap,
      );
}
