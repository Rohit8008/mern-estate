/// Mirrors backend/models/listing.model.js. `attributes` (keyed by Category)
/// and `propertyTypeFields` (keyed by PropertyType) are the two parallel
/// dynamic-field systems — kept as raw maps and resolved against
/// Category/PropertyType field definitions at render time (see
/// taxonomy_api.dart), exactly like Listing.jsx does on the web.
class Listing {
  const Listing({
    required this.id,
    required this.name,
    this.description,
    this.address,
    this.city,
    this.locality,
    required this.regularPrice,
    required this.discountPrice,
    required this.offer,
    required this.type,
    required this.status,
    required this.bedrooms,
    required this.bathrooms,
    required this.furnished,
    required this.parking,
    this.imageUrls = const [],
    this.lat,
    this.lng,
    this.category,
    this.propertyType,
    this.propertyCategory,
    this.areaSqFt,
    this.areaName,
    this.plotSize,
    this.propertyNo,
    this.remarks,
    this.otherAttachment,
    this.attributes = const {},
    this.propertyTypeFields = const {},
    this.owner,
    this.owners = const [],
    this.assignedAgentUsername,
    this.createdAt,
  });

  final String id;
  final String name;
  final String? description;
  final String? address;
  final String? city;
  final String? locality;
  final num regularPrice;
  final num discountPrice;
  final bool offer;
  final String type;
  final String status;
  final int bedrooms;
  final int bathrooms;
  final bool furnished;
  final bool parking;
  final List<String> imageUrls;
  final double? lat;
  final double? lng;
  final String? category;
  final String? propertyType;
  final String? propertyCategory;
  final num? areaSqFt;
  final String? areaName;
  final String? plotSize;
  final String? propertyNo;
  final String? remarks;
  final String? otherAttachment;
  final Map<String, dynamic> attributes;
  final Map<String, dynamic> propertyTypeFields;
  final ListingPersonRef? owner;
  final List<OwnerCard> owners;
  final String? assignedAgentUsername;
  final DateTime? createdAt;

  /// The price to actually show — discounted price when an offer is active.
  num get displayPrice => (offer && discountPrice > 0) ? discountPrice : regularPrice;

  String? get coverImage => imageUrls.isNotEmpty ? imageUrls.first : null;

  factory Listing.fromJson(Map<String, dynamic> json) {
    final location = json['location'] as Map<String, dynamic>?;
    final ownerJson = json['owner'] as Map<String, dynamic>?;
    final ownersJson = json['owners'] as List? ?? const [];
    final agent = json['assignedAgent'];

    return Listing(
      id: (json['_id'] ?? json['id']) as String,
      name: json['name'] as String? ?? 'Untitled listing',
      description: json['description'] as String?,
      address: json['address'] as String?,
      city: json['city'] as String?,
      locality: json['locality'] as String?,
      regularPrice: (json['regularPrice'] as num?) ?? 0,
      discountPrice: (json['discountPrice'] as num?) ?? 0,
      offer: json['offer'] as bool? ?? false,
      type: json['type'] as String? ?? 'sale',
      status: json['status'] as String? ?? 'available',
      bedrooms: (json['bedrooms'] as num?)?.toInt() ?? 0,
      bathrooms: (json['bathrooms'] as num?)?.toInt() ?? 0,
      furnished: json['furnished'] as bool? ?? false,
      parking: json['parking'] as bool? ?? false,
      imageUrls: ((json['imageUrls'] as List?) ?? const []).cast<String>(),
      lat: (location?['lat'] as num?)?.toDouble(),
      lng: (location?['lng'] as num?)?.toDouble(),
      category: json['category'] as String?,
      propertyType: json['propertyType'] as String?,
      propertyCategory: json['propertyCategory'] as String?,
      areaSqFt: json['areaSqFt'] as num?,
      areaName: json['areaName'] as String?,
      plotSize: json['plotSize'] as String?,
      propertyNo: json['propertyNo'] as String?,
      remarks: json['remarks'] as String?,
      otherAttachment: json['otherAttachment'] as String?,
      attributes: (json['attributes'] as Map?)?.cast<String, dynamic>() ?? const {},
      propertyTypeFields: (json['propertyTypeFields'] as Map?)?.cast<String, dynamic>() ?? const {},
      owner: ownerJson != null ? ListingPersonRef.fromJson(ownerJson) : null,
      owners: ownersJson.map((e) => OwnerCard.fromJson(e as Map<String, dynamic>)).toList(),
      assignedAgentUsername: agent is Map<String, dynamic> ? agent['username'] as String? : null,
      createdAt: DateTime.tryParse(json['createdAt'] as String? ?? ''),
    );
  }
}

class ListingPersonRef {
  const ListingPersonRef({required this.id, required this.username, this.avatar});
  final String id;
  final String username;
  final String? avatar;

  factory ListingPersonRef.fromJson(Map<String, dynamic> json) => ListingPersonRef(
        id: json['_id'] as String? ?? '',
        username: json['username'] as String? ?? 'Unknown',
        avatar: json['avatar'] as String?,
      );
}

class OwnerCard {
  const OwnerCard({required this.id, required this.name, this.companyName, this.email, this.phone});
  final String id;
  final String name;
  final String? companyName;
  final String? email;
  final String? phone;

  factory OwnerCard.fromJson(Map<String, dynamic> json) => OwnerCard(
        id: json['_id'] as String? ?? '',
        name: json['name'] as String? ?? 'Unknown owner',
        companyName: json['companyName'] as String?,
        email: json['email'] as String?,
        phone: json['phone'] as String?,
      );
}

const listingStatusOrder = ['available', 'under_negotiation', 'sold', 'rented'];
const listingTypes = ['sale', 'rent', 'lease'];

String listingStatusLabel(String status) =>
    status.split('_').map((w) => w.isEmpty ? w : '${w[0].toUpperCase()}${w.substring(1)}').join(' ');
