import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../shared/widgets/widgets.dart';
import '../../domain/listing_draft.dart';

class PricingStep extends StatefulWidget {
  const PricingStep({super.key, required this.draft});
  final ListingDraft draft;

  @override
  State<PricingStep> createState() => _PricingStepState();
}

class _PricingStepState extends State<PricingStep> {
  late final _priceController = TextEditingController(text: widget.draft.regularPrice > 0 ? widget.draft.regularPrice.toString() : '');
  late final _discountController = TextEditingController(text: widget.draft.discountPrice > 0 ? widget.draft.discountPrice.toString() : '');
  late final _areaController = TextEditingController(text: widget.draft.areaSqFt?.toString());
  late final _plotSizeController = TextEditingController(text: widget.draft.plotSize);
  late final _propertyNoController = TextEditingController(text: widget.draft.propertyNo);
  late final _remarksController = TextEditingController(text: widget.draft.remarks);

  @override
  void dispose() {
    _priceController.dispose();
    _discountController.dispose();
    _areaController.dispose();
    _plotSizeController.dispose();
    _propertyNoController.dispose();
    _remarksController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final draft = widget.draft;

    return ListView(
      padding: const EdgeInsets.all(AppSpacing.lg),
      children: [
        AppTextField(
          key: const Key('listing-price-field'),
          label: 'Regular price (₹) *',
          controller: _priceController,
          keyboardType: TextInputType.number,
          onChanged: (v) => draft.update(() => draft.regularPrice = num.tryParse(v) ?? 0),
        ),
        const SizedBox(height: AppSpacing.lg),
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            const Text('Special offer', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.slate700)),
            Switch(value: draft.offer, onChanged: (v) => draft.update(() => draft.offer = v)),
          ],
        ),
        if (draft.offer) ...[
          const SizedBox(height: AppSpacing.md),
          AppTextField(
            label: 'Discount price (₹)',
            controller: _discountController,
            keyboardType: TextInputType.number,
            onChanged: (v) => draft.update(() => draft.discountPrice = num.tryParse(v) ?? 0),
          ),
        ],
        const SizedBox(height: AppSpacing.xl),
        Row(
          children: [
            Expanded(
              child: AppTextField(
                label: 'Area (sq.ft)',
                controller: _areaController,
                keyboardType: TextInputType.number,
                onChanged: (v) => draft.update(() => draft.areaSqFt = num.tryParse(v)),
              ),
            ),
            const SizedBox(width: AppSpacing.md),
            Expanded(child: AppTextField(label: 'Plot size', controller: _plotSizeController, onChanged: (v) => draft.update(() => draft.plotSize = v))),
          ],
        ),
        const SizedBox(height: AppSpacing.lg),
        AppTextField(label: 'Property number', controller: _propertyNoController, onChanged: (v) => draft.update(() => draft.propertyNo = v)),
        const SizedBox(height: AppSpacing.lg),
        AppTextField(label: 'Remarks', controller: _remarksController, maxLines: 3, onChanged: (v) => draft.update(() => draft.remarks = v)),
      ],
    );
  }
}
