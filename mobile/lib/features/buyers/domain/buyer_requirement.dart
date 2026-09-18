/// Mirrors backend/models/buyerRequirement.model.js — demand-side matching
/// record (what a buyer/tenant wants), distinct from Client (a sales-lead
/// pipeline record) even though both represent a person.
class BuyerRequirement {
  const BuyerRequirement({
    required this.id,
    required this.buyerName,
    this.buyerEmail,
    this.buyerPhone,
    this.preferredLocation,
    this.preferredCity,
    required this.propertyType,
    required this.propertyTypeInterest,
    this.minPrice,
    this.maxPrice,
    this.minBedrooms,
    this.minBathrooms,
    this.additionalRequirements,
    required this.status,
    required this.priority,
    this.budget,
    this.timeline,
    this.createdAt,
  });

  final String id;
  final String buyerName;
  final String? buyerEmail;
  final String? buyerPhone;
  final String? preferredLocation;
  final String? preferredCity;
  final String propertyType;
  final String propertyTypeInterest;
  final num? minPrice;
  final num? maxPrice;
  final int? minBedrooms;
  final int? minBathrooms;
  final String? additionalRequirements;
  final String status;
  final String priority;
  final String? budget;
  final String? timeline;
  final DateTime? createdAt;

  factory BuyerRequirement.fromJson(Map<String, dynamic> json) => BuyerRequirement(
        id: (json['_id'] ?? json['id']) as String,
        buyerName: json['buyerName'] as String? ?? 'Unnamed buyer',
        buyerEmail: json['buyerEmail'] as String?,
        buyerPhone: json['buyerPhone'] as String?,
        preferredLocation: json['preferredLocation'] as String?,
        preferredCity: json['preferredCity'] as String?,
        propertyType: json['propertyType'] as String? ?? 'sale',
        propertyTypeInterest: json['propertyTypeInterest'] as String? ?? 'any',
        minPrice: json['minPrice'] as num?,
        maxPrice: json['maxPrice'] as num?,
        minBedrooms: (json['minBedrooms'] as num?)?.toInt(),
        minBathrooms: (json['minBathrooms'] as num?)?.toInt(),
        additionalRequirements: json['additionalRequirements'] as String?,
        status: json['status'] as String? ?? 'active',
        priority: json['priority'] as String? ?? 'medium',
        budget: json['budget'] as String?,
        timeline: json['timeline'] as String?,
        createdAt: DateTime.tryParse(json['createdAt'] as String? ?? ''),
      );
}

const buyerRequirementStatuses = ['active', 'matched', 'closed', 'inactive'];
const buyerRequirementTransactionTypes = ['sale', 'rent'];
const buyerRequirementInterests = ['residential', 'commercial', 'land', 'any'];

String buyerStatusLabel(String status) => status[0].toUpperCase() + status.substring(1);
