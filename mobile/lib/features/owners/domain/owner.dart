/// Mirrors backend/models/owner.model.js — a flat contact record for
/// whoever owns a listed property (landlord/seller of record). No
/// pipeline/deals — that's Client (Leads), a deliberately separate entity.
class PropertyOwner {
  const PropertyOwner({
    required this.id,
    required this.name,
    this.email,
    this.phone,
    this.companyName,
    this.addressLine1,
    this.addressLine2,
    this.city,
    this.state,
    this.postalCode,
    this.country,
    this.notes,
    required this.active,
  });

  final String id;
  final String name;
  final String? email;
  final String? phone;
  final String? companyName;
  final String? addressLine1;
  final String? addressLine2;
  final String? city;
  final String? state;
  final String? postalCode;
  final String? country;
  final String? notes;
  final bool active;

  factory PropertyOwner.fromJson(Map<String, dynamic> json) => PropertyOwner(
        id: (json['_id'] ?? json['id']) as String,
        name: json['name'] as String? ?? 'Unnamed owner',
        email: json['email'] as String?,
        phone: json['phone'] as String?,
        companyName: json['companyName'] as String?,
        addressLine1: json['addressLine1'] as String?,
        addressLine2: json['addressLine2'] as String?,
        city: json['city'] as String?,
        state: json['state'] as String?,
        postalCode: json['postalCode'] as String?,
        country: json['country'] as String?,
        notes: json['notes'] as String?,
        active: json['active'] as bool? ?? true,
      );
}
