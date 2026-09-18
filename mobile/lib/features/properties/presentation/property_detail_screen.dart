import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:latlong2/latlong.dart';
import 'package:share_plus/share_plus.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/errors/app_failure.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/utils/contact_launcher.dart';
import '../../../shared/widgets/widgets.dart';
import '../../auth/auth_providers.dart';
import '../../documents/presentation/documents_panel.dart';
import '../../listing_form/presentation/listing_form_screen.dart';
import '../domain/field_definition.dart';
import '../domain/listing.dart';
import '../properties_providers.dart';
import 'property_card.dart' show listingStatusVariant;

final _priceFmt = NumberFormat.currency(locale: 'en_IN', symbol: '₹', decimalDigits: 0);

class PropertyDetailScreen extends ConsumerWidget {
  const PropertyDetailScreen({super.key, required this.listingId});

  final String listingId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final listingAsync = ref.watch(listingDetailProvider(listingId));
    final user = ref.watch(authControllerProvider).user;
    final canManage = user?.isAdmin ?? false;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Property'),
        actions: [
          if (listingAsync.valueOrNull != null)
            IconButton(icon: const Icon(Icons.share_outlined), onPressed: () => _share(listingAsync.value!)),
          if (canManage && listingAsync.valueOrNull != null) ...[
            IconButton(icon: const Icon(Icons.edit_outlined), onPressed: () => _edit(context, listingAsync.value!)),
            IconButton(icon: const Icon(Icons.delete_outline_rounded), onPressed: () => _delete(context, ref, listingAsync.value!)),
          ],
        ],
      ),
      body: listingAsync.when(
        loading: () => const AppPageLoader(),
        error: (error, _) => AppErrorState(
          title: 'Unable to load this property',
          message: 'Check your internet connection and try again.',
          onRetry: () => ref.invalidate(listingDetailProvider(listingId)),
        ),
        data: (listing) => _DetailBody(listing: listing),
      ),
    );
  }

  Future<void> _share(Listing listing) async {
    final buffer = StringBuffer('${listing.name}\n${_priceFmt.format(listing.displayPrice)}');
    if (listing.lat != null && listing.lng != null) {
      buffer.write('\nhttps://www.google.com/maps?q=${listing.lat},${listing.lng}');
    }
    await Share.share(buffer.toString());
  }

  void _edit(BuildContext context, Listing listing) {
    Navigator.of(context).push(MaterialPageRoute(builder: (_) => ListingFormScreen(existing: listing)));
  }

  Future<void> _delete(BuildContext context, WidgetRef ref, Listing listing) async {
    final confirmed = await showConfirmDialog(context, title: 'Delete this property?', message: 'This action cannot be undone.');
    if (!confirmed) return;
    try {
      await ref.read(propertiesApiProvider).delete(listing.id);
      ref.invalidate(listingsControllerProvider);
      if (context.mounted) Navigator.of(context).pop();
    } on AppFailure catch (f) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(f.message)));
    }
  }
}

class _DetailBody extends ConsumerWidget {
  const _DetailBody({required this.listing});
  final Listing listing;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final categoriesAsync = ref.watch(categoriesProvider);
    final propertyTypesAsync = ref.watch(propertyTypesProvider);

    final location = [listing.address, listing.locality, listing.city].where((s) => s != null && s.isNotEmpty).join(', ');

