import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../shared/widgets/widgets.dart';
import '../../../owners/owners_providers.dart';
import '../../domain/listing_draft.dart';

final _priceFmt = NumberFormat.currency(locale: 'en_IN', symbol: '₹', decimalDigits: 0);

class ReviewStep extends ConsumerWidget {
  const ReviewStep({super.key, required this.draft});
  final ListingDraft draft;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ownersAsync = ref.watch(ownersControllerProvider);
    final ownerNames = ownersAsync.valueOrNull?.where((o) => draft.ownerIds.contains(o.id)).map((o) => o.name).join(', ') ?? '';

    return ListView(
      padding: const EdgeInsets.all(AppSpacing.lg),
      children: [
        if (draft.imageUrls.isNotEmpty)
          SizedBox(
            height: 100,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: draft.imageUrls.length,
              separatorBuilder: (_, __) => const SizedBox(width: AppSpacing.sm),
              itemBuilder: (context, i) => ClipRRect(
                borderRadius: BorderRadius.circular(AppRadius.md),
                child: CachedNetworkImage(imageUrl: draft.imageUrls[i], width: 100, height: 100, fit: BoxFit.cover),
              ),
            ),
          ),
        const SizedBox(height: AppSpacing.lg),
        AppCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(draft.name.isEmpty ? 'Untitled property' : draft.name, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
              const SizedBox(height: 4),
              Text(draft.address.isEmpty ? 'No address set' : draft.address, style: const TextStyle(color: AppColors.slate500, fontSize: 13)),
              const SizedBox(height: AppSpacing.md),
              Text(
                '${_priceFmt.format(draft.regularPrice)}${draft.type == 'rent' ? ' / month' : ''}',
                style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 18, color: AppColors.indigo700),
              ),
              if (draft.offer && draft.discountPrice > 0) Text('Offer price: ${_priceFmt.format(draft.discountPrice)}', style: const TextStyle(color: AppColors.emerald600, fontSize: 12.5)),
            ],
          ),
        ),
        const SizedBox(height: AppSpacing.lg),
        AppCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _row('Type', draft.type[0].toUpperCase() + draft.type.substring(1)),
              _row('Category', listingCategoryLabel(draft.propertyCategory)),
              if (draft.propertyCategory == 'residential') _row('Bedrooms / Bathrooms', '${draft.bedrooms} / ${draft.bathrooms}'),
              _row('Furnished', draft.furnished ? 'Yes' : 'No'),
              _row('Parking', draft.parking ? 'Yes' : 'No'),
              if (draft.areaSqFt != null) _row('Area', '${draft.areaSqFt} sq.ft'),
              if (ownerNames.isNotEmpty) _row('Owners', ownerNames),
              if (draft.lat == null) _row('Location pin', 'Not set'),
            ],
          ),
        ),
        const SizedBox(height: AppSpacing.lg),
        const Text('Review the details above, then submit — you can edit everything later.', style: TextStyle(color: AppColors.slate400, fontSize: 12)),
      ],
    );
  }

  Widget _row(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(
        children: [
          SizedBox(width: 150, child: Text(label, style: const TextStyle(color: AppColors.slate500, fontSize: 12.5))),
          Expanded(child: Text(value, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500))),
        ],
      ),
    );
  }
}
