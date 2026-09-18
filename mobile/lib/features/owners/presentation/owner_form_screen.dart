import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/errors/app_failure.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../shared/widgets/widgets.dart';
import '../domain/owner.dart';
import '../owners_providers.dart';

class OwnerFormScreen extends ConsumerStatefulWidget {
  const OwnerFormScreen({super.key, this.existing});
  final PropertyOwner? existing;

  @override
  ConsumerState<OwnerFormScreen> createState() => _OwnerFormScreenState();
}

class _OwnerFormScreenState extends ConsumerState<OwnerFormScreen> {
  late final _nameController = TextEditingController(text: widget.existing?.name);
  late final _emailController = TextEditingController(text: widget.existing?.email);
  late final _phoneController = TextEditingController(text: widget.existing?.phone);
  late final _companyController = TextEditingController(text: widget.existing?.companyName);
  late final _cityController = TextEditingController(text: widget.existing?.city);
  late final _notesController = TextEditingController(text: widget.existing?.notes);

  bool _submitting = false;
  String? _error;

  bool get _isEditing => widget.existing != null;

  @override
  void dispose() {
    _nameController.dispose();
    _emailController.dispose();
    _phoneController.dispose();
    _companyController.dispose();
    _cityController.dispose();
    _notesController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final name = _nameController.text.trim();
    if (name.isEmpty) {
      setState(() => _error = 'Name is required.');
      return;
    }
    setState(() {
      _submitting = true;
      _error = null;
    });

    final payload = {
      'name': name,
      'email': _emailController.text.trim(),
      'phone': _phoneController.text.trim(),
      'companyName': _companyController.text.trim(),
      'city': _cityController.text.trim(),
      'notes': _notesController.text.trim(),
    };

    try {
      final api = ref.read(ownersApiProvider);
      if (_isEditing) {
        await api.update(widget.existing!.id, payload);
      } else {
        await api.create(payload);
      }
      ref.invalidate(ownersControllerProvider);
      if (mounted) Navigator.of(context).pop();
    } on AppFailure catch (f) {
      if (mounted) setState(() => _error = f.message);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(_isEditing ? 'Edit Owner' : 'New Owner')),
      body: ListView(
        padding: const EdgeInsets.all(AppSpacing.lg),
        children: [
          AppTextField(label: 'Name *', controller: _nameController),
          const SizedBox(height: AppSpacing.lg),
          Row(
            children: [
              Expanded(child: AppTextField(label: 'Phone', controller: _phoneController, keyboardType: TextInputType.phone)),
              const SizedBox(width: AppSpacing.md),
              Expanded(child: AppTextField(label: 'Email', controller: _emailController, keyboardType: TextInputType.emailAddress)),
            ],
          ),
          const SizedBox(height: AppSpacing.lg),
          AppTextField(label: 'Company', controller: _companyController),
          const SizedBox(height: AppSpacing.lg),
          AppTextField(label: 'City', controller: _cityController),
          const SizedBox(height: AppSpacing.lg),
          AppTextField(label: 'Notes', controller: _notesController),
          if (_error != null) ...[
            const SizedBox(height: AppSpacing.md),
            Text(_error!, style: const TextStyle(color: AppColors.rose600, fontSize: 13)),
          ],
          const SizedBox(height: AppSpacing.xl),
          AppButton(label: _isEditing ? 'Save changes' : 'Create owner', onPressed: _submitting ? null : _submit, loading: _submitting, variant: AppButtonVariant.brand, expand: true),
        ],
      ),
    );
  }
}
