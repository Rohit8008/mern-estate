import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../shared/widgets/widgets.dart';
import '../../../properties/properties_providers.dart';
import '../../domain/listing_draft.dart';
import '../widgets/dynamic_field_input.dart';

class BasicsStep extends ConsumerStatefulWidget {
  const BasicsStep({super.key, required this.draft});
  final ListingDraft draft;

  @override
  ConsumerState<BasicsStep> createState() => _BasicsStepState();
}

class _BasicsStepState extends ConsumerState<BasicsStep> {
  late final _nameController = TextEditingController(text: widget.draft.name);
  late final _descriptionController = TextEditingController(text: widget.draft.description);

  @override
  void dispose() {
    _nameController.dispose();
    _descriptionController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final draft = widget.draft;
    final propertyTypesAsync = ref.watch(propertyTypesProvider);

    return ListView(
      padding: const EdgeInsets.all(AppSpacing.lg),
      children: [
        AppTextField(key: const Key('listing-name-field'), label: 'Property name *', controller: _nameController, onChanged: (v) => draft.update(() => draft.name = v)),
        const SizedBox(height: AppSpacing.lg),
        AppTextField(label: 'Description', controller: _descriptionController, maxLines: 3, onChanged: (v) => draft.update(() => draft.description = v)),
        const SizedBox(height: AppSpacing.lg),
        Row(
          children: [
            Expanded(
              child: AppDropdownField(
                label: 'Listing type',
                value: draft.type,
                items: {for (final t in listingFormTypes) t: t[0].toUpperCase() + t.substring(1)},
                onChanged: (v) => draft.update(() => draft.type = v),
              ),
            ),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: AppDropdownField(
                label: 'Category',
                value: draft.propertyCategory,
                items: {for (final c in listingFormCategories) c: listingCategoryLabel(c)},
                onChanged: (v) => draft.update(() => draft.propertyCategory = v),
              ),
            ),
          ],
        ),
        const SizedBox(height: AppSpacing.lg),
        propertyTypesAsync.when(
          loading: () => const SizedBox.shrink(),
          error: (_, __) => const SizedBox.shrink(),
          data: (propertyTypes) {
            if (propertyTypes.isEmpty) return const SizedBox.shrink();
            final selected = propertyTypes.where((t) => t.slug == draft.propertyType).firstOrNull;
            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                AppDropdownField<String>(
                  label: 'Property type',
                  value: selected?.slug ?? '',
                  items: {'': 'None', for (final t in propertyTypes) t.slug: t.name},
                  onChanged: (v) => draft.update(() {
                    draft.propertyType = v.isEmpty ? null : v;
                    draft.propertyTypeFields = {};
                  }),
                ),
                if (selected != null && selected.fields.isNotEmpty) ...[
                  const SizedBox(height: AppSpacing.lg),
                  for (final field in [...selected.fields]..sort((a, b) => a.order.compareTo(b.order))) ...[
                    DynamicFieldInput(
                      field: field,
                      value: draft.propertyTypeFields[field.key],
                      onChanged: (v) => draft.update(() => draft.propertyTypeFields[field.key] = v),
                    ),
                    const SizedBox(height: AppSpacing.lg),
                  ],
                ],
              ],
            );
          },
        ),
        if (draft.propertyCategory == 'residential') ...[
          Row(
            children: [
              Expanded(
                child: _Stepper(label: 'Bedrooms *', value: draft.bedrooms, onChanged: (v) => draft.update(() => draft.bedrooms = v)),
              ),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: _Stepper(label: 'Bathrooms *', value: draft.bathrooms, onChanged: (v) => draft.update(() => draft.bathrooms = v)),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.lg),
        ],
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            const Text('Furnished', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.slate700)),
            Switch(value: draft.furnished, onChanged: (v) => draft.update(() => draft.furnished = v)),
          ],
        ),
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            const Text('Parking available', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.slate700)),
            Switch(value: draft.parking, onChanged: (v) => draft.update(() => draft.parking = v)),
          ],
        ),
      ],
    );
  }
}

class _Stepper extends StatelessWidget {
  const _Stepper({required this.label, required this.value, required this.onChanged});
  final String label;
  final int value;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.slate700)),
        const SizedBox(height: 6),
        Container(
          decoration: BoxDecoration(border: Border.all(color: AppColors.slate200), borderRadius: BorderRadius.circular(8)),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              IconButton(icon: const Icon(Icons.remove_rounded, size: 18), onPressed: value > 0 ? () => onChanged(value - 1) : null),
              Text('$value', style: const TextStyle(fontWeight: FontWeight.w700)),
              IconButton(icon: const Icon(Icons.add_rounded, size: 18), onPressed: () => onChanged(value + 1)),
            ],
          ),
        ),
      ],
    );
  }
}

extension _FirstOrNull<T> on Iterable<T> {
  T? get firstOrNull => isEmpty ? null : first;
}