    return ListView(
      padding: const EdgeInsets.only(bottom: AppSpacing.xxxl),
      children: [
        if (listing.imageUrls.isNotEmpty) _Gallery(imageUrls: listing.imageUrls) else _NoImagePlaceholder(),
        Padding(
          padding: const EdgeInsets.all(AppSpacing.lg),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Expanded(child: Text(listing.name, style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w800))),
                  AppBadge(label: listingStatusLabel(listing.status), variant: listingStatusVariant(listing.status)),
                ],
              ),
              if (location.isNotEmpty) ...[
                const SizedBox(height: 4),
                Row(
                  children: [
                    const Icon(Icons.location_on_outlined, size: 15, color: AppColors.slate400),
                    const SizedBox(width: 4),
                    Expanded(child: Text(location, style: const TextStyle(color: AppColors.slate500, fontSize: 13))),
                  ],
                ),
              ],
              const SizedBox(height: AppSpacing.md),
              Text(
                '${_priceFmt.format(listing.displayPrice)}${listing.type == 'rent' ? ' / month' : ''}',
                style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w800, color: AppColors.indigo700),
              ),
              if (listing.offer && listing.discountPrice > 0 && listing.discountPrice < listing.regularPrice) ...[
                const SizedBox(height: 2),
                Text(
                  _priceFmt.format(listing.regularPrice),
                  style: const TextStyle(fontSize: 13, color: AppColors.slate400, decoration: TextDecoration.lineThrough),
                ),
              ],
              const SizedBox(height: AppSpacing.lg),
              _QuickInfoRow(listing: listing),
              if (listing.description != null && listing.description!.isNotEmpty) ...[
                const SizedBox(height: AppSpacing.xl),
                AppCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('Description', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
                      const SizedBox(height: AppSpacing.sm),
                      Text(listing.description!, style: const TextStyle(fontSize: 13.5, height: 1.5)),
                    ],
                  ),
                ),
              ],
              categoriesAsync.when(
                loading: () => const SizedBox.shrink(),
                error: (_, __) => const SizedBox.shrink(),
                data: (categories) => propertyTypesAsync.when(
                  loading: () => const SizedBox.shrink(),
                  error: (_, __) => const SizedBox.shrink(),
                  data: (propertyTypes) => _DynamicFieldsSection(listing: listing, categories: categories, propertyTypes: propertyTypes),
                ),
              ),
              if (listing.owners.isNotEmpty) ...[
                const SizedBox(height: AppSpacing.xl),
                const Text('Owners', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
                const SizedBox(height: AppSpacing.sm),
                for (final owner in listing.owners) _OwnerTile(owner: owner),
              ],
              if (listing.lat != null && listing.lng != null) ...[
                const SizedBox(height: AppSpacing.xl),
                const Text('Location', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
                const SizedBox(height: AppSpacing.sm),
                _LocationMap(lat: listing.lat!, lng: listing.lng!),
                const SizedBox(height: AppSpacing.sm),
                AppButton(
                  label: 'Open in Maps',
                  icon: Icons.directions_outlined,
                  variant: AppButtonVariant.secondary,
                  expand: true,
                  onPressed: () => launchUrl(Uri.parse('https://www.google.com/maps?q=${listing.lat},${listing.lng}'), mode: LaunchMode.externalApplication),
                ),
              ],
              if (listing.remarks != null && listing.remarks!.isNotEmpty) ...[
                const SizedBox(height: AppSpacing.xl),
                AppCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('Remarks', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
                      const SizedBox(height: AppSpacing.sm),
                      Text(listing.remarks!, style: const TextStyle(fontSize: 13.5)),
                    ],
                  ),
                ),
              ],
              const SizedBox(height: AppSpacing.xl),
              DocumentsPanel(kind: 'listing', refId: listing.id),
            ],
          ),
        ),
      ],
    );
  }
}

class _Gallery extends StatefulWidget {
  const _Gallery({required this.imageUrls});
  final List<String> imageUrls;

  @override
  State<_Gallery> createState() => _GalleryState();
}

class _GalleryState extends State<_Gallery> {
  int _index = 0;

  @override
  Widget build(BuildContext context) {
    return Stack(
      alignment: Alignment.bottomCenter,
      children: [
        SizedBox(
          height: 260,
          child: PageView.builder(
            itemCount: widget.imageUrls.length,
            onPageChanged: (i) => setState(() => _index = i),
            itemBuilder: (context, i) => CachedNetworkImage(
              imageUrl: widget.imageUrls[i],
              fit: BoxFit.cover,
              width: double.infinity,
              placeholder: (context, url) => const ColoredBox(color: AppColors.slate100),
              errorWidget: (context, url, error) => const ColoredBox(color: AppColors.slate100, child: Icon(Icons.broken_image_outlined, color: AppColors.slate300)),
            ),
          ),
        ),
        if (widget.imageUrls.length > 1)
          Padding(
            padding: const EdgeInsets.only(bottom: AppSpacing.sm),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                for (var i = 0; i < widget.imageUrls.length; i++)
                  Container(
                    margin: const EdgeInsets.symmetric(horizontal: 2),
                    width: i == _index ? 16 : 6,
                    height: 6,
                    decoration: BoxDecoration(
                      color: i == _index ? AppColors.white : AppColors.white.withOpacity(0.5),
                      borderRadius: BorderRadius.circular(3),
                    ),
                  ),
              ],
            ),
          ),
      ],
    );
  }
}

class _NoImagePlaceholder extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(height: 200, color: AppColors.slate100, child: const Icon(Icons.apartment_rounded, size: 48, color: AppColors.slate300));
  }
}

