import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../../../core/utils/format.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../shared/widgets/widgets.dart';
import '../domain/listing.dart';


AppBadgeVariant listingStatusVariant(String status) => switch (status) {
      'available' => AppBadgeVariant.success,
      'sold' => AppBadgeVariant.info,
      'rented' => AppBadgeVariant.purple,
      _ => AppBadgeVariant.warning, // under_negotiation
    };

class PropertyCard extends StatelessWidget {
  const PropertyCard({super.key, required this.listing, required this.onTap});

  final Listing listing;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final location = [listing.city, listing.locality].where((s) => s != null && s.isNotEmpty).join(' · ');

    return AppCard(
      onTap: onTap,
      padding: EdgeInsets.zero,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ClipRRect(
            borderRadius: const BorderRadius.vertical(top: Radius.circular(AppRadius.lg)),
            child: AspectRatio(
              aspectRatio: 16 / 10,
              child: listing.coverImage != null
                  ? CachedNetworkImage(
                      imageUrl: listing.coverImage!,
                      fit: BoxFit.cover,
                      placeholder: (context, url) => const ColoredBox(color: AppColors.slate100),
                      errorWidget: (context, url, error) => const ColoredBox(
                        color: AppColors.slate100,
                        child: Icon(Icons.apartment_rounded, color: AppColors.slate300, size: 32),
                      ),
                    )
                  : const ColoredBox(
                      color: AppColors.slate100,
                      child: Icon(Icons.apartment_rounded, color: AppColors.slate300, size: 32),
                    ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(AppSpacing.md),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Expanded(
                      child: Text(listing.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
                    ),
                    AppBadge(label: listingStatusLabel(listing.status), variant: listingStatusVariant(listing.status)),
                  ],
                ),
                if (location.isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Text(location, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: AppColors.slate500, fontSize: 12.5)),
                ],
                const SizedBox(height: 6),
                Row(
                  children: [
                    Text(
                      '${Fmt.price(listing.displayPrice)}${listing.type == 'rent' && listing.displayPrice > 1 ? ' / mo' : ''}',
                      style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15, color: AppColors.moneyInk(context)),
                    ),
                    const Spacer(),
                    if (listing.bedrooms > 0) ...[
                      const Icon(Icons.bed_outlined, size: 14, color: AppColors.slate400),
                      const SizedBox(width: 3),
                      Text('${listing.bedrooms}', style: const TextStyle(color: AppColors.slate500, fontSize: 12)),
                      const SizedBox(width: AppSpacing.sm),
                    ],
                    if (listing.bathrooms > 0) ...[
                      const Icon(Icons.bathtub_outlined, size: 14, color: AppColors.slate400),
                      const SizedBox(width: 3),
                      Text('${listing.bathrooms}', style: const TextStyle(color: AppColors.slate500, fontSize: 12)),
                    ],
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
