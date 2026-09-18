/// Mirrors backend/models/task.model.js. `relatedClientId`/`relatedListingId`
/// implement the polymorphic `related` field — only one is populated,
/// matching `relatedKind`.
class CrmTask {
  const CrmTask({
    required this.id,
    required this.title,
    this.description,
    this.dueAt,
    required this.status,
    required this.priority,
    this.relatedKind,
    this.relatedClientId,
    this.relatedListingId,
  });

  final String id;
  final String title;
  final String? description;
  final DateTime? dueAt;
  final String status;
  final String priority;
  final String? relatedKind;
  final String? relatedClientId;
  final String? relatedListingId;

  factory CrmTask.fromJson(Map<String, dynamic> json) {
    final related = json['related'] as Map<String, dynamic>? ?? const {};
    return CrmTask(
      id: (json['_id'] ?? json['id']) as String,
      title: json['title'] as String? ?? 'Untitled task',
      description: json['description'] as String?,
      dueAt: DateTime.tryParse(json['dueAt'] as String? ?? ''),
      status: json['status'] as String? ?? 'todo',
      priority: json['priority'] as String? ?? 'medium',
      relatedKind: related['kind'] as String?,
      relatedClientId: related['clientId'] as String?,
      relatedListingId: related['listingId'] as String?,
    );
  }
}

const taskStatuses = ['todo', 'in_progress', 'review', 'done', 'blocked'];
const taskPriorities = ['low', 'medium', 'high', 'urgent'];

String taskStatusLabel(String status) =>
    status.split('_').map((w) => w.isEmpty ? w : '${w[0].toUpperCase()}${w.substring(1)}').join(' ');
