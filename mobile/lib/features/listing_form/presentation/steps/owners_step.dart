import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/errors/app_failure.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../shared/widgets/widgets.dart';
import '../../../owners/owners_providers.dart';
import '../../domain/listing_draft.dart';

class OwnersStep extends ConsumerStatefulWidget {
  const OwnersStep({super.key, required this.draft});
  final ListingDraft draft;

  @override
  ConsumerState<OwnersStep> createState() => _OwnersStepState();
}

class _OwnersStepState extends ConsumerState<OwnersStep> {
  bool _showCreateForm = false;
  final _nameController = TextEditingController();
  final _phoneController = TextEditingController();
  final _emailController = TextEditingController();
  final _companyController = TextEditingController();
  bool _creating = false;
  String? _error;

  @override
  void dispose() {
    _nameController.dispose();
    _phoneController.dispose();
    _emailController.dispose();
    _companyController.dispose();
    super.dispose();
  }

  Future<void> _createOwner() async {
    final name = _nameController.text.trim();
    if (name.isEmpty) {
      setState(() => _error = 'Name is required.');
      return;
    }
    setState(() {
      _creating = true;
      _error = null;
    });
    try {
      final owner = await ref.read(ownersApiProvider).create({
        'name': name,
        'phone': _phoneController.text.trim(),
        'email': _emailController.text.trim(),
        'companyName': _companyController.text.trim(),
      });
      ref.invalidate(ownersControllerProvider);
      widget.draft.update(() => widget.draft.ownerIds = [...widget.draft.ownerIds, owner.id]);
      if (mounted) {
        setState(() {
          _showCreateForm = false;
          _nameController.clear();
          _phoneController.clear();
          _emailController.clear();
          _companyController.clear();
        });
      }
    } on AppFailure catch (f) {
      setState(() => _error = f.message);
    } finally {
      if (mounted) setState(() => _creating = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final ownersAsync = ref.watch(ownersControllerProvider);
    final draft = widget.draft;

    return ListView(
      padding: const EdgeInsets.all(AppSpacing.lg),
      children: [
        const Text('Property owners', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
        const SizedBox(height: 4),
        const Text('Optional — link one or more owners of record to this listing.', style: TextStyle(color: AppColors.slate500, fontSize: 12.5)),
        const SizedBox(height: AppSpacing.lg),
        AppTextField(hint: 'Search owners…', prefixIcon: Icons.search_rounded, onChanged: (v) => ref.read(ownersSearchProvider.notifier).state = v),
        const SizedBox(height: AppSpacing.md),
        ownersAsync.when(
          loading: () => const Padding(padding: EdgeInsets.symmetric(vertical: AppSpacing.lg), child: Center(child: CircularProgressIndicator(strokeWidth: 2))),
          error: (_, __) => const Text('Unable to load owners', style: TextStyle(color: AppColors.rose600, fontSize: 13)),
          data: (owners) => Column(
            children: [
              for (final owner in owners)
                CheckboxListTile(
                  dense: true,
                  value: draft.ownerIds.contains(owner.id),
                  title: Text(owner.name, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13.5)),
                  subtitle: owner.companyName != null && owner.companyName!.isNotEmpty ? Text(owner.companyName!, style: const TextStyle(fontSize: 12)) : null,
                  controlAffinity: ListTileControlAffinity.leading,
                  onChanged: (checked) => draft.update(() {
                    if (checked == true) {
                      draft.ownerIds = [...draft.ownerIds, owner.id];
                    } else {
                      draft.ownerIds = draft.ownerIds.where((id) => id != owner.id).toList();
                    }
                  }),
                ),
            ],
          ),
        ),
        const SizedBox(height: AppSpacing.lg),
        if (!_showCreateForm)
          AppButton(label: 'Add new owner', icon: Icons.person_add_alt_1_rounded, variant: AppButtonVariant.secondary, expand: true, onPressed: () => setState(() => _showCreateForm = true))
        else
          AppCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text('New owner', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5)),
                    IconButton(icon: const Icon(Icons.close_rounded, size: 18), onPressed: () => setState(() => _showCreateForm = false)),
                  ],
                ),
                const SizedBox(height: AppSpacing.sm),
                AppTextField(label: 'Name *', controller: _nameController),
                const SizedBox(height: AppSpacing.md),
                AppTextField(label: 'Phone', controller: _phoneController, keyboardType: TextInputType.phone),
                const SizedBox(height: AppSpacing.md),
                AppTextField(label: 'Email', controller: _emailController, keyboardType: TextInputType.emailAddress),
                const SizedBox(height: AppSpacing.md),
                AppTextField(label: 'Company', controller: _companyController),
                if (_error != null) ...[
                  const SizedBox(height: AppSpacing.sm),
                  Text(_error!, style: const TextStyle(color: AppColors.rose600, fontSize: 12.5)),
                ],
                const SizedBox(height: AppSpacing.md),
                AppButton(label: 'Save owner', onPressed: _creating ? null : _createOwner, loading: _creating, variant: AppButtonVariant.brand, expand: true),
              ],
            ),
          ),
      ],
    );
  }
}
