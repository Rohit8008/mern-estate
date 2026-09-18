/// Shared shape for Category.fields[] and PropertyType.fields[] item schemas
/// — close enough between the two (both have key/label/type/unit/order) that
/// one class covers both, mirroring how Listing.jsx resolves attributes vs
/// propertyTypeFields with the same generic label/unit lookup logic. Also
/// doubles as the input-rendering spec for the create/edit form (type,
/// options, required, min/max) — PropertyType's own field schema has no
/// `showWhen`/`pattern`/`multiple` (that's Category-only, and the form
/// doesn't drive off Category — see listing_draft.dart), so this only
/// carries what PropertyType.fields[] actually has.
class FieldDefinition {
  const FieldDefinition({
    required this.key,
    required this.label,
    this.unit,
    required this.order,
    this.type = 'text',
    this.required = false,
    this.options = const [],
    this.min,
    this.max,
    this.placeholder,
  });

  final String key;
  final String label;
  final String? unit;
  final int order;
  final String type; // text|textarea|number|select|boolean|date
  final bool required;
  final List<String> options;
  final num? min;
  final num? max;
  final String? placeholder;

  factory FieldDefinition.fromJson(Map<String, dynamic> json) => FieldDefinition(
        key: json['key'] as String? ?? '',
        label: json['label'] as String? ?? json['key'] as String? ?? '',
        unit: json['unit'] as String?,
        order: (json['order'] as num?)?.toInt() ?? 0,
        type: json['type'] as String? ?? 'text',
        required: json['required'] as bool? ?? false,
        options: ((json['options'] as List?) ?? const []).cast<String>(),
        min: json['min'] as num?,
        max: json['max'] as num?,
        placeholder: json['placeholder'] as String?,
      );
}

class PropertyCategory {
  const PropertyCategory({required this.id, required this.name, required this.slug, this.fields = const []});

  final String id;
  final String name;
  final String slug;
  final List<FieldDefinition> fields;

  factory PropertyCategory.fromJson(Map<String, dynamic> json) => PropertyCategory(
        id: json['_id'] as String? ?? '',
        name: json['name'] as String? ?? '',
        slug: json['slug'] as String? ?? '',
        fields: ((json['fields'] as List?) ?? const []).map((e) => FieldDefinition.fromJson(e as Map<String, dynamic>)).toList(),
      );
}

class PropertyTypeDef {
  const PropertyTypeDef({required this.id, required this.name, required this.slug, this.icon, this.fields = const []});

  final String id;
  final String name;
  final String slug;
  final String? icon;
  final List<FieldDefinition> fields;

  factory PropertyTypeDef.fromJson(Map<String, dynamic> json) => PropertyTypeDef(
        id: json['_id'] as String? ?? '',
        name: json['name'] as String? ?? '',
        slug: json['slug'] as String? ?? '',
        icon: json['icon'] as String?,
        fields: ((json['fields'] as List?) ?? const []).map((e) => FieldDefinition.fromJson(e as Map<String, dynamic>)).toList(),
      );
}

/// Humanizes a raw field key when no matching FieldDefinition is found —
/// e.g. 'plotFacing' -> 'Plot Facing' — same fallback Listing.jsx uses.
String humanizeFieldKey(String key) {
  final withSpaces = key.replaceAllMapped(RegExp(r'([a-z0-9])([A-Z])'), (m) => '${m[1]} ${m[2]}');
  return withSpaces.isEmpty ? key : '${withSpaces[0].toUpperCase()}${withSpaces.substring(1)}';
}

/// Formats a dynamic attribute value for display — booleans as Yes/No,
/// lists joined, everything else as its string form.
String formatFieldValue(dynamic value) {
  if (value == null) return '—';
  if (value is bool) return value ? 'Yes' : 'No';
  if (value is List) return value.map((e) => e.toString()).join(', ');
  return value.toString();
}
