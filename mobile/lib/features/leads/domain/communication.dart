class Communication {
  const Communication({
    required this.id,
    required this.type,
    required this.direction,
    required this.summary,
    this.details,
    this.durationMinutes,
    this.outcome,
    this.createdAt,
  });

  final String id;
  final String type;
  final String direction;
  final String summary;
  final String? details;
  final num? durationMinutes;
  final String? outcome;
  final DateTime? createdAt;

  factory Communication.fromJson(Map<String, dynamic> json) => Communication(
        id: json['_id'] as String? ?? '',
        type: json['type'] as String? ?? 'note',
        direction: json['direction'] as String? ?? 'outbound',
        summary: json['summary'] as String? ?? '',
        details: json['details'] as String?,
        durationMinutes: json['duration'] as num?,
        outcome: json['outcome'] as String?,
        createdAt: DateTime.tryParse(json['createdAt'] as String? ?? ''),
      );
}

const communicationTypes = ['call', 'email', 'sms', 'meeting', 'whatsapp', 'site_visit', 'note'];
const communicationDirections = ['outbound', 'inbound'];

String communicationTypeLabel(String type) => switch (type) {
      'call' => 'Call',
      'email' => 'Email',
      'sms' => 'SMS',
      'meeting' => 'Meeting',
      'whatsapp' => 'WhatsApp',
      'site_visit' => 'Site Visit',
      _ => 'Note',
    };
