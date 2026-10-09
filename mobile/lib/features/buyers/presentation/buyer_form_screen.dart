import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/errors/app_failure.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/utils/validators.dart';
import '../../../shared/widgets/widgets.dart';
import '../buyers_providers.dart';
import '../domain/buyer_requirement.dart';

class BuyerFormScreen extends ConsumerStatefulWidget {
  const BuyerFormScreen({super.key, this.existing});
  final BuyerRequirement? existing;

  @override
  ConsumerState<BuyerFormScreen> createState() => _BuyerFormScreenState();
}

class _BuyerFormScreenState extends ConsumerState<BuyerFormScreen> {
  late final _nameController = TextEditingController(text: widget.existing?.buyerName);
  late final _emailController = TextEditingController(text: widget.existing?.buyerEmail);
  late final _phoneController = TextEditingController(text: widget.existing?.buyerPhone);
  late final _locationController = TextEditingController(text: widget.existing?.preferredLocation);
  late final _minPriceController = TextEditingController(text: widget.existing?.minPrice?.toString());
  late final _maxPriceController = TextEditingController(text: widget.existing?.maxPrice?.toString());
  late final _requirementsController = TextEditingController(text: widget.existing?.additionalRequirements);

  late String _propertyType = widget.existing?.propertyType ?? 'sale';
  late String _propertyTypeInterest = widget.existing?.propertyTypeInterest ?? 'any';
  late String _status = widget.existing?.status ?? 'active';
  late String _priority = widget.existing?.priority ?? 'medium';

  late final _snapshot = TextSnapshot([
    _nameController,
    _emailController,
    _phoneController,
    _locationController,
    _minPriceController,
    _maxPriceController,
    _requirementsController,
  ]);

  bool _submitting = false;
  String? _error;
  String? _nameError;
  String? _emailError;
  String? _priceError;

  // Quiet until a real max sits below a real min (mirrors the web form).
  String? _priceRangeError() {
    final min = num.tryParse(_minPriceController.text.trim()) ?? 0;
    final max = num.tryParse(_maxPriceController.text.trim()) ?? 0;
    return (min > 0 && max > 0 && max < min) ? 'Must be above the minimum' : null;
  }

  bool get _dirty =>
      _snapshot.changed ||
      _propertyType != (widget.existing?.propertyType ?? 'sale') ||
      _propertyTypeInterest != (widget.existing?.propertyTypeInterest ?? 'any') ||
      _status != (widget.existing?.status ?? 'active') ||
      _priority != (widget.existing?.priority ?? 'medium');

  bool get _isEditing => widget.existing != null;

  @override
  void dispose() {
    _nameController.dispose();
    _emailController.dispose();
    _phoneController.dispose();
    _locationController.dispose();
    _minPriceController.dispose();
    _maxPriceController.dispose();
    _requirementsController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final name = _nameController.text.trim();
    // Field problems show on the field; _error is for the server.
    final nameError = name.isEmpty ? 'Buyer name is required.' : null;
    final emailErr = emailError(_emailController.text);
    final priceErr = _priceRangeError();
    if (nameError != null || emailErr != null || priceErr != null) {
      setState(() {
        _nameError = nameError;
        _emailError = emailErr;
        _priceError = priceErr;
        _error = null;
      });
      return;
    }
    setState(() {
      _submitting = true;
      _error = null;
      _nameError = null;
      _emailError = null;
      _priceError = null;
    });

    final payload = {
      'buyerName': name,
      'buyerEmail': _emailController.text.trim(),
      'buyerPhone': _phoneController.text.trim(),
      'preferredLocation': _locationController.text.trim(),
      'propertyType': _propertyType,
      'propertyTypeInterest': _propertyTypeInterest,
      'minPrice': num.tryParse(_minPriceController.text.trim()) ?? 0,
      'maxPrice': num.tryParse(_maxPriceController.text.trim()) ?? 0,
      'additionalRequirements': _requirementsController.text.trim(),
      'status': _status,
      'priority': _priority,
    };

    try {
      final api = ref.read(buyersApiProvider);
      if (_isEditing) {
        await api.update(widget.existing!.id, payload);
      } else {
        await api.create(payload);
      }
      ref.invalidate(buyersControllerProvider);
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
      isDirty: () => _dirty,
      listenable: _snapshot.listenable,
      child: Scaffold(
      appBar: AppBar(title: Text(_isEditing ? 'Edit Buyer Requirement' : 'New Buyer Requirement')),
      body: ListView(
        padding: const EdgeInsets.all(AppSpacing.lg),
        children: [
          AppTextField(
            label: 'Buyer name *',
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
            label: 'Preferred location',
            controller: _locationController,
            textCapitalization: TextCapitalization.words,
            textInputAction: TextInputAction.next,
          ),
          const SizedBox(height: AppSpacing.lg),
          Row(
            children: [
              Expanded(child: AppDropdownField(label: 'Looking to', value: _propertyType, items: {for (final t in buyerRequirementTransactionTypes) t: t[0].toUpperCase() + t.substring(1)}, onChanged: (v) => setState(() => _propertyType = v))),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: AppDropdownField(
                  label: 'Property type',
                  value: _propertyTypeInterest,
                  items: {for (final i in buyerRequirementInterests) i: i[0].toUpperCase() + i.substring(1)},
                  onChanged: (v) => setState(() => _propertyTypeInterest = v),
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.lg),
          Row(
            children: [
              Expanded(child: AppTextField(label: 'Min price (₹)', controller: _minPriceController, keyboardType: TextInputType.number, onChanged: (_) { if (_priceError != null) setState(() => _priceError = null); })),
              const SizedBox(width: AppSpacing.md),
              Expanded(child: AppTextField(label: 'Max price (₹)', controller: _maxPriceController, keyboardType: TextInputType.number, errorText: _priceError, onChanged: (_) { if (_priceError != null) setState(() => _priceError = null); })),
            ],
          ),
          const SizedBox(height: AppSpacing.lg),
          Row(
            children: [
              Expanded(child: AppDropdownField(label: 'Status', value: _status, items: {for (final s in buyerRequirementStatuses) s: buyerStatusLabel(s)}, onChanged: (v) => setState(() => _status = v))),
              const SizedBox(width: AppSpacing.md),
              Expanded(child: AppDropdownField(label: 'Priority', value: _priority, items: const {'low': 'Low', 'medium': 'Medium', 'high': 'High'}, onChanged: (v) => setState(() => _priority = v))),
            ],
          ),
          const SizedBox(height: AppSpacing.lg),
          AppTextField(
            label: 'Additional requirements',
            controller: _requirementsController,
            textCapitalization: TextCapitalization.sentences,
            maxLines: 4,
            minLines: 2,
          ),
          if (_error != null) ...[
            const SizedBox(height: AppSpacing.md),
            FormErrorBox(_error!),
          ],
          const SizedBox(height: AppSpacing.xl),
          AppButton(label: _isEditing ? 'Save changes' : 'Create buyer requirement', onPressed: _submitting ? null : _submit, loading: _submitting, variant: AppButtonVariant.brand, expand: true),
        ],
      ),
      ),
    );
  }
}
