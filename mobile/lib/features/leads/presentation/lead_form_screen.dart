import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/errors/app_failure.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/utils/validators.dart';
import '../../../shared/widgets/widgets.dart';
import '../domain/lead.dart';
import '../leads_providers.dart';

/// Full-screen create/edit — the desktop's ContactFormModal crams in
/// budget/preferredLocations/detailed-requirements fields too; v1 mobile
/// keeps the quick-add surface to core contact fields (an agent adding a
/// lead in the field wants this done in seconds, not filling a long form).
class LeadFormScreen extends ConsumerStatefulWidget {
  const LeadFormScreen({super.key, this.existing});

  final Lead? existing;

  @override
  ConsumerState<LeadFormScreen> createState() => _LeadFormScreenState();
}

class _LeadFormScreenState extends ConsumerState<LeadFormScreen> {
  late final _nameController = TextEditingController(text: widget.existing?.name);
  late final _emailController = TextEditingController(text: widget.existing?.email);
  late final _phoneController = TextEditingController(text: widget.existing?.phone);
  late final _alternatePhoneController = TextEditingController(text: widget.existing?.alternatePhone);
  late final _organizationController = TextEditingController(text: widget.existing?.organization);
  late final _sourceController = TextEditingController(text: widget.existing?.source);
  late final _notesController = TextEditingController(text: widget.existing?.notes);

  late String _status = widget.existing?.status ?? 'lead';
  late String _priority = widget.existing?.priority ?? 'medium';
  late String _contactType = widget.existing?.contactType ?? 'lead';

  late final _snapshot = TextSnapshot([
    _nameController,
    _emailController,
    _phoneController,
    _alternatePhoneController,
    _organizationController,
    _sourceController,
    _notesController,
  ]);

  bool _submitting = false;
  String? _errorText;
  String? _nameError;
  String? _emailError;

  bool get _dirty =>
      _snapshot.changed ||
      _status != (widget.existing?.status ?? 'lead') ||
      _priority != (widget.existing?.priority ?? 'medium') ||
      _contactType != (widget.existing?.contactType ?? 'lead');

  bool get _isEditing => widget.existing != null;

  @override
  void dispose() {
    _nameController.dispose();
    _emailController.dispose();
    _phoneController.dispose();
    _alternatePhoneController.dispose();
    _organizationController.dispose();
    _sourceController.dispose();
    _notesController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final name = _nameController.text.trim();
    // Field problems show on the field; the box below is for the server.
    final nameError = name.isEmpty ? 'Name is required.' : null;
    final emailErr = emailError(_emailController.text);
    if (nameError != null || emailErr != null) {
      setState(() {
        _nameError = nameError;
        _emailError = emailErr;
        _errorText = null;
      });
      return;
    }

    setState(() {
      _submitting = true;
      _errorText = null;
      _nameError = null;
      _emailError = null;
    });

    final payload = {
      'name': name,
      'email': _emailController.text.trim(),
      'phone': _phoneController.text.trim(),
      'alternatePhone': _alternatePhoneController.text.trim(),
      'organization': _organizationController.text.trim(),
      'source': _sourceController.text.trim(),
      'notes': _notesController.text.trim(),
      'status': _status,
      'priority': _priority,
      'contactType': _contactType,
    };

    try {
      final api = ref.read(leadsApiProvider);
      final saved = _isEditing ? await api.update(widget.existing!.id, payload) : await api.create(payload);
      ref.invalidate(leadsListControllerProvider);
      if (_isEditing) ref.invalidate(leadDetailProvider(widget.existing!.id));
      if (mounted) Navigator.of(context).pop(saved);
    } on AppFailure catch (f) {
      if (mounted) setState(() => _errorText = f.message);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return DiscardGuard(
      isDirty: () => _dirty,
      listenable: _snapshot.listenable,
      child: Scaffold(
        appBar: AppBar(title: Text(_isEditing ? 'Edit Lead' : 'New Lead')),
        body: SafeArea(
          child: AutofillGroup(
            child: ListView(
              padding: const EdgeInsets.all(AppSpacing.lg),
              children: [
                AppTextField(
                  label: 'Name *',
                  hint: 'Full name',
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
                // Full-width rows: side by side, a phone number or email
                // truncated at half a phone's width.
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
                  label: 'Alternate phone',
                  controller: _alternatePhoneController,
                  keyboardType: TextInputType.phone,
                  textInputAction: TextInputAction.next,
                ),
                const SizedBox(height: AppSpacing.lg),
                AppTextField(
                  label: 'Organization',
                  controller: _organizationController,
                  textCapitalization: TextCapitalization.words,
                  textInputAction: TextInputAction.next,
                  autofillHints: const [AutofillHints.organizationName],
                ),
                const SizedBox(height: AppSpacing.lg),
                AppDropdownField(
                  label: 'Contact type',
                  value: _contactType,
                  items: {for (final t in leadContactTypes) t: leadContactTypeLabel(t)},
                  onChanged: (v) => setState(() => _contactType = v),
                ),
                const SizedBox(height: AppSpacing.lg),
                Row(
                  children: [
                    Expanded(
                      child: AppDropdownField(
                        label: 'Status',
                        value: _status,
                        items: {for (final s in leadStatusOrder) s: leadStatusStyle(s).label},
                        onChanged: (v) => setState(() => _status = v),
                      ),
                    ),
                    const SizedBox(width: AppSpacing.md),
                    Expanded(
                      child: AppDropdownField(
                        label: 'Priority',
                        value: _priority,
                        items: {for (final p in leadPriorities) p: p[0].toUpperCase() + p.substring(1)},
                        onChanged: (v) => setState(() => _priority = v),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: AppSpacing.lg),
                AppTextField(
                  label: 'Source',
                  hint: 'e.g. Website, Referral',
                  controller: _sourceController,
                  textCapitalization: TextCapitalization.sentences,
                  textInputAction: TextInputAction.next,
                ),
                const SizedBox(height: AppSpacing.lg),
                AppTextField(
                  label: 'Notes',
                  controller: _notesController,
                  textCapitalization: TextCapitalization.sentences,
                  maxLines: 4,
                  minLines: 2,
                ),
                if (_errorText != null) ...[
                  const SizedBox(height: AppSpacing.md),
                  FormErrorBox(_errorText!),
                ],
                const SizedBox(height: AppSpacing.xl),
                AppButton(
                  label: _isEditing ? 'Save changes' : 'Create lead',
                  onPressed: _submitting ? null : _submit,
                  loading: _submitting,
                  variant: AppButtonVariant.brand,
                  expand: true,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
