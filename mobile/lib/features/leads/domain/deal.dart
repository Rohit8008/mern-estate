/// Embedded sub-document on Client.deals[] (backend/models/client.model.js)
/// — a deal lives inside its lead's pipeline until closed_won/closed_lost,
/// at which point the backend auto-creates a Transaction. Distinct from
/// Transaction (the post-close financial ledger row).
class Deal {
  const Deal({
    required this.id,
    this.listingId,
    required this.stage,
    required this.value,
    required this.type,
    this.expectedCloseDate,
    required this.commissionPercentage,
    required this.commissionAmount,
    required this.commissionStatus,
    this.notes,
  });

  final String id;
  final String? listingId;
  final String stage;
  final num value;
  final String type;
  final DateTime? expectedCloseDate;
  final num commissionPercentage;
  final num commissionAmount;
  final String commissionStatus;
  final String? notes;

  factory Deal.fromJson(Map<String, dynamic> json) {
    final commission = json['commission'] as Map<String, dynamic>? ?? const {};
    return Deal(
      id: json['_id'] as String? ?? '',
      listingId: json['listingId'] as String?,
      stage: json['stage'] as String? ?? 'new_lead',
      value: (json['value'] as num?) ?? 0,
      type: json['type'] as String? ?? 'sale',
      expectedCloseDate: DateTime.tryParse(json['expectedCloseDate'] as String? ?? ''),
      commissionPercentage: (commission['percentage'] as num?) ?? 0,
      commissionAmount: (commission['amount'] as num?) ?? 0,
      commissionStatus: commission['status'] as String? ?? 'pending',
      notes: json['notes'] as String?,
    );
  }
}

/// Mirrors the professional stage enum in client.model.js (legacy stages
/// omitted — new deals are always created in one of these).
const dealStageOrder = [
  'new_lead',
  'contacted',
  'qualified',
  'site_visit_scheduled',
  'negotiation',
  'booking_token',
  'documentation',
  'closed_won',
  'closed_lost',
];

String dealStageLabel(String stage) =>
    stage.split('_').map((w) => w.isEmpty ? w : '${w[0].toUpperCase()}${w.substring(1)}').join(' ');

const dealTypes = ['sale', 'rent', 'lease'];
