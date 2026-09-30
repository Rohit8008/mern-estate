import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/errors/app_failure.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/utils/validators.dart';
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

  late final _snapshot = TextSnapshot(
      [_nameController, _emailController, _phoneController, _companyController, _cityController, _notesController]);

  bool _submitting = false;
  String? _error;
  String? _nameError;
  String? _emailError;

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
    // Field problems show on the field; _error is for the server.
    final nameError = name.isEmpty ? 'Name is required.' : null;
    final emailErr = emailError(_emailController.text);
    if (nameError != null || emailErr != null) {
      setState(() {
        _nameError = nameError;
        _emailError = emailErr;
        _error = null;
      });
      return;
    }
    setState(() {
      _submitting = true;
      _error = null;
      _nameError = null;
      _emailError = null;
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
    return DiscardGuard(
      isDirty: () => _snapshot.changed,
      listenable: _snapshot.listenable,
      child: Scaffold(
        appBar: AppBar(title: Text(_isEditing ? 'Edit Owner' : 'New Owner')),
        body: AutofillGroup(
          child: ListView(
            padding: const EdgeInsets.all(AppSpacing.lg),
            children: [
              AppTextField(
                label: 'Name *',
                controller: _nameController,
                errorText: _nameError,
                textCapitalization: TextCapitalization.words,
                textInputAction: TextInputAction.next,
                autofillHints: const [AutofillHints.name],
                onChanged: (_) {
                  if (_nameError != null) setState(() => _nameError = null);
                },
              ),
              const SizedBox(height: AppSpacing.lg),
              AppTextField(
                label: 'Phone',
                controller: _phoneController,
                keyboardType: TextInputType.phone,
                textInputAction: TextInputAction.next,
                autofillHints: const [AutofillHints.telephoneNumber],
              ),
              const SizedBox(height: AppSpacing.lg),
              AppTextField(
                label: 'Email',
                controller: _emailController,
                errorText: _emailError,
                keyboardType: TextInputType.emailAddress,
                textInputAction: TextInputAction.next,
                autofillHints: const [AutofillHints.email],
                onChanged: (_) {
                  if (_emailError != null) setState(() => _emailError = null);
                },
              ),
              const SizedBox(height: AppSpacing.lg),
              AppTextField(
                label: 'Company',
                controller: _companyController,
                textCapitalization: TextCapitalization.words,
                textInputAction: TextInputAction.next,
                autofillHints: const [AutofillHints.organizationName],
              ),
              const SizedBox(height: AppSpacing.lg),
              AppTextField(
                label: 'City',
                controller: _cityController,
                textCapitalization: TextCapitalization.words,
                textInputAction: TextInputAction.next,
                autofillHints: const [AutofillHints.addressCity],
              ),
              const SizedBox(height: AppSpacing.lg),
              AppTextField(
                label: 'Notes',
                controller: _notesController,
                textCapitalization: TextCapitalization.sentences,
                maxLines: 4,
                minLines: 2,
              ),
              if (_error != null) ...[
                const SizedBox(height: AppSpacing.md),
                FormErrorBox(_error!),
              ],
              const SizedBox(height: AppSpacing.xl),
              AppButton(
                  label: _isEditing ? 'Save changes' : 'Create owner',
                  onPressed: _submitting ? null : _submit,
                  loading: _submitting,
                  variant: AppButtonVariant.brand,
                  expand: true),
            ],
          ),
        ),
      ),
    );
  }
}
