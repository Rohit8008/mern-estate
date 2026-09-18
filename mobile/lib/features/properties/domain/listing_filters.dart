/// Query params for GET /api/listing/get and /api/listing/my-assigned —
/// both endpoints share this filter surface per PropertiesBoard.jsx.
class ListingFilters {
  const ListingFilters({
    this.searchTerm,
    this.type,
    this.propertyCategory,
    this.city,
    this.status,
    this.minPrice,
    this.maxPrice,
    this.minBedrooms,
    this.minBathrooms,
  });

  final String? searchTerm;
  final String? type;
  final String? propertyCategory;
  final String? city;
  final String? status;
  final num? minPrice;
  final num? maxPrice;
  final int? minBedrooms;
  final int? minBathrooms;

  bool get isEmpty =>
      searchTerm == null &&
      type == null &&
      propertyCategory == null &&
      city == null &&
      status == null &&
      minPrice == null &&
      maxPrice == null &&
      minBedrooms == null &&
      minBathrooms == null;

  ListingFilters copyWith({
    String? searchTerm,
    String? type,
    String? propertyCategory,
    String? city,
    String? status,
    num? minPrice,
    num? maxPrice,
    int? minBedrooms,
    int? minBathrooms,
  }) =>
      ListingFilters(
        searchTerm: searchTerm ?? this.searchTerm,
        type: type ?? this.type,
        propertyCategory: propertyCategory ?? this.propertyCategory,
        city: city ?? this.city,
        status: status ?? this.status,
        minPrice: minPrice ?? this.minPrice,
        maxPrice: maxPrice ?? this.maxPrice,
        minBedrooms: minBedrooms ?? this.minBedrooms,
        minBathrooms: minBathrooms ?? this.minBathrooms,
      );

  Map<String, dynamic> toQueryParams() => {
        if (searchTerm != null && searchTerm!.isNotEmpty) 'searchTerm': searchTerm,
        if (type != null) 'type': type,
        if (propertyCategory != null) 'propertyCategory': propertyCategory,
        if (city != null && city!.isNotEmpty) 'city': city,
        if (status != null) 'status': status,
        if (minPrice != null) 'minPrice': minPrice.toString(),
        if (maxPrice != null) 'maxPrice': maxPrice.toString(),
        if (minBedrooms != null) 'minBedrooms': minBedrooms.toString(),
        if (minBathrooms != null) 'minBathrooms': minBathrooms.toString(),
      };
}

const propertyCategories = ['residential', 'commercial', 'land', 'industrial', 'other'];
