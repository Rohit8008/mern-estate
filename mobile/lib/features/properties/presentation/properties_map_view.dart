import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

import '../../../core/utils/format.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../shared/widgets/widgets.dart';
import '../domain/listing.dart';


/// Same OpenStreetMap tile source the web CRM's Leaflet map already uses —
/// no separate Maps API key needed. Markers come from `location.lat/lng`.
class PropertiesMapView extends StatefulWidget {
  const PropertiesMapView({super.key, required this.listings, required this.onOpenListing});

  final List<Listing> listings;
  final ValueChanged<Listing> onOpenListing;

  @override
  State<PropertiesMapView> createState() => _PropertiesMapViewState();
}

class _PropertiesMapViewState extends State<PropertiesMapView> {
  Listing? _selected;

  @override
  Widget build(BuildContext context) {
    final withLocation = widget.listings.where((l) => l.lat != null && l.lng != null).toList();

    if (withLocation.isEmpty) {
      return const AppEmptyState(icon: Icons.map_outlined, title: 'No mapped properties', message: 'None of the current results have a location set.');
    }

    final center = LatLng(withLocation.first.lat!, withLocation.first.lng!);

    return Stack(
      children: [
        FlutterMap(
          options: MapOptions(initialCenter: center, initialZoom: 12, onTap: (_, __) => setState(() => _selected = null)),
          children: [
            TileLayer(
              urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
              userAgentPackageName: 'com.realvista.crm',
            ),
            MarkerLayer(
              markers: [
                for (final listing in withLocation)
                  Marker(
                    point: LatLng(listing.lat!, listing.lng!),
                    width: 40,
                    height: 40,
                    child: GestureDetector(
                      onTap: () => setState(() => _selected = listing),
                      child: Icon(Icons.location_on_rounded, color: _selected?.id == listing.id ? AppColors.rose600 : AppColors.indigo600, size: 36),
                    ),
                  ),
              ],
            ),
            // The OpenStreetMap licence (ODbL) requires this credit on the map.
            const SimpleAttributionWidget(source: Text('OpenStreetMap contributors')),
          ],
        ),
        if (_selected != null)
          Positioned(
            left: AppSpacing.lg,
            right: AppSpacing.lg,
            bottom: AppSpacing.lg,
            child: AppCard(
              onTap: () => widget.onOpenListing(_selected!),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(_selected!.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5)),
                        const SizedBox(height: 2),
                        Text(Fmt.price(_selected!.displayPrice, compact: true), style: TextStyle(color: AppColors.moneyInk(context), fontWeight: FontWeight.w700, fontSize: 13)),
                      ],
                    ),
                  ),
                  const Icon(Icons.chevron_right_rounded, color: AppColors.slate300),
                ],
              ),
            ),
          ),
      ],
    );
  }
}
