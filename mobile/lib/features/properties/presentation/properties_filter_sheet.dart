import 'package:flutter/material.dart';

import '../../../core/theme/app_spacing.dart';
import '../../../shared/widgets/widgets.dart';
import '../domain/listing.dart';
import '../domain/listing_filters.dart';

/// Mobile-friendly filter sheet, not the desktop's full filter modal —
/// covers the same query params PropertiesBoard.jsx sends, condensed onto
/// one scrollable sheet per the brief's "mobile-friendly filter sheets
/// rather than large desktop filter panels" guidance.
Future<ListingFilters?> showPropertiesFilterSheet(BuildContext context, ListingFilters current) {
  return showModalBottomSheet<ListingFilters>(
    context: context,
    isScrollControlled: true,
    builder: (context) => _FilterSheet(initial: current),
  );
}

class _FilterSheet extends StatefulWidget {
  const _FilterSheet({required this.initial});
  final ListingFilters initial;

  @override
  State<_FilterSheet> createState() => _FilterSheetState();
}

class _FilterSheetState extends State<_FilterSheet> {
  late String? _type = widget.initial.type;
  late String? _propertyCategory = widget.initial.propertyCategory;
  late String? _status = widget.initial.status;
  late final _cityController = TextEditingController(text: widget.initial.city);
  late final _minPriceController = TextEditingController(text: widget.initial.minPrice?.toString());
  late final _maxPriceController = TextEditingController(text: widget.initial.maxPrice?.toString());
  late int? _minBedrooms = widget.initial.minBedrooms;
  late int? _minBathrooms = widget.initial.minBathrooms;

  @override
  void dispose() {
    _cityController.dispose();
    _minPriceController.dispose();
    _maxPriceController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      initialChildSize: 0.85,
      maxChildSize: 0.95,
      expand: false,
      builder: (context, scrollController) {
        return SafeArea(
          child: ListView(
            controller: scrollController,
            padding: const EdgeInsets.all(AppSpacing.lg),
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text('Filters', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 18)),
                  TextButton(onPressed: _clear, child: const Text('Clear all')),
                ],
              ),
              const SizedBox(height: AppSpacing.lg),
              _sectionLabel('Listing type'),
              _chipRow(listingTypes, _type, (v) => setState(() => _type = _type == v ? null : v)),
              const SizedBox(height: AppSpacing.lg),
              _sectionLabel('Category'),
              _chipRow(propertyCategories, _propertyCategory, (v) => setState(() => _propertyCategory = _propertyCategory == v ? null : v),
                  labelBuilder: (v) => v[0].toUpperCase() + v.substring(1)),
              const SizedBox(height: AppSpacing.lg),
              _sectionLabel('Status'),
              _chipRow(listingStatusOrder, _status, (v) => setState(() => _status = _status == v ? null : v), labelBuilder: listingStatusLabel),
              const SizedBox(height: AppSpacing.lg),
              AppTextField(label: 'City', controller: _cityController),
              const SizedBox(height: AppSpacing.lg),
              Row(
                children: [
                  Expanded(child: AppTextField(label: 'Min price (₹)', controller: _minPriceController, keyboardType: TextInputType.number)),
                  const SizedBox(width: AppSpacing.md),
                  Expanded(child: AppTextField(label: 'Max price (₹)', controller: _maxPriceController, keyboardType: TextInputType.number)),
                ],
              ),
              const SizedBox(height: AppSpacing.lg),
              _sectionLabel('Min bedrooms'),
              _numberChipRow([1, 2, 3, 4], _minBedrooms, (v) => setState(() => _minBedrooms = _minBedrooms == v ? null : v)),
              const SizedBox(height: AppSpacing.lg),
              _sectionLabel('Min bathrooms'),
              _numberChipRow([1, 2, 3, 4], _minBathrooms, (v) => setState(() => _minBathrooms = _minBathrooms == v ? null : v)),
              const SizedBox(height: AppSpacing.xxl),
              AppButton(label: 'Apply filters', variant: AppButtonVariant.brand, expand: true, onPressed: _apply),
            ],
          ),
        );
      },
    );
  }

  Widget _sectionLabel(String text) => Padding(
        padding: const EdgeInsets.only(bottom: AppSpacing.sm),
        child: Text(text, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
      );

  Widget _chipRow(List<String> values, String? selected, ValueChanged<String> onTap, {String Function(String)? labelBuilder}) {
    return Wrap(
      spacing: AppSpacing.sm,
      runSpacing: AppSpacing.sm,
      children: [
        for (final v in values)
          ChoiceChip(
            label: Text(labelBuilder?.call(v) ?? (v[0].toUpperCase() + v.substring(1))),
            selected: selected == v,
            onSelected: (_) => onTap(v),
          ),
      ],
    );
  }

  Widget _numberChipRow(List<int> values, int? selected, ValueChanged<int> onTap) {
    return Wrap(
      spacing: AppSpacing.sm,
      children: [
        for (final v in values) ChoiceChip(label: Text('$v+'), selected: selected == v, onSelected: (_) => onTap(v)),
      ],
    );
  }

  void _clear() {
    setState(() {
      _type = null;
      _propertyCategory = null;
      _status = null;
      _cityController.clear();
      _minPriceController.clear();
      _maxPriceController.clear();
      _minBedrooms = null;
      _minBathrooms = null;
    });
  }

  void _apply() {
    Navigator.of(context).pop(ListingFilters(
      type: _type,
      propertyCategory: _propertyCategory,
      status: _status,
      city: _cityController.text.trim().isEmpty ? null : _cityController.text.trim(),
      minPrice: num.tryParse(_minPriceController.text.trim()),
      maxPrice: num.tryParse(_maxPriceController.text.trim()),
      minBedrooms: _minBedrooms,
      minBathrooms: _minBathrooms,
      searchTerm: widget.initial.searchTerm,
    ));
  }
}
