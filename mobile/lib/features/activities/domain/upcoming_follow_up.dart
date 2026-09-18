/// Item shape from GET /api/crm/follow-ups/upcoming — a follow-up
/// flattened out of whichever Client it lives on, with client context
/// attached (clientId/clientName) since this view spans all leads.
class UpcomingFollowUp {
  const UpcomingFollowUp({
    required this.followUpId,
    required this.clientId,
    required this.clientName,
    this.clientPhone,
    required this.dueAt,
    required this.type,
    this.notes,
    required this.isOverdue,
    required this.isDueToday,
  });

  final String followUpId;
  final String clientId;
  final String clientName;
  final String? clientPhone;
  final DateTime dueAt;
  final String type;
  final String? notes;
  final bool isOverdue;
  final bool isDueToday;

  factory UpcomingFollowUp.fromJson(Map<String, dynamic> json) => UpcomingFollowUp(
        followUpId: json['followUpId'] as String? ?? '',
        clientId: json['clientId'] as String? ?? '',
        clientName: json['clientName'] as String? ?? 'Unknown lead',
        clientPhone: json['clientPhone'] as String?,
        dueAt: DateTime.tryParse(json['dueAt'] as String? ?? '') ?? DateTime.now(),
        type: json['type'] as String? ?? 'call',
        notes: json['notes'] as String?,
        isOverdue: json['isOverdue'] as bool? ?? false,
        isDueToday: json['isDueToday'] as bool? ?? false,
      );
}