class _QuickInfoRow extends StatelessWidget {
  const _QuickInfoRow({required this.listing});
  final Listing listing;

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: AppSpacing.lg,
      runSpacing: AppSpacing.sm,
      children: [
        if (listing.bedrooms > 0) _stat(Icons.bed_outlined, '${listing.bedrooms} Beds'),
        if (listing.bathrooms > 0) _stat(Icons.bathtub_outlined, '${listing.bathrooms} Baths'),
        if (listing.areaSqFt != null) _stat(Icons.square_foot_outlined, '${listing.areaSqFt} sq.ft'),
        _stat(listing.furnished ? Icons.chair_outlined : Icons.chair_alt_outlined, listing.furnished ? 'Furnished' : 'Unfurnished'),
        if (listing.parking) _stat(Icons.local_parking_outlined, 'Parking'),
      ],
    );
  }

  Widget _stat(IconData icon, String label) => Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 16, color: AppColors.slate500),
          const SizedBox(width: 5),
          Text(label, style: const TextStyle(fontSize: 12.5, color: AppColors.slate600, fontWeight: FontWeight.w500)),
        ],
      );
}

/// Resolves `attributes` (Category-keyed) and `propertyTypeFields`
/// (PropertyType-keyed) generically against fetched field definitions —
/// same approach Listing.jsx uses, never a hardcoded field list.
class _DynamicFieldsSection extends StatelessWidget {
  const _DynamicFieldsSection({required this.listing, required this.categories, required this.propertyTypes});

  final Listing listing;
  final List<PropertyCategory> categories;
  final List<PropertyTypeDef> propertyTypes;

  @override
  Widget build(BuildContext context) {
    final entries = <MapEntry<String, String>>[];

    if (listing.propertyTypeFields.isNotEmpty) {
      final def = propertyTypes.where((t) => t.slug == listing.propertyType).firstOrNull;
      for (final e in listing.propertyTypeFields.entries) {
        final fieldDef = def?.fields.where((f) => f.key == e.key).firstOrNull;
        final label = fieldDef?.label ?? humanizeFieldKey(e.key);
        final unit = fieldDef?.unit;
        final value = formatFieldValue(e.value);
        entries.add(MapEntry(label, unit != null && unit.isNotEmpty ? '$value $unit' : value));
      }
    }

    if (listing.attributes.isNotEmpty) {
      final def = categories.where((c) => c.slug == listing.category).firstOrNull;
      for (final e in listing.attributes.entries) {
        final fieldDef = def?.fields.where((f) => f.key == e.key).firstOrNull;
        final label = fieldDef?.label ?? humanizeFieldKey(e.key);
        final unit = fieldDef?.unit;
        final value = formatFieldValue(e.value);
        entries.add(MapEntry(label, unit != null && unit.isNotEmpty ? '$value $unit' : value));
      }
    }

    if (entries.isEmpty) return const SizedBox.shrink();

    return Padding(
      padding: const EdgeInsets.only(top: AppSpacing.xl),
      child: AppCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Details', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
            const SizedBox(height: AppSpacing.md),
            for (final entry in entries)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 5),
                child: Row(
                  children: [
                    Expanded(child: Text(entry.key, style: const TextStyle(color: AppColors.slate500, fontSize: 12.5))),
                    Text(entry.value, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500)),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }
}

extension _FirstOrNull<T> on Iterable<T> {
  T? get firstOrNull => isEmpty ? null : first;
}

class _OwnerTile extends StatelessWidget {
  const _OwnerTile({required this.owner});
  final OwnerCard owner;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.sm),
      child: AppCard(
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(owner.name, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5)),
                  if (owner.companyName != null && owner.companyName!.isNotEmpty)
                    Text(owner.companyName!, style: const TextStyle(color: AppColors.slate500, fontSize: 12)),
                ],
              ),
            ),
            if (owner.phone != null) IconButton(icon: const Icon(Icons.call_outlined, size: 18), onPressed: () => ContactLauncher.call(owner.phone!)),
            if (owner.email != null) IconButton(icon: const Icon(Icons.mail_outline_rounded, size: 18), onPressed: () => ContactLauncher.email(owner.email!)),
          ],
        ),
      ),
    );
  }
}

class _LocationMap extends StatelessWidget {
  const _LocationMap({required this.lat, required this.lng});
  final double lat;
  final double lng;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(AppRadius.lg),
      child: SizedBox(
        height: 160,
        child: IgnorePointer(
          child: FlutterMap(
            options: MapOptions(initialCenter: LatLng(lat, lng), initialZoom: 14),
            children: [
              TileLayer(urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', userAgentPackageName: 'com.realvista.crm'),
              MarkerLayer(markers: [Marker(point: LatLng(lat, lng), width: 36, height: 36, child: const Icon(Icons.location_on_rounded, color: AppColors.rose600, size: 32))]),
            ],
          ),
        ),
      ),
    );
  }
}
