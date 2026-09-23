import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/errors/app_failure.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../shared/widgets/widgets.dart';
import '../../auth/auth_providers.dart';
import '../../leads/domain/lead.dart';
import '../../leads/leads_providers.dart';
import '../../properties/domain/listing.dart';
import '../../properties/domain/listing_filters.dart';
import '../../properties/properties_providers.dart';
import '../domain/transaction.dart';
import '../transactions_providers.dart';

class TransactionFormScreen extends ConsumerStatefulWidget {
  const TransactionFormScreen({super.key, this.existing});
  final CrmTransaction? existing;

  @override
  ConsumerState<TransactionFormScreen> createState() => _TransactionFormScreenState();
}

class _TransactionFormScreenState extends ConsumerState<TransactionFormScreen> {
  String? _propertyId;
  late String _propertyName = widget.existing?.propertyName ?? '';
  String? _clientId;
  late String _clientName = widget.existing?.clientName ?? '';
  late final _amountController = TextEditingController(text: widget.existing?.amount.toString());
  late final _commissionPercentController = TextEditingController(text: widget.existing?.commissionPercent.toString());
  late String _type = widget.existing?.type ?? 'sale';
  late String _status = widget.existing?.status ?? 'pending';

  bool _submitting = false;
  String? _error;

  bool get _isEditing => widget.existing != null;

  @override
  void initState() {
    super.initState();
    _propertyId = widget.existing?.propertyId;
    _clientId = widget.existing?.clientId;
  }

  @override
  void dispose() {
    _amountController.dispose();
    _commissionPercentController.dispose();
    super.dispose();
  }

  Future<void> _pickProperty() async {
    final listings = await ref.read(propertiesApiProvider).list(
          isEmployee: ref.read(authControllerProvider).user?.isEmployee ?? false,
          filters: const ListingFilters(),
          startIndex: 0,
          limit: 50,
        );
    if (!mounted) return;
    final picked = await _showPickerSheet<Listing>(
      title: 'Select property',
      items: listings.listings,
      labelBuilder: (l) => l.name,
    );
    if (picked != null) {
      setState(() {
        _propertyId = picked.id;
        _propertyName = picked.name;
      });
    }
  }

  Future<void> _pickClient() async {
    final leads = await ref.read(leadsApiProvider).list();
    if (!mounted) return;
    final picked = await _showPickerSheet<Lead>(title: 'Select client', items: leads, labelBuilder: (l) => l.name);
    if (picked != null) {
      setState(() {
        _clientId = picked.id;
        _clientName = picked.name;
      });
    }
  }

  Future<T?> _showPickerSheet<T>({required String title, required List<T> items, required String Function(T) labelBuilder}) {
    return showModalBottomSheet<T>(
      context: context,
      isScrollControlled: true,
      builder: (context) => DraggableScrollableSheet(
        initialChildSize: 0.6,
        maxChildSize: 0.9,
        expand: false,
        builder: (context, scrollController) => SafeArea(
          child: Column(
            children: [
              Padding(padding: const EdgeInsets.all(AppSpacing.lg), child: Text(title, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16))),
              Expanded(
                child: items.isEmpty
                    ? const Center(child: Text('Nothing to pick from yet', style: TextStyle(color: AppColors.slate400)))
                    : ListView.builder(
                        controller: scrollController,
                        itemCount: items.length,
                        itemBuilder: (context, index) => ListTile(title: Text(labelBuilder(items[index])), onTap: () => Navigator.of(context).pop(items[index])),
                      ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _submit() async {
    if (_propertyName.trim().isEmpty || _clientName.trim().isEmpty || _amountController.text.trim().isEmpty) {
      setState(() => _error = 'Property, client, and amount are required.');
      return;
    }
    setState(() {
      _submitting = true;
      _error = null;
    });

    final payload = {
      if (_propertyId != null) 'property': _propertyId,
      'propertyName': _propertyName,
      if (_clientId != null) 'client': _clientId,
      'clientName': _clientName,
      'type': _type,
      'amount': num.tryParse(_amountController.text.trim()) ?? 0,
      'commissionPercent': num.tryParse(_commissionPercentController.text.trim()) ?? 0,
      'status': _status,
    };

    try {
      final api = ref.read(transactionsApiProvider);
      if (_isEditing) {
        await api.update(widget.existing!.id, payload);
      } else {
        await api.create(payload);
      }
      ref.invalidate(transactionsControllerProvider);
      ref.invalidate(transactionStatsProvider);
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
      appBar: AppBar(title: Text(_isEditing ? 'Edit Transaction' : 'New Transaction')),
      body: ListView(
        padding: const EdgeInsets.all(AppSpacing.lg),
        children: [
          _PickerField(label: 'Property', value: _propertyName, onTap: _pickProperty),
          const SizedBox(height: AppSpacing.lg),
          _PickerField(label: 'Client', value: _clientName, onTap: _pickClient),
          const SizedBox(height: AppSpacing.lg),
          Row(
            children: [
              Expanded(child: AppTextField(label: 'Amount (₹)', controller: _amountController, keyboardType: TextInputType.number)),
              const SizedBox(width: AppSpacing.md),
              Expanded(child: AppTextField(label: 'Commission %', controller: _commissionPercentController, keyboardType: TextInputType.number)),
            ],
          ),
          const SizedBox(height: AppSpacing.lg),
          Row(
            children: [
              Expanded(child: AppDropdownField(label: 'Type', value: _type, items: {for (final t in transactionTypes) t: t[0].toUpperCase() + t.substring(1)}, onChanged: (v) => setState(() => _type = v))),
              const SizedBox(width: AppSpacing.md),
              Expanded(child: AppDropdownField(label: 'Status', value: _status, items: {for (final s in transactionStatuses) s: transactionStatusLabel(s)}, onChanged: (v) => setState(() => _status = v))),
            ],
          ),
          if (_error != null) ...[
            const SizedBox(height: AppSpacing.md),
            Text(_error!, style: const TextStyle(color: AppColors.rose600, fontSize: 13)),
          ],
          const SizedBox(height: AppSpacing.xl),
          AppButton(label: _isEditing ? 'Save changes' : 'Create transaction', onPressed: _submitting ? null : _submit, loading: _submitting, variant: AppButtonVariant.brand, expand: true),
        ],
      ),
    );
  }
}

class _PickerField extends StatelessWidget {
  const _PickerField({required this.label, required this.value, required this.onTap});
  final String label;
  final String value;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
        const SizedBox(height: 6),
        Material(
          color: AppColors.white,
          borderRadius: BorderRadius.circular(8),
          child: InkWell(
            borderRadius: BorderRadius.circular(8),
            onTap: onTap,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg, vertical: AppSpacing.md),
              decoration: BoxDecoration(borderRadius: BorderRadius.circular(8), border: Border.all(color: AppColors.slate200)),
              child: Row(
                children: [
                  Expanded(child: Text(value.isEmpty ? 'Tap to select' : value, style: TextStyle(color: value.isEmpty ? AppColors.slate400 : AppColors.slate900))),
                  const Icon(Icons.chevron_right_rounded, color: AppColors.slate300),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }
}
