import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:latlong2/latlong.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../shared/widgets/widgets.dart';
import '../../domain/geocode_result.dart';
import '../../domain/listing_draft.dart';
import '../../listing_form_providers.dart';

const _defaultCenter = LatLng(20.5937, 78.9629); // India, sensible default with nothing picked yet

class LocationStep extends ConsumerStatefulWidget {
  const LocationStep({super.key, required this.draft});
  final ListingDraft draft;

  @override
  ConsumerState<LocationStep> createState() => _LocationStepState();
}

class _LocationStepState extends ConsumerState<LocationStep> {
  late final _addressController = TextEditingController(text: widget.draft.address);
  late final _cityController = TextEditingController(text: widget.draft.city);
  late final _localityController = TextEditingController(text: widget.draft.locality);
  final _searchController = TextEditingController();
  final _mapController = MapController();
  Timer? _debounce;
  List<GeocodeResult> _results = [];
  bool _searching = false;

  @override
  void dispose() {
    _debounce?.cancel();
    _addressController.dispose();
    _cityController.dispose();
    _localityController.dispose();
    _searchController.dispose();
    super.dispose();
  }

  void _onSearchChanged(String value) {
    _debounce?.cancel();
    if (value.trim().length < 3) {
      setState(() => _results = []);
      return;
    }
    _debounce = Timer(const Duration(milliseconds: 400), () async {
      setState(() => _searching = true);
      try {
        final results = await ref.read(listingFormApiProvider).geocodeSearch(value.trim());
        if (mounted) setState(() => _results = results);
      } finally {
        if (mounted) setState(() => _searching = false);
      }
    });
  }

  void _applyResult(GeocodeResult result) {
    final draft = widget.draft;
    draft.update(() {
      draft.address = result.address ?? result.displayName ?? draft.address;
      draft.city = result.city ?? draft.city;
      draft.locality = result.locality ?? draft.locality;
      draft.lat = result.lat;
      draft.lng = result.lng;
    });
    _addressController.text = draft.address;
    _cityController.text = draft.city;
    _localityController.text = draft.locality;
    setState(() {
      _results = [];
      _searchController.clear();
    });
    _mapController.move(LatLng(result.lat, result.lng), 15);
  }

  Future<void> _onMapTap(LatLng point) async {
    widget.draft.update(() {
      widget.draft.lat = point.latitude;
      widget.draft.lng = point.longitude;
    });
    try {
      final result = await ref.read(listingFormApiProvider).geocodeReverse(point.latitude, point.longitude);
      if (result != null && mounted) {
        widget.draft.update(() {
          widget.draft.address = result.address ?? widget.draft.address;
          widget.draft.city = result.city ?? widget.draft.city;
          widget.draft.locality = result.locality ?? widget.draft.locality;
        });
        _addressController.text = widget.draft.address;
        _cityController.text = widget.draft.city;
        _localityController.text = widget.draft.locality;
      }
    } catch (_) {
      // Reverse geocode is a convenience — the pin itself is already set.
    }
  }

  @override
  Widget build(BuildContext context) {
    final draft = widget.draft;
    final center = (draft.lat != null && draft.lng != null) ? LatLng(draft.lat!, draft.lng!) : _defaultCenter;

    return ListView(
      padding: const EdgeInsets.all(AppSpacing.lg),
      children: [
        AppTextField(
          hint: 'Search an address…',
          prefixIcon: Icons.search_rounded,
          controller: _searchController,
          onChanged: _onSearchChanged,
        ),
        if (_searching) const Padding(padding: EdgeInsets.only(top: AppSpacing.sm), child: LinearProgressIndicator(minHeight: 2)),
        if (_results.isNotEmpty)
          Container(
            margin: const EdgeInsets.only(top: AppSpacing.sm),
            decoration: BoxDecoration(border: Border.all(color: AppColors.slate200), borderRadius: BorderRadius.circular(10)),
            child: Column(
              children: [
                for (final result in _results)
                  ListTile(
                    dense: true,
                    leading: const Icon(Icons.location_on_outlined, size: 18, color: AppColors.slate400),
                    title: Text(result.displayName ?? result.address ?? '', maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12.5)),
                    onTap: () => _applyResult(result),
                  ),
              ],
            ),
          ),
        const SizedBox(height: AppSpacing.lg),
        const Text('Tap the map to drop a pin (auto-fills the address)', style: TextStyle(color: AppColors.slate500, fontSize: 12)),
        const SizedBox(height: AppSpacing.sm),
        ClipRRect(
          borderRadius: BorderRadius.circular(AppRadius.lg),
          child: SizedBox(
            height: 220,
            child: FlutterMap(
              mapController: _mapController,
              options: MapOptions(initialCenter: center, initialZoom: draft.lat != null ? 15 : 4, onTap: (_, point) => _onMapTap(point)),
              children: [
                TileLayer(urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', userAgentPackageName: 'com.realvista.crm'),
                if (draft.lat != null && draft.lng != null)
                  MarkerLayer(markers: [Marker(point: LatLng(draft.lat!, draft.lng!), width: 36, height: 36, child: const Icon(Icons.location_on_rounded, color: AppColors.rose600, size: 32))]),
                const SimpleAttributionWidget(source: Text('OpenStreetMap contributors')),
              ],
            ),
          ),
        ),
        const SizedBox(height: AppSpacing.xl),
        AppTextField(key: const Key('listing-address-field'), label: 'Address *', controller: _addressController, onChanged: (v) => draft.update(() => draft.address = v)),
        const SizedBox(height: AppSpacing.lg),
        Row(
          children: [
            Expanded(child: AppTextField(label: 'City', controller: _cityController, onChanged: (v) => draft.update(() => draft.city = v))),
            const SizedBox(width: AppSpacing.md),
            Expanded(child: AppTextField(label: 'Locality', controller: _localityController, onChanged: (v) => draft.update(() => draft.locality = v))),
          ],
        ),
      ],
    );
  }
}
