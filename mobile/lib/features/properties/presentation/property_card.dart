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

  Widget _placeholder() => const ColoredBox(
        color: AppColors.slate100,
        child: Icon(Icons.apartment_rounded, color: AppColors.slate300, size: 32),
      );

  @override
  Widget build(BuildContext context) {
    final location = [listing.city, listing.locality].where((s) => s != null && s.isNotEmpty).join(' · ');
    final rent = listing.type == 'rent' && listing.displayPrice > 1;

    return AppCard(
      onTap: onTap,
      padding: EdgeInsets.zero,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          ClipRRect(
            borderRadius: const BorderRadius.vertical(top: Radius.circular(AppRadius.lg)),
            child: AspectRatio(
              aspectRatio: 16 / 10,
              child: Stack(
                fit: StackFit.expand,
                children: [
                  listing.coverImage != null
                      ? CachedNetworkImage(
                          imageUrl: listing.coverImage!,
                          fit: BoxFit.cover,
                          placeholder: (context, url) => const ColoredBox(color: AppColors.slate100),
                          errorWidget: (context, url, error) => _placeholder(),
                        )
                      : _placeholder(),
                  // On the photo, so the name below gets the full width.
                  Positioned(
                    left: 8,
                    top: 8,
                    right: 8,
                    child: Align(
                      alignment: Alignment.topLeft,
                      child: AppBadge(label: listingStatusLabel(listing.status), variant: listingStatusVariant(listing.status)),
                    ),
                  ),
                ],
              ),
            ),
          ),
          // Laid out for a half-width grid cell: every line has the width to
          // itself. Price, beds and baths shared one row before and a long
          // price ran off the edge of the card.
          Padding(
            padding: const EdgeInsets.all(AppSpacing.md),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                FittedBox(
                  fit: BoxFit.scaleDown,
                  alignment: Alignment.centerLeft,
                  child: Text(
                    '${Fmt.price(listing.displayPrice, compact: true)}${rent ? ' / mo' : ''}',
                    maxLines: 1,
                    style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15, color: AppColors.moneyInk(context)),
                  ),
                ),
                const SizedBox(height: 2),
                Text(listing.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5)),
                if (location.isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Text(location, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: AppColors.slate500, fontSize: 12)),
                ],
                if (listing.bedrooms > 0 || listing.bathrooms > 0) ...[
                  const SizedBox(height: 4),
                  Row(
                    children: [
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
              ],
            ),
          ),
        ],
      ),
    );
  }
}
