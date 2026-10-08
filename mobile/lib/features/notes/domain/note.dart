/// A personal quick-capture note: a text jot and/or a voice memo.
class Note {
  const Note({
    required this.id,
    required this.text,
    required this.audioUrl,
    required this.audioDuration,
    required this.createdAt,
    this.createdListingId,
    this.createdListingName,
  });

  final String id;
  final String text;
  final String audioUrl;
  final int audioDuration; // seconds
  final DateTime? createdAt;
  final String? createdListingId;
  final String? createdListingName;

  bool get hasAudio => audioUrl.isNotEmpty;

  factory Note.fromJson(Map<String, dynamic> json) {
    final cl = json['createdListing'];
    return Note(
      id: (json['_id'] ?? json['id']) as String,
      text: json['text'] as String? ?? '',
      audioUrl: json['audioUrl'] as String? ?? '',
      audioDuration: (json['audioDuration'] as num?)?.toInt() ?? 0,
      createdAt: json['createdAt'] != null ? DateTime.tryParse(json['createdAt'] as String) : null,
      createdListingId: cl is Map ? cl['_id'] as String? : (cl is String ? cl : null),
      createdListingName: cl is Map ? cl['name'] as String? : null,
    );
  }
}
