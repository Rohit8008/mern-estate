class FollowUp {
  const FollowUp({required this.id, required this.dueAt, required this.type, this.notes, required this.completed, this.completedAt});

  final String id;
  final DateTime dueAt;
  final String type;
  final String? notes;
  final bool completed;
  final DateTime? completedAt;

  factory FollowUp.fromJson(Map<String, dynamic> json) => FollowUp(
        id: json['_id'] as String? ?? '',
        dueAt: DateTime.tryParse(json['dueAt'] as String? ?? '') ?? DateTime.now(),
        type: json['type'] as String? ?? 'call',
        notes: json['notes'] as String?,
        completed: json['completed'] as bool? ?? false,
        completedAt: DateTime.tryParse(json['completedAt'] as String? ?? ''),
      );
}

const followUpTypes = ['call', 'email', 'meeting', 'site_visit', 'whatsapp', 'other'];

String followUpTypeLabel(String type) => switch (type) {
      'call' => 'Call',
      'email' => 'Email',
      'meeting' => 'Meeting',
      'site_visit' => 'Site Visit',
      'whatsapp' => 'WhatsApp',
      _ => 'Other',
    };
