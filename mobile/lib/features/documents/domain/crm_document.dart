/// Mirrors backend/models/document.model.js — polymorphic (kind: 'client' |
/// 'listing', with exactly one of clientId/listingId set), attached to a
/// Lead or a Property. `url` is a full absolute URL already (built
/// server-side from the upload request's own host), not a relative path.
class CrmDocument {
  const CrmDocument({
    required this.id,
    required this.title,
    required this.filename,
    required this.mimeType,
    required this.size,
    required this.url,
    this.tags = const [],
    this.createdAt,
  });

  final String id;
  final String title;
  final String filename;
  final String mimeType;
  final int size;
  final String url;
  final List<String> tags;
  final DateTime? createdAt;

  bool get isImage => mimeType.startsWith('image/');

  factory CrmDocument.fromJson(Map<String, dynamic> json) => CrmDocument(
        id: json['_id'] as String? ?? '',
        title: json['title'] as String? ?? json['filename'] as String? ?? 'Untitled document',
        filename: json['filename'] as String? ?? '',
        mimeType: json['mimeType'] as String? ?? 'application/octet-stream',
        size: (json['size'] as num?)?.toInt() ?? 0,
        url: json['url'] as String? ?? '',
        tags: ((json['tags'] as List?) ?? const []).cast<String>(),
        createdAt: DateTime.tryParse(json['createdAt'] as String? ?? ''),
      );
}

String formatFileSize(int bytes) {
  if (bytes < 1024) return '$bytes B';
  if (bytes < 1024 * 1024) return '${(bytes / 1024).toStringAsFixed(0)} KB';
  return '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB';
}
