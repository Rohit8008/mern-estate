import 'package:flutter/foundation.dart';

import '../../properties/domain/listing.dart';

/// Only 'sale'/'rent' are accepted by the backend's create/update Joi schema
/// (the Listing model's own enum also allows 'lease', but submitting it
/// would be rejected — so the form only offers what actually works).
const listingFormTypes = ['sale', 'rent'];

/// Only these four are Joi-`valid()` for propertyCategory on create/update,
/// confirmed by reading the validation schema directly — not the broader
/// set in the Listing model's own enum.
const listingFormCategories = ['residential', 'commercial', 'land', 'unknown'];

String listingCategoryLabel(String category) => category == 'unknown' ? 'Other / Unspecified' : category[0].toUpperCase() + category.substring(1);

/// Mutable, screen-scoped draft for the create/edit wizard — a form this
/// size (25+ fields across 6 steps) is far more legible as a plain mutable
/// holder edited step by step (mirrors the desktop's single `formData`
/// object) than an immutable class fighting a 25-argument copyWith.
///
/// Deliberately drives off PropertyType + propertyTypeFields only — the
/// "primary" dynamic-field system per the backend research (it's what
/// derives propertyCategory/bedrooms/bathrooms on desktop, and what the
/// Properties feature already resolves labels against). Category/attributes
/// is a fully optional secondary overlay server-side — skipping it here
/// skips no required validation, since the server only validates attributes
/// at all `if (req.body.category)` is present.
class ListingDraft extends ChangeNotifier {
  ListingDraft.blank() : existingId = null;

  ListingDraft.fromListing(Listing l)
      : existingId = l.id,
        name = l.name,
        description = l.description ?? '',
        type = listingFormTypes.contains(l.type) ? l.type : 'sale',
        propertyCategory = listingFormCategories.contains(l.propertyCategory) ? l.propertyCategory! : 'unknown',
        propertyType = l.propertyType,
        propertyTypeFields = Map<String, dynamic>.from(l.propertyTypeFields),
        bedrooms = l.bedrooms,
        bathrooms = l.bathrooms,
        furnished = l.furnished,
        parking = l.parking,
        address = l.address ?? '',
        city = l.city ?? '',
        locality = l.locality ?? '',
        lat = l.lat,
        lng = l.lng,
        regularPrice = l.regularPrice,
        offer = l.offer,
        discountPrice = l.discountPrice,
        areaSqFt = l.areaSqFt,
        plotSize = l.plotSize ?? '',
        propertyNo = l.propertyNo ?? '',
        remarks = l.remarks ?? '',
        ownerIds = l.owners.map((o) => o.id).toList(),
        imageUrls = List<String>.from(l.imageUrls);

  final String? existingId;
  bool get isEditing => existingId != null;

  String name = '';
  String description = '';
  String type = 'sale';
  String propertyCategory = 'residential';
  String? propertyType;
  Map<String, dynamic> propertyTypeFields = {};

  int bedrooms = 1;
  int bathrooms = 1;
  bool furnished = false;
  bool parking = false;

  String address = '';
  String city = '';
  String locality = '';
  double? lat;
  double? lng;

  num regularPrice = 0;
  bool offer = false;
  num discountPrice = 0;
  num? areaSqFt;
  String plotSize = '';
  String propertyNo = '';
  String remarks = '';

  List<String> ownerIds = [];
  List<String> imageUrls = [];

  void update(void Function() mutator) {
    mutator();
    notifyListeners();
  }

  String? validateStep1() {
    if (name.trim().length < 3) return 'Name must be at least 3 characters.';
    if (propertyCategory == 'residential' && (bedrooms < 1 || bathrooms < 1)) {
      return 'Residential listings need at least 1 bedroom and bathroom.';
    }
    return null;
  }

  String? validateStep2() {
    if (address.trim().length < 5) return 'Address must be at least 5 characters.';
    return null;
  }

  String? validateStep3() {
    if (regularPrice <= 0) return 'Enter a valid price.';
    if (offer && discountPrice > 0 && discountPrice >= regularPrice) return 'Discount price must be less than the regular price.';
    return null;
  }

  Map<String, dynamic> toPayload() {
    return {
      'name': name.trim(),
      'description': description.trim(),
      'type': type,
      'propertyCategory': propertyCategory,
      if (propertyType != null && propertyType!.isNotEmpty) 'propertyType': propertyType,
      if (propertyTypeFields.isNotEmpty) 'propertyTypeFields': propertyTypeFields,
      'bedrooms': propertyCategory == 'residential' ? bedrooms : 0,
      'bathrooms': propertyCategory == 'residential' ? bathrooms : 0,
      'furnished': furnished,
      'parking': parking,
      'address': address.trim(),
      if (city.trim().isNotEmpty) 'city': city.trim(),
      if (locality.trim().isNotEmpty) 'locality': locality.trim(),
      if (lat != null && lng != null) 'location': {'lat': lat, 'lng': lng},
      'regularPrice': regularPrice,
      'offer': offer,
      if (offer) 'discountPrice': discountPrice,
      if (areaSqFt != null) 'areaSqFt': areaSqFt,
      if (plotSize.trim().isNotEmpty) 'plotSize': plotSize.trim(),
      if (propertyNo.trim().isNotEmpty) 'propertyNo': propertyNo.trim(),
      if (remarks.trim().isNotEmpty) 'remarks': remarks.trim(),
      if (ownerIds.isNotEmpty) 'ownerIds': ownerIds,
      'imageUrls': imageUrls,
    };
  }
}
