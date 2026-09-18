/// Shape returned by GET /api/geocode/search (array) and
/// /api/geocode/reverse (single object) — both proxy Nominatim server-side.
class GeocodeResult {
  const GeocodeResult({required this.lat, required this.lng, this.address, this.city, this.locality, this.state, this.pincode, this.displayName});

  final double lat;
  final double lng;
  final String? address;
  final String? city;
  final String? locality;
  final String? state;
  final String? pincode;
  final String? displayName;

  factory GeocodeResult.fromJson(Map<String, dynamic> json) => GeocodeResult(
        lat: (json['lat'] as num).toDouble(),
        lng: (json['lng'] as num).toDouble(),
        address: json['address'] as String?,
        city: json['city'] as String?,
        locality: json['locality'] as String?,
        state: json['state'] as String?,
        pincode: json['pincode'] as String?,
        displayName: json['displayName'] as String?,
      );
}
