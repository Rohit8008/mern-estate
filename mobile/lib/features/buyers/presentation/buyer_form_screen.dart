import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/errors/app_failure.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
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

  bool _submitting = false;
  String? _error;

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
    if (name.isEmpty) {
      setState(() => _error = 'Buyer name is required.');
      return;
    }
    setState(() {
      _submitting = true;
      _error = null;
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
    return Scaffold(
      appBar: AppBar(title: Text(_isEditing ? 'Edit Buyer Requirement' : 'New Buyer Requirement')),
      body: ListView(
        padding: const EdgeInsets.all(AppSpacing.lg),
        children: [
          AppTextField(label: 'Buyer name *', controller: _nameController),
          const SizedBox(height: AppSpacing.lg),
          Row(
            children: [
              Expanded(child: AppTextField(label: 'Phone', controller: _phoneController, keyboardType: TextInputType.phone)),
              const SizedBox(width: AppSpacing.md),
              Expanded(child: AppTextField(label: 'Email', controller: _emailController, keyboardType: TextInputType.emailAddress)),
            ],
          ),
          const SizedBox(height: AppSpacing.lg),
          AppTextField(label: 'Preferred location', controller: _locationController),
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
              Expanded(child: AppTextField(label: 'Min price (₹)', controller: _minPriceController, keyboardType: TextInputType.number)),
              const SizedBox(width: AppSpacing.md),
              Expanded(child: AppTextField(label: 'Max price (₹)', controller: _maxPriceController, keyboardType: TextInputType.number)),
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
          AppTextField(label: 'Additional requirements', controller: _requirementsController),
          if (_error != null) ...[
            const SizedBox(height: AppSpacing.md),
            Text(_error!, style: const TextStyle(color: AppColors.rose600, fontSize: 13)),
          ],
          const SizedBox(height: AppSpacing.xl),
          AppButton(label: _isEditing ? 'Save changes' : 'Create buyer requirement', onPressed: _submitting ? null : _submit, loading: _submitting, variant: AppButtonVariant.brand, expand: true),
        ],
      ),
    );
  }
}
